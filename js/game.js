import { db, auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { registerWithEmail, loginWithEmail, logoutUser } from './auth.js';
import { doc, collection, getDoc, onSnapshot, runTransaction, addDoc, query, orderBy, limit, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

let currentUserUid = null;
let isCooldown = false;
let isLoginMode = true; 
let activeUnsubscribeListeners = [];
let currentAccuracy = 0;
let inventoryMode = "EQUIP"; // Mengatur status klik: "EQUIP" atau "SELL"

// ==========================================
// DATABASE ITEM, STATS, & NILAI JUAL
// ==========================================
const ITEM_DB = {
    // Perlengkapan Toko
    "Pedang Besi": { type: "weapon", patk: 30, sellValue: 1000 },
    "Tongkat Sihir": { type: "weapon", matk: 30, sellValue: 1000 },
    "Zirah Kulit": { type: "armor", def: 20, sellValue: 1000 },
    "Cincin Akurat": { type: "accessory", accBonus: 10, sellValue: 1500 },
    
    // Perlengkapan Dungeon Drops (Langka)
    "Pedang Darah (Rare)": { type: "weapon", patk: 65, sellValue: 4000 },
    "Tongkat Abyss (Rare)": { type: "weapon", matk: 65, sellValue: 4000 },
    "Zirah Naga (Rare)": { type: "armor", def: 45, sellValue: 4000 },
    "Mata Iblis (Rare)": { type: "accessory", accBonus: 25, sellValue: 5000 },

    // Sampah Loot / Habis Pakai
    "Batu Dungeon": { type: "loot", sellValue: 300 },
    "Roti Keras": { type: "consumable", sellValue: 50 }
};

// ==========================================
// UTILITAS
// ==========================================
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    document.getElementById(screenId).style.display = 'block';
}

function escapeHTML(str) {
    return str ? str.toString().replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])) : "";
}

// ==========================================
// MANAJEMEN AUTENTIKASI
// ==========================================
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
    listenToPlayerData(); listenToWorldBoss(); listenToChat(); loadMailbox(); 
}

// ==========================================
// INISIALISASI KARAKTER
// ==========================================
async function selectCharacterClass(className) {
    if (!currentUserUid) return;
    const userRef = doc(db, "users", currentUserUid);
    let stats = { str: 0, con: 0, dex: 0, int: 0 };
    if (className === 'Warrior') { stats = { str: 15, con: 20, dex: 5, int: 2 }; } 
    else if (className === 'Mage') { stats = { str: 2, con: 8, dex: 10, int: 25 }; }

    const maxHp = 1000 + (stats.con * 50); const maxMp = 200 + (stats.int * 30);

    try {
        await setDoc(userRef, {
            username: "Hero_" + currentUserUid.substring(0, 4), characterClass: className,
            level: 1, exp: 0, gold: 5000, coin: 50, bankGold: 0, 
            inventory: { "Roti Keras": 5, "Batu Dungeon": 2 }, equipment: { weapon: null, armor: null, accessory: null },
            ...stats, maxHp: maxHp, currentHp: maxHp, maxMp: maxMp, currentMp: maxMp, lastAction: 0
        });
        showScreen('screen-game'); startLiveGameSync();
    } catch (err) { alert("Error: " + err); }
}

