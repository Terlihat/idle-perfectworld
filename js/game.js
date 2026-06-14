// ==========================================
// 1. IMPORT FIREBASE & MODUL KUSTOM
// ==========================================
import { db, auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, getDoc, onSnapshot, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

import { buyEquipment } from './modules/shop.js';
import { listenToChat, sendChat } from './modules/chat.js';
import { buyPotion, listenToMailbox } from './modules/apothecary.js';
import { buyMallItem } from './modules/mall.js'; // Menggunakan fungsi universal mall
import { depositGold, withdrawGold, depositItem, withdrawItem } from './modules/bank.js';

let currentUserUid = null;
let isCooldown = false;
let activeUnsubscribeListeners = [];
let currentAccuracy = 0;
let inventoryMode = "EQUIP"; 
let playerUsername = "Hero Anonim";

// ==========================================
// 2. DATABASE ITEM
// ==========================================
const ITEM_DB = {
    "Pedang Besi": { type: "weapon", patk: 30, sellValue: 1000 },
    "Tongkat Sihir": { type: "weapon", matk: 30, sellValue: 1000 },
    "Zirah Kulit": { type: "armor", def: 20, sellValue: 1000 },
    "Cincin Akurat": { type: "accessory", accBonus: 10, sellValue: 1500 },
    
    "Pedang Darah (Rare)": { type: "weapon", patk: 65, sellValue: 4000 },
    "Tongkat Abyss (Rare)": { type: "weapon", matk: 65, sellValue: 4000 },
    "Zirah Naga (Rare)": { type: "armor", def: 45, sellValue: 4000 },
    "Mata Iblis (Rare)": { type: "accessory", accBonus: 25, sellValue: 5000 },

    "Ramuan HP": { type: "consumable", sellValue: 250 },
    "Ramuan MP": { type: "consumable", sellValue: 250 },
    "Batu Dungeon": { type: "loot", sellValue: 300 },
    
    // ITEM MALL & BATU TEMPA (PERFECT WORLD)
    "Mirage Stone": { type: "catalyst", sellValue: 0 },
    "Heaven Stone": { type: "catalyst", sellValue: 0 },
    "Underworld Stone": { type: "catalyst", sellValue: 0 },
    "Universal Stone": { type: "catalyst", sellValue: 0 },
    "Tiket Ubah Job": { type: "special", sellValue: 0 },
    "Tiket Ganti Nama": { type: "special", sellValue: 0 }
};

// Tabel Probabilitas Tempa Perfect World (+1 hingga +10)
const REFINE_RATES = {
    // Array Index [0] adalah peluang dari +0 menuju +1. Index [7] adalah peluang dari +7 ke +8
    "Mirage Stone":     [0.500, 0.300, 0.300, 0.300, 0.300, 0.300, 0.300, 0.300, 0.150, 0.050],
    "Heaven Stone":     [0.650, 0.450, 0.450, 0.450, 0.450, 0.450, 0.450, 0.450, 0.200, 0.100],
    "Underworld Stone": [0.533, 0.335, 0.335, 0.335, 0.335, 0.335, 0.335, 0.335, 0.150, 0.050],
    "Universal Stone":  [1.000, 0.250, 0.100, 0.040, 0.020, 0.008, 0.005, 0.003, 0.001, 0.000]
};

// ==========================================
// 3. UTILITAS DASAR
// ==========================================
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    document.getElementById(screenId).style.display = 'block';
}

function escapeHTML(str) {
    return str ? str.toString().replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])) : "";
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUserUid = user.uid;
        const docSnap = await getDoc(doc(db, "users", currentUserUid));
        if (!docSnap.exists() || !docSnap.data().characterClass) {
            showScreen('screen-char-select');
        } else {
            showScreen('screen-game');
            startLiveGameSync();
        }
    } else {
        currentUserUid = null;
        activeUnsubscribeListeners.forEach(unsub => unsub());
        activeUnsubscribeListeners = [];
        showScreen('screen-auth');
    }
});

