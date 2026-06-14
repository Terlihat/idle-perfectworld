// ==========================================
// 1. IMPORT FIREBASE & MODUL KUSTOM
// ==========================================
import { db, auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, getDoc, onSnapshot, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Import Fungsi dari Folder Modules
import { buyEquipment } from './modules/shop.js';
import { listenToChat, sendChat } from './modules/chat.js';
import { buyPotion, listenToMailbox } from './modules/apothecary.js';
import { buyGachaBox } from './modules/mall.js';

// ==========================================
// 2. VARIABEL GLOBAL & DATABASE ITEM
// ==========================================
let currentUserUid = null;
let isCooldown = false;
let activeUnsubscribeListeners = [];
let currentAccuracy = 0;
let inventoryMode = "EQUIP"; 
let playerUsername = "Hero Anonim"; // Variabel global untuk menampung nama di chat

// Database lokal untuk stat perlengkapan & drop dungeon
const ITEM_DB = {
    "Pedang Besi": { type: "weapon", patk: 30, sellValue: 1000 },
    "Tongkat Sihir": { type: "weapon", matk: 30, sellValue: 1000 },
    "Zirah Kulit": { type: "armor", def: 20, sellValue: 1000 },
    "Cincin Akurat": { type: "accessory", accBonus: 10, sellValue: 1500 },
    
    "Pedang Darah (Rare)": { type: "weapon", patk: 65, sellValue: 4000 },
    "Tongkat Abyss (Rare)": { type: "weapon", matk: 65, sellValue: 4000 },
    "Zirah Naga (Rare)": { type: "armor", def: 45, sellValue: 4000 },
    "Mata Iblis (Rare)": { type: "accessory", accBonus: 25, sellValue: 5000 },

    "Batu Dungeon": { type: "loot", sellValue: 300 },
    "Roti Keras": { type: "consumable", sellValue: 50 },
    "Ramuan HP": { type: "consumable", sellValue: 250 },
    "Ramuan MP": { type: "consumable", sellValue: 250 },
    "Gacha Box Premium": { type: "loot", sellValue: 5000 }
};

// ==========================================
// 3. FUNGSI UTILITAS & AUTENTIKASI
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

// ==========================================
// 4. SINKRONISASI GAME & MODUL EXTERNAL
// ==========================================
function startLiveGameSync() {
    listenToPlayerData(); 
    listenToWorldBoss(); // Pastikan Anda memiliki fungsi ini jika boss aktif
    
    // Integrasi Modul Chat Global
    const unsubChat = listenToChat(db, (messages) => {
        const chatBox = document.getElementById('chat-box');
        chatBox.innerHTML = "";
        
        messages.forEach(m => {
            const safeName = escapeHTML(m.username);
            const safeText = escapeHTML(m.text);
            chatBox.innerHTML += `<div><span class="chat-name">${safeName}</span>: ${safeText}</div>`;
        });
        chatBox.scrollTop = chatBox.scrollHeight;
    });

    // Integrasi Modul Mailbox (Surat)
    const unsubMail = listenToMailbox(db, currentUserUid, (mails) => {
        const mailDiv = document.getElementById('mailbox-list');
        mailDiv.innerHTML = mails.length === 0 ? "Tidak ada surat baru." : "";
        mails.forEach(mail => {
            mailDiv.innerHTML += `<div style="border-bottom:1px solid #333; padding:2px 0;">📬 ${escapeHTML(mail.title)}</div>`;
        });
    });

    activeUnsubscribeListeners.push(unsubChat, unsubMail);
}

// ==========================================
// 5. RENDERING DATA PEMAIN & STATISTIK
// ==========================================
function listenToPlayerData() {
    const unsub = onSnapshot(doc(db, "users", currentUserUid), (docSnap) => {
        if (!docSnap.exists()) return;
        const d = docSnap.data();
        
        // Simpan username untuk digunakan saat mengirim chat
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
    });
    activeUnsubscribeListeners.push(unsub);
}

// ==========================================
// 6. MEKANIK INVENTARIS & DUNGEON
// ==========================================
window.handleInventoryClick = function(itemName) {
    if (inventoryMode === "EQUIP") { equipFromInventory(itemName); } 
    else if (inventoryMode === "SELL") { sellItemFromInventory(itemName); }
};

async function equipFromInventory(itemName) {
    if (!currentUserUid || !ITEM_DB[itemName]) return;
    const itemData = ITEM_DB[itemName];
    if (itemData.type === "loot" || itemData.type === "consumable") return alert("Bukan perlengkapan tempur!");

    const userRef = doc(db, "users", currentUserUid);
    try {
        await runTransaction(db, async (ts) => {
            const data = (await ts.get(userRef)).data();
            let inv = data.inventory || {};
            let eq = data.equipment || { weapon: null, armor: null, accessory: null };
            
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
    } catch (err) { alert(err); }
}

async function sellItemFromInventory(itemName) {
    if (!currentUserUid) return;
    const itemData = ITEM_DB[itemName];
    const sellPrice = itemData ? itemData.sellValue : 20;

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

async function exploreDungeon() {
    if (!currentUserUid || isCooldown) return;
    document.getElementById('btn-dungeon').disabled = true; isCooldown = true;
    const userRef = doc(db, "users", currentUserUid);
    try {
        await runTransaction(db, async (ts) => {
            const data = (await ts.get(userRef)).data();
            if (data.currentMp < 20) throw "MP tidak cukup!";

            let updates = { currentMp: data.currentMp - 20, gold: (data.gold || 0) + 200, lastAction: Date.now() };
            let cLvl = data.level || 1; let cExp = (data.exp || 0) + 50;
            if (cExp >= (cLvl * 100)) { cLvl++; cExp -= ((cLvl-1)*100); updates.level = cLvl; }
            updates.exp = cExp;

            let currentInv = data.inventory || {};
            let roll = Math.random();
            if (roll < 0.12) {
                const rareDrops = ["Pedang Darah (Rare)", "Tongkat Abyss (Rare)", "Zirah Naga (Rare)", "Mata Iblis (Rare)"];
                const dropItem = rareDrops[Math.floor(Math.random() * rareDrops.length)];
                currentInv[dropItem] = (currentInv[dropItem] || 0) + 1;
                alert(`🎉 DROP LANGKA: ${dropItem}`);
            } else if (roll < 0.45) {
                currentInv["Batu Dungeon"] = (currentInv["Batu Dungeon"] || 0) + 1;
            }
            updates.inventory = currentInv;
            ts.update(userRef, updates);
        });
    } catch (err) { alert(err); }
    setTimeout(() => { document.getElementById('btn-dungeon').disabled = false; isCooldown = false; }, 2000);
}

// ==========================================
// 7. SISTEM TEMPA (REFINE)
// ==========================================
async function refineEquipment(slotType) {
    if (!currentUserUid) return;
    const userRef = doc(db, "users", currentUserUid);

    try {
        await runTransaction(db, async (ts) => {
            const data = (await ts.get(userRef)).data();
            let inv = data.inventory || {};
            let eq = data.equipment || {};
            let gold = data.gold || 0;

            if (!eq[slotType] || !eq[slotType].name) throw "Anda tidak mengenakan perlengkapan di slot ini!";
            if (!inv["Batu Dungeon"] || inv["Batu Dungeon"] < 1) throw "Anda memerlukan 1x 💎 Batu Dungeon di dalam tas!";
            if (gold < 1000) throw "Emas tidak cukup! Membutuhkan 1,000 Gold.";

            let currentRefine = eq[slotType].refine || 0;
            if (currentRefine >= 10) throw "Tingkat tempa perlengkapan ini sudah maksimal (+10)!";

            inv["Batu Dungeon"] -= 1;
            if (inv["Batu Dungeon"] === 0) delete inv["Batu Dungeon"];
            gold -= 1000;

            let successRate = 1.0; 
            if (currentRefine >= 1 && currentRefine <= 3) successRate = 1.0; 
            else if (currentRefine >= 4 && currentRefine <= 6) successRate = 0.65;
            else if (currentRefine >= 7 && currentRefine <= 9) successRate = 0.35; 

            const roll = Math.random();
            if (roll <= successRate) {
                eq[slotType].refine = currentRefine + 1;
                alert(`🎉 LUAR BIASA! Tempa Sukses! [${eq[slotType].name}] meningkat ke (+${eq[slotType].refine})`);
            } else {
                if (currentRefine > 3) {
                    eq[slotType].refine = currentRefine - 1;
                    alert(`💥 TEMPA GAGAL! Tingkat tempa [${eq[slotType].name}] turun menjadi (+${eq[slotType].refine})`);
                } else {
                    alert(`❌ TEMPA GAGAL! Beruntung tingkat tempa [${eq[slotType].name}] tidak turun.`);
                }
            }

            ts.update(userRef, { inventory: inv, equipment: eq, gold: gold });
        });
    } catch (err) { alert(err); }
}

// Placeholder untuk World Boss (Mencegah Error jika elemen HTML dipanggil)
function listenToWorldBoss() {
    // Fungsi ini dapat Anda kembangkan nanti atau gunakan modul terpisah
    const bossNameEl = document.getElementById('boss-name');
    if (bossNameEl && bossNameEl.innerText === "Memuat...") {
        bossNameEl.innerText = "Naga Hitam (Menunggu Update)";
    }
}

// ==========================================
// 8. BINDING EVENT LISTENERS (UI & MODUL)
// ==========================================

// Mode Inventaris
document.getElementById('btn-mode-equip')?.addEventListener('click', () => {
    inventoryMode = "EQUIP";
    document.getElementById('btn-mode-equip').className = "mode-active";
    document.getElementById('btn-mode-sell').className = "";
    document.getElementById('btn-mode-sell').style.backgroundColor = "#495057";
});

document.getElementById('btn-mode-sell')?.addEventListener('click', () => {
    inventoryMode = "SELL";
    document.getElementById('btn-mode-sell').className = "mode-sell-active";
    document.getElementById('btn-mode-equip').className = "";
    document.getElementById('btn-mode-equip').style.backgroundColor = "#495057";
});

// Aksi Pemain Lokal
document.getElementById('btn-dungeon')?.addEventListener('click', exploreDungeon);
document.getElementById('btn-refine-weapon')?.addEventListener('click', () => refineEquipment('weapon'));
document.getElementById('btn-refine-armor')?.addEventListener('click', () => refineEquipment('armor'));
document.getElementById('btn-refine-accessory')?.addEventListener('click', () => refineEquipment('accessory'));

// Event Modul: Toko Perlengkapan
document.getElementById('btn-buy-sword')?.addEventListener('click', () => buyEquipment(db, currentUserUid, 'Pedang Besi'));
document.getElementById('btn-buy-staff')?.addEventListener('click', () => buyEquipment(db, currentUserUid, 'Tongkat Sihir'));
document.getElementById('btn-buy-armor')?.addEventListener('click', () => buyEquipment(db, currentUserUid, 'Zirah Kulit'));
document.getElementById('btn-buy-ring')?.addEventListener('click', () => buyEquipment(db, currentUserUid, 'Cincin Akurat'));

// Event Modul: Toko Ahli Obat
document.getElementById('btn-buy-hp')?.addEventListener('click', () => buyPotion(db, currentUserUid, 'HP'));
document.getElementById('btn-buy-mp')?.addEventListener('click', () => buyPotion(db, currentUserUid, 'MP'));

// Event Modul: Item Mall
document.getElementById('btn-mall-gacha')?.addEventListener('click', () => buyGachaBox(db, currentUserUid));

// Event Modul: Chat Global (Eksekusi Kirim)
const chatInput = document.getElementById('chat-input');
const btnSendChat = document.getElementById('btn-send-chat');

function executeSendingChat() {
    if (!chatInput || !chatInput.value.trim()) return;
    sendChat(db, currentUserUid, playerUsername, chatInput.value);
    chatInput.value = ""; 
}

btnSendChat?.addEventListener('click', executeSendingChat);
chatInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault(); 
        executeSendingChat();
    }
});