// ==========================================
// SINKRONISASI DATA & UI INVENTARIS 4x5
// ==========================================
function listenToPlayerData() {
    const unsub = onSnapshot(doc(db, "users", currentUserUid), (docSnap) => {
        if (!docSnap.exists()) return;
        const d = docSnap.data();
        
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
        document.getElementById('eq-weapon').innerText = eq.weapon ? eq.weapon.name : "Kosong";
        document.getElementById('eq-armor').innerText = eq.armor ? eq.armor.name : "Kosong";
        document.getElementById('eq-acc').innerText = eq.accessory ? eq.accessory.name : "Kosong";

        let eqPatk = eq.weapon?.patk || 0; let eqMatk = eq.weapon?.matk || 0;
        let eqDef = eq.armor?.def || 0; let eqAccBonus = eq.accessory?.accBonus || 0;

        const patk = 50 + (d.str * 10) + eqPatk; const matk = 50 + (d.int * 10) + eqMatk;
        const def = 10 + (d.con * 5) + eqDef; const crit = (d.dex * 0.5).toFixed(1);
        const eva = (d.dex * 0.2).toFixed(1); currentAccuracy = 80 + (d.dex * 0.5) + eqAccBonus;

        document.getElementById('stat-patk').innerText = patk; document.getElementById('stat-matk').innerText = matk;
        document.getElementById('stat-def').innerText = def; document.getElementById('stat-crit').innerText = crit + "%";
        document.getElementById('stat-eva').innerText = eva + "%"; document.getElementById('stat-acc').innerText = currentAccuracy.toFixed(1) + "%";

        // Render Grid Tas 4x5 dengan Logika Pengkondisian Mode Klik
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
// ROUTER KLIK INVENTARIS (PASANG ATAU JUAL)
// ==========================================
window.handleInventoryClick = function(itemName) {
    if (inventoryMode === "EQUIP") {
        equipFromInventory(itemName);
    } else if (inventoryMode === "SELL") {
        sellItemFromInventory(itemName);
    }
};

// Logika Pasang Equipment (Sama seperti v13)
async function equipFromInventory(itemName) {
    if (!currentUserUid || !ITEM_DB[itemName]) return;
    const itemData = ITEM_DB[itemName];
    if (itemData.type === "loot" || itemData.type === "consumable") {
        return alert("Item ini bukan perlengkapan tempur!");
    }

    const userRef = doc(db, "users", currentUserUid);
    try {
        await runTransaction(db, async (ts) => {
            const data = (await ts.get(userRef)).data();
            let inv = data.inventory || {};
            let eq = data.equipment || { weapon: null, armor: null, accessory: null };
            if (!inv[itemName] || inv[itemName] < 1) throw "Item tidak ada!";
            
            const slotType = itemData.type;
            if (eq[slotType] && eq[slotType].name) {
                const oldItemName = eq[slotType].name;
                inv[oldItemName] = (inv[oldItemName] || 0) + 1;
            }
            inv[itemName] -= 1;
            if (inv[itemName] === 0) delete inv[itemName];
            eq[slotType] = { name: itemName, ...itemData };

            ts.update(userRef, { inventory: inv, equipment: eq });
        });
    } catch (err) { alert(err); }
}

// BARU: Logika Penjualan Item ke Toko Gadai / Sistem
async function sellItemFromInventory(itemName) {
    if (!currentUserUid) return;
    const itemData = ITEM_DB[itemName];
    const sellPrice = itemData ? itemData.sellValue : 20; // Default harga jika item tak terdaftar

    const confirmSell = confirm(`Apakah Anda yakin ingin menjual 1x [${itemName}] seharga ${sellPrice} GOLD?`);
    if (!confirmSell) return;

    const userRef = doc(db, "users", currentUserUid);
    try {
        await runTransaction(db, async (ts) => {
            const data = (await ts.get(userRef)).data();
            let inv = data.inventory || {};
            if (!inv[itemName] || inv[itemName] < 1) throw "Item tidak ditemukan!";

            // Mengurangi kuantitas di tas
            inv[itemName] -= 1;
            if (inv[itemName] === 0) delete inv[itemName];

            // Tambahkan emas ke dompet
            let currentGold = data.gold || 0;
            ts.update(userRef, { inventory: inv, gold: currentGold + sellPrice });
        });
    } catch (err) { alert(err); }
}

// ==========================================
// SISTEM DUNGEON & MEKANIK LAINNYA
// ==========================================
async function exploreDungeon() {
    if (!currentUserUid || isCooldown) return;
    document.getElementById('btn-dungeon').disabled = true; isCooldown = true;
    const userRef = doc(db, "users", currentUserUid);
    try {
        await runTransaction(db, async (ts) => {
            const data = (await ts.get(userRef)).data();
            if (Date.now() - (data.lastAction || 0) < 2000) throw "Sedang memulihkan nafas!";
            if (data.currentMp < 20) throw "MP tidak cukup!";

            let updates = { currentMp: data.currentMp - 20, gold: (data.gold || 0) + 200, lastAction: Date.now() };
            let cLvl = data.level || 1; let cExp = (data.exp || 0) + 50;
            if (cExp >= (cLvl * 100)) { cLvl++; cExp -= ((cLvl-1)*100); updates.level = cLvl; }
            updates.exp = cExp;

            let currentInv = data.inventory || {};
            if (Math.random() < 0.15) {
                const rareDrops = ["Pedang Darah (Rare)", "Tongkat Abyss (Rare)", "Zirah Naga (Rare)", "Mata Iblis (Rare)"];
                const dropItem = rareDrops[Math.floor(Math.random() * rareDrops.length)];
                currentInv[dropItem] = (currentInv[dropItem] || 0) + 1;
                updates.inventory = currentInv;
                alert(`🎉 DROP LANGKA: ${dropItem}`);
            } else if (Math.random() < 0.40) {
                currentInv["Batu Dungeon"] = (currentInv["Batu Dungeon"] || 0) + 1;
                updates.inventory = currentInv;
            }
            ts.update(userRef, updates);
        });
    } catch (err) { alert(err); }
    setTimeout(() => { document.getElementById('btn-dungeon').disabled = false; isCooldown = false; }, 2000);
}

// Mengubah mode interaksi tas
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

// --- Pemicu Eksternal / Beli Item di Toko ---
async function buyEquipment(itemName, cost) {
    if (!currentUserUid || !ITEM_DB[itemName]) return;
    const userRef = doc(db, "users", currentUserUid);
    try {
        await runTransaction(db, async (ts) => {
            const data = (await ts.get(userRef)).data();
            if ((data.gold || 0) < cost) throw "Gold tidak cukup!";
            let inv = data.inventory || {};
            inv[itemName] = (inv[itemName] || 0) + 1;
            ts.update(userRef, { gold: data.gold - cost, inventory: inv });
        });
        alert(`${itemName} masuk ke dalam tas!`);
    } catch (err) { alert(err); }
}

async function attackWorldBoss() {
    if (!currentUserUid || isCooldown) return;
    document.getElementById('btn-attack').disabled = true; isCooldown = true;
    const bossRef = doc(db, "server", "world_boss"); const userRef = doc(db, "users", currentUserUid);
    try {
        await runTransaction(db, async (ts) => {
            const bossDoc = await ts.get(bossRef); const userDoc = await ts.get(userRef);
            const data = userDoc.data();
            if (Date.now() - (data.lastAction || 0) < 2000) throw "Cooldown!";
            let updates = { lastAction: Date.now() };

            if ((Math.random() * 100) > currentAccuracy) { ts.update(userRef, updates); throw "MISS"; }

            let baseDamage = 0; const eq = data.equipment || {};
            if (data.characterClass === 'Warrior') { baseDamage = 50 + (data.str * 10) + (eq.weapon?.patk || 0); } 
            else { baseDamage = 50 + (data.int * 10) + (eq.weapon?.matk || 0); }
            if ((Math.random() * 100) < (data.dex * 0.5)) baseDamage *= 2; 

            let cLvl = data.level || 1; let cExp = (data.exp || 0) + 30;
            if (cExp >= (cLvl * 100)) { cLvl++; cExp -= ((cLvl-1)*100); updates.level = cLvl; }
            updates.exp = cExp;

            let newHp = bossDoc.data().hp - baseDamage;
            ts.update(bossRef, { hp: newHp < 0 ? 0 : newHp }); ts.update(userRef, updates);
        });
    } catch (err) { 
        if (err === "MISS") {
            const btn = document.getElementById('btn-attack');
            const oldText = btn.innerText; btn.innerText = "MISS!"; btn.style.background = "#555";
            setTimeout(() => { btn.innerText = oldText; btn.style.background = "#e67e22"; }, 1000);
        }
    }
    setTimeout(() => { document.getElementById('btn-attack').disabled = false; isCooldown = false; }, 2000);
}

// Sambungan Event Toko
document.getElementById('btn-buy-sword')?.addEventListener('click', () => buyEquipment('Pedang Besi', 2000));
document.getElementById('btn-buy-staff')?.addEventListener('click', () => buyEquipment('Tongkat Sihir', 2000));
document.getElementById('btn-buy-armor')?.addEventListener('click', () => buyEquipment('Zirah Kulit', 2000));
document.getElementById('btn-buy-ring')?.addEventListener('click', () => buyEquipment('Cincin Akurat', 3000));
document.getElementById('btn-attack')?.addEventListener('click', attackWorldBoss);
document.getElementById('btn-dungeon')?.addEventListener('click', exploreDungeon);

// Sinkronisasi Chat, Surat, Potion & Bank tetap sama seperti v12 ...