function startLiveGameSync() {
    listenToPlayerData(); 
    
    const unsubChat = listenToChat(db, (messages) => {
        const chatBox = document.getElementById('chat-box');
        chatBox.innerHTML = "";
        messages.forEach(m => {
            chatBox.innerHTML += `<div><span class="chat-name">${escapeHTML(m.username)}</span>: ${escapeHTML(m.text)}</div>`;
        });
        chatBox.scrollTop = chatBox.scrollHeight;
    });

    const unsubMail = listenToMailbox(db, currentUserUid, (mails) => {
        const mailDiv = document.getElementById('mailbox-list');
        mailDiv.innerHTML = mails.length === 0 ? "Tidak ada surat." : "";
        mails.forEach(mail => {
            mailDiv.innerHTML += `<div style="border-bottom:1px solid #333; padding:2px 0;">📬 ${escapeHTML(mail.title)}</div>`;
        });
    });

    activeUnsubscribeListeners.push(unsubChat, unsubMail);
}

// ==========================================
// 4. RENDERING DATA
// ==========================================
function listenToPlayerData() {
    const unsub = onSnapshot(doc(db, "users", currentUserUid), (docSnap) => {
        if (!docSnap.exists()) return;
        const d = docSnap.data();
        
        playerUsername = d.username || "Hero Anonim";

        document.getElementById('player-name').innerText = d.username;
        document.getElementById('player-class').innerText = d.characterClass;
        document.getElementById('player-level').innerText = d.level || 1;
        document.getElementById('header-gold').innerText = (d.gold || 0).toLocaleString();
        document.getElementById('header-coin').innerText = (d.coin || 0).toLocaleString();
        document.getElementById('player-bank').innerText = (d.bankGold || 0).toLocaleString();
        
        const maxExp = (d.level || 1) * 100;
        document.getElementById('exp-text').innerText = `${d.exp || 0} / ${maxExp}`;
        document.getElementById('exp-bar').style.width = `${Math.min(((d.exp || 0) / maxExp) * 100, 100)}%`;
        document.getElementById('char-hp-text').innerText = `${d.currentHp} / ${d.maxHp}`;
        document.getElementById('char-hp-bar').style.width = `${Math.min((d.currentHp / d.maxHp) * 100, 100)}%`;
        document.getElementById('char-mp-text').innerText = `${d.currentMp} / ${d.maxMp}`;
        document.getElementById('char-mp-bar').style.width = `${Math.min((d.currentMp / d.maxMp) * 100, 100)}%`;

        document.getElementById('stat-str').innerText = d.str;
        document.getElementById('stat-con').innerText = d.con;
        document.getElementById('stat-dex').innerText = d.dex;
        document.getElementById('stat-int').innerText = d.int;

        const eq = d.equipment || {};
        const wRefine = eq.weapon?.refine ? ` (+${eq.weapon.refine})` : "";
        const aRefine = eq.armor?.refine ? ` (+${eq.armor.refine})` : "";
        const cRefine = eq.accessory?.refine ? ` (+${eq.accessory.refine})` : "";

        document.getElementById('eq-weapon').innerText = eq.weapon ? `${eq.weapon.name}${wRefine}` : "Kosong";
        document.getElementById('eq-armor').innerText = eq.armor ? `${eq.armor.name}${aRefine}` : "Kosong";
        document.getElementById('eq-acc').innerText = eq.accessory ? `${eq.accessory.name}${cRefine}` : "Kosong";

        let wRefineBonus = 1 + (eq.weapon?.refine || 0) * 0.15; 
        let aRefineBonus = 1 + (eq.armor?.refine || 0) * 0.15;
        let cRefineBonus = 1 + (eq.accessory?.refine || 0) * 0.10; 

        let eqPatk = Math.floor((eq.weapon?.patk || 0) * wRefineBonus); 
        let eqMatk = Math.floor((eq.weapon?.matk || 0) * wRefineBonus);
        let eqDef = Math.floor((eq.armor?.def || 0) * aRefineBonus); 
        let eqAccBonus = Math.floor((eq.accessory?.accBonus || 0) * cRefineBonus);

        const patk = 50 + (d.str * 10) + eqPatk; 
        const matk = 50 + (d.int * 10) + eqMatk;
        const def = 10 + (d.con * 5) + eqDef; 
        const crit = (d.dex * 0.5).toFixed(1);
        const eva = (d.dex * 0.2).toFixed(1); 
        currentAccuracy = 80 + (d.dex * 0.5) + eqAccBonus;

        document.getElementById('stat-patk').innerText = patk; 
        document.getElementById('stat-matk').innerText = matk;
        document.getElementById('stat-def').innerText = def; 
        document.getElementById('stat-crit').innerText = crit + "%";
        document.getElementById('stat-eva').innerText = eva + "%"; 
        document.getElementById('stat-acc').innerText = currentAccuracy.toFixed(1) + "%";

        const invGrid = document.getElementById('inventory-grid');
        if (invGrid) {
            invGrid.innerHTML = "";
            let items = Object.entries(d.inventory || {});
            for (let i = 0; i < 20; i++) {
                if (i < items.length) {
                    const [name, qty] = items[i];
                    invGrid.innerHTML += `<div class="inv-slot filled" onclick="window.handleInventoryClick('${escapeHTML(name)}')">
                        <span>${escapeHTML(name)}</span><span class="inv-qty">x${qty}</span></div>`;
                } else {
                    invGrid.innerHTML += `<div class="inv-slot">Kosong</div>`;
                }
            }
        }

        const bankGrid = document.getElementById('bank-grid');
        if (bankGrid) {
            bankGrid.innerHTML = "";
            let bankItems = Object.entries(d.bankInventory || {});
            for (let i = 0; i < 16; i++) { 
                if (i < bankItems.length) {
                    const [name, qty] = bankItems[i];
                    bankGrid.innerHTML += `<div class="bank-slot filled" onclick="window.handleBankClick('${escapeHTML(name)}')">
                        <span>${escapeHTML(name)}</span><span class="inv-qty">x${qty}</span></div>`;
                } else {
                    bankGrid.innerHTML += `<div class="bank-slot">Kosong</div>`;
                }
            }
        }
    });
    activeUnsubscribeListeners.push(unsub);
}

// ==========================================
// 5. INTERAKSI KLIK TAS & TIKET SPESIAL
// ==========================================
window.handleInventoryClick = function(itemName) {
    if (inventoryMode === "EQUIP") { 
        equipFromInventory(itemName); 
    } else if (inventoryMode === "SELL") { 
        sellItemFromInventory(itemName); 
    } else if (inventoryMode === "BANK") { 
        depositItem(db, currentUserUid, itemName); 
    }
};

window.handleBankClick = function(itemName) {
    withdrawItem(db, currentUserUid, itemName);
};

async function equipFromInventory(itemName) {
    if (!currentUserUid || !ITEM_DB[itemName]) return;
    const itemData = ITEM_DB[itemName];

    // Penanganan Item Spesial (Tiket Mall)
    let specialInput = null;
    if (itemData.type === "special") {
        if (itemName === "Tiket Ganti Nama") {
            specialInput = prompt("Masukkan Nama Karakter Baru:");
            if (!specialInput || specialInput.trim() === "") return;
        } else if (itemName === "Tiket Ubah Job") {
            specialInput = prompt("Pilih Job Baru (Ketik: Warrior atau Mage):");
            if (specialInput !== "Warrior" && specialInput !== "Mage") {
                return alert("Pilihan tidak valid! Harus mengetik Warrior atau Mage.");
            }
        }
    } else if (itemData.type === "loot" || itemData.type === "consumable" || itemData.type === "catalyst") {
        return alert("Item ini tidak bisa dipakai secara langsung (Gunakan di fasilitas yang sesuai).");
    }

    const userRef = doc(db, "users", currentUserUid);
    try {
        await runTransaction(db, async (ts) => {
            const data = (await ts.get(userRef)).data();
            let inv = data.inventory || {};
            let eq = data.equipment || { weapon: null, armor: null, accessory: null };
            
            if (!inv[itemName] || inv[itemName] <= 0) throw "Item tidak ditemukan!";
            
            // Eksekusi Item Spesial
            if (itemData.type === "special") {
                inv[itemName] -= 1;
                if (inv[itemName] === 0) delete inv[itemName];
                
                let updates = { inventory: inv };
                if (itemName === "Tiket Ganti Nama") {
                    updates.username = specialInput;
                } else if (itemName === "Tiket Ubah Job") {
                    updates.characterClass = specialInput;
                    // Reset Stat ke dasar job baru
                    if (specialInput === 'Warrior') { updates.str = 15; updates.con = 20; updates.dex = 5; updates.int = 2; }
                    else { updates.str = 2; updates.con = 8; updates.dex = 10; updates.int = 25; }
                }
                ts.update(userRef, updates);
                return;
            }

            // Eksekusi Pemasangan Equipment (Armor/Senjata)
            const slotType = itemData.type;
            if (eq[slotType] && eq[slotType].name) {
                const oldItem = eq[slotType];
                inv[oldItem.name] = (inv[oldItem.name] || 0) + 1; 
            }
            inv[itemName] -= 1;
            if (inv[itemName] === 0) delete inv[itemName];
            
            eq[slotType] = { name: itemName, refine: 0, ...itemData };
            ts.update(userRef, { inventory: inv, equipment: eq });
        });
        if (itemData.type === "special") alert(`Penggunaan ${itemName} Berhasil!`);
    } catch (err) { alert(err); }
}

async function sellItemFromInventory(itemName) {
    if (!currentUserUid) return;
    const itemData = ITEM_DB[itemName];
    const sellPrice = itemData ? itemData.sellValue : 20;
    if (sellPrice <= 0) return alert("Item ini terikat (Bound) dan tidak bisa dijual.");

    const confirmSell = confirm(`Jual 1x [${itemName}] seharga ${sellPrice} GOLD?`);
    if (!confirmSell) return;

    const userRef = doc(db, "users", currentUserUid);
    try {
        await runTransaction(db, async (ts) => {
            const data = (await ts.get(userRef)).data();
            let inv = data.inventory || {};
            if (!inv[itemName] || inv[itemName] < 1) throw "Item tidak ditemukan!";
            inv[itemName] -= 1;
            if (inv[itemName] === 0) delete inv[itemName];
            ts.update(userRef, { inventory: inv, gold: (data.gold || 0) + sellPrice });
        });
    } catch (err) { alert(err); }
}

// ==========================================
// 6. SISTEM TEMPA PW-STYLE
// ==========================================
async function refineEquipment(slotType) {
    if (!currentUserUid) return;
    
    const stoneType = document.getElementById('refine-catalyst').value;
    const userRef = doc(db, "users", currentUserUid);

    try {
        await runTransaction(db, async (ts) => {
            const data = (await ts.get(userRef)).data();
            let inv = data.inventory || {};
            let eq = data.equipment || {};
            let gold = data.gold || 0;

            if (!eq[slotType] || !eq[slotType].name) throw "Anda tidak mengenakan perlengkapan di slot ini!";
            if (!inv[stoneType] || inv[stoneType] < 1) throw `Anda memerlukan 1x 💎 ${stoneType} di dalam tas!`;
            if (gold < 1000) throw "Emas tidak cukup! Membutuhkan 1,000 Gold.";

            let currentRefine = eq[slotType].refine || 0;
            if (currentRefine >= 10) throw "Tingkat tempa perlengkapan ini sudah maksimal (+10)!";

            // Konsumsi Katalis & Gold
            inv[stoneType] -= 1;
            if (inv[stoneType] === 0) delete inv[stoneType];
            gold -= 1000;

            // Baca Probabilitas (Jika level di atas +8, gunakan peluang paling akhir [9])
            const indexRate = currentRefine > 9 ? 9 : currentRefine;
            const successRate = REFINE_RATES[stoneType][indexRate]; 

            const roll = Math.random();
            if (roll <= successRate) {
                // Tempa Berhasil
                eq[slotType].refine = currentRefine + 1;
                alert(`🎉 LUAR BIASA! Tempa Sukses! [${eq[slotType].name}] meningkat ke (+${eq[slotType].refine})`);
            } else {
                // Tempa Gagal & Mekanik Penalti Stone
                if (stoneType === 'Underworld Stone') {
                    eq[slotType].refine = Math.max(0, currentRefine - 1);
                    alert(`💥 GAGAL! Efek Underworld: Tingkat tempa turun -1 menjadi (+${eq[slotType].refine})`);
                } else if (stoneType === 'Universal Stone') {
                    // Chienkun = Aman
                    alert(`❌ GAGAL! Efek Universal: Tingkat tempa dipertahankan di (+${eq[slotType].refine})`);
                } else {
                    // Mirage & Heaven = Hancur ke 0
                    eq[slotType].refine = 0;
                    alert(`💔 HANCUR! Tempa Gagal total. Tingkat tempa kembali ke (+0)`);
                }
            }

            ts.update(userRef, { inventory: inv, equipment: eq, gold: gold });
        });
    } catch (err) { alert(err); }
}

// ==========================================
// 7. BINDING EVENT LISTENERS UI
// ==========================================
function clearActiveModeClasses() {
    ['btn-mode-equip', 'btn-mode-sell', 'btn-mode-bank'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.className = "";
    });
}
document.getElementById('btn-mode-equip')?.addEventListener('click', () => {
    inventoryMode = "EQUIP"; clearActiveModeClasses(); document.getElementById('btn-mode-equip').className = "mode-active";
});
document.getElementById('btn-mode-sell')?.addEventListener('click', () => {
    inventoryMode = "SELL"; clearActiveModeClasses(); document.getElementById('btn-mode-sell').className = "mode-sell-active";
});
document.getElementById('btn-mode-bank')?.addEventListener('click', () => {
    inventoryMode = "BANK"; clearActiveModeClasses(); document.getElementById('btn-mode-bank').className = "mode-active";
});

// Aksi Pandai Besi
document.getElementById('btn-refine-weapon')?.addEventListener('click', () => refineEquipment('weapon'));
document.getElementById('btn-refine-armor')?.addEventListener('click', () => refineEquipment('armor'));
document.getElementById('btn-refine-accessory')?.addEventListener('click', () => refineEquipment('accessory'));

// Event Belanja UI Standar
document.getElementById('btn-buy-sword')?.addEventListener('click', () => buyEquipment(db, currentUserUid, 'Pedang Besi'));
document.getElementById('btn-buy-staff')?.addEventListener('click', () => buyEquipment(db, currentUserUid, 'Tongkat Sihir'));
document.getElementById('btn-buy-armor')?.addEventListener('click', () => buyEquipment(db, currentUserUid, 'Zirah Kulit'));
document.getElementById('btn-buy-ring')?.addEventListener('click', () => buyEquipment(db, currentUserUid, 'Cincin Akurat'));
document.getElementById('btn-buy-hp')?.addEventListener('click', () => buyPotion(db, currentUserUid, 'HP'));
document.getElementById('btn-buy-mp')?.addEventListener('click', () => buyPotion(db, currentUserUid, 'MP'));

// Transaksi Bank Gold
document.getElementById('btn-bank-deposit-gold')?.addEventListener('click', () => {
    const goldAmount = parseInt(document.getElementById('bank-gold-input')?.value || 0);
    if (goldAmount > 0) { depositGold(db, currentUserUid, goldAmount); document.getElementById('bank-gold-input').value = ""; }
});
document.getElementById('btn-bank-withdraw-gold')?.addEventListener('click', () => {
    const goldAmount = parseInt(document.getElementById('bank-gold-input')?.value || 0);
    if (goldAmount > 0) { withdrawGold(db, currentUserUid, goldAmount); document.getElementById('bank-gold-input').value = ""; }
});

// Event Kirim Chat
const chatInput = document.getElementById('chat-input');
const btnSendChat = document.getElementById('btn-send-chat');
function executeSendingChat() {
    if (!chatInput || !chatInput.value.trim()) return;
    sendChat(db, currentUserUid, playerUsername, chatInput.value);
    chatInput.value = ""; 
}
btnSendChat?.addEventListener('click', executeSendingChat);
chatInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); executeSendingChat(); }
});

// EVENT BELANJA ITEM MALL PREMIUM BARU
document.getElementById('btn-mall-mirage')?.addEventListener('click', () => buyMallItem(db, currentUserUid, 'Mirage Stone', 5));
document.getElementById('btn-mall-heaven')?.addEventListener('click', () => buyMallItem(db, currentUserUid, 'Heaven Stone', 15));
document.getElementById('btn-mall-underworld')?.addEventListener('click', () => buyMallItem(db, currentUserUid, 'Underworld Stone', 15));
document.getElementById('btn-mall-universal')?.addEventListener('click', () => buyMallItem(db, currentUserUid, 'Universal Stone', 50));
document.getElementById('btn-mall-name')?.addEventListener('click', () => buyMallItem(db, currentUserUid, 'Tiket Ganti Nama', 50));
document.getElementById('btn-mall-job')?.addEventListener('click', () => buyMallItem(db, currentUserUid, 'Tiket Ubah Job', 100));