import { db, auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { registerWithEmail, loginWithEmail, logoutUser } from './auth.js';
import { doc, collection, getDoc, onSnapshot, runTransaction, addDoc, query, orderBy, limit, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

let currentUserUid = null;
let isCooldown = false;
let isLoginMode = true; 
let activeUnsubscribeListeners = [];
let currentAccuracy = 0; // Disimpan global untuk perhitungan saat serang boss

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
    listenToPlayerData();
    listenToWorldBoss();
    listenToChat();
    loadMailbox(); 
}

// ==========================================
// INISIALISASI ATRIBUT & SLOT
// ==========================================
async function selectCharacterClass(className) {
    if (!currentUserUid) return;
    const userRef = doc(db, "users", currentUserUid);
    
    let stats = { str: 0, con: 0, dex: 0, int: 0 };
    if (className === 'Warrior') { stats = { str: 15, con: 20, dex: 5, int: 2 }; } 
    else if (className === 'Mage') { stats = { str: 2, con: 8, dex: 10, int: 25 }; }

    const maxHp = 1000 + (stats.con * 50);
    const maxMp = 200 + (stats.int * 30);

    try {
        await setDoc(userRef, {
            username: "Hero_" + currentUserUid.substring(0, 4),
            characterClass: className,
            level: 1, exp: 0, gold: 5000, coin: 50, bankGold: 0, 
            inventory: { "Roti Keras": 5 }, 
            equipment: { weapon: null, armor: null, accessory: null },
            ...stats,
            maxHp: maxHp, currentHp: maxHp, maxMp: maxMp, currentMp: maxMp,
            lastAction: 0
        });

        await addDoc(collection(db, "mailbox", currentUserUid, "messages"), {
            title: "Paket Petualang Baru",
            body: "Ini adalah perlengkapan dan emas awal untukmu. Gunakan dengan bijak!",
            attachments: { gold: 10000 },
            isClaimed: false, timestamp: serverTimestamp()
        });

        showScreen('screen-game');
        startLiveGameSync();
    } catch (err) { alert("Error: " + err); }
}

// ==========================================
// SINKRONISASI DATA & KALKULASI ATRIBUT (TERMASUK EQUIP)
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

        // Baca Equipment
        const eq = d.equipment || {};
        document.getElementById('eq-weapon').innerText = eq.weapon ? eq.weapon.name : "Kosong";
        document.getElementById('eq-armor').innerText = eq.armor ? eq.armor.name : "Kosong";
        document.getElementById('eq-acc').innerText = eq.accessory ? eq.accessory.name : "Kosong";

        // Kalkulasi Turunan Atribut Dasar + Equipment
        let eqPatk = eq.weapon?.patk || 0;
        let eqMatk = eq.weapon?.matk || 0;
        let eqDef = eq.armor?.def || 0;
        let eqAccBonus = eq.accessory?.accBonus || 0;

        const patk = 50 + (d.str * 10) + eqPatk;
        const matk = 50 + (d.int * 10) + eqMatk;
        const def = 10 + (d.con * 5) + eqDef;
        const crit = (d.dex * 0.5).toFixed(1);
        const eva = (d.dex * 0.2).toFixed(1);
        
        // Akurasi diperbarui dengan bonus aksesoris
        currentAccuracy = 80 + (d.dex * 0.5) + eqAccBonus;

        document.getElementById('stat-patk').innerText = patk;
        document.getElementById('stat-matk').innerText = matk;
        document.getElementById('stat-def').innerText = def;
        document.getElementById('stat-crit').innerText = crit + "%";
        document.getElementById('stat-eva').innerText = eva + "%";
        document.getElementById('stat-acc').innerText = currentAccuracy.toFixed(1) + "%";

        // Render Grid Inventaris 4x5 (20 Slot)
        const invGrid = document.getElementById('inventory-grid');
        invGrid.innerHTML = "";
        let items = Object.entries(d.inventory || {});
        
        for (let i = 0; i < 20; i++) {
            if (i < items.length) {
                const [name, qty] = items[i];
                invGrid.innerHTML += `<div class="inv-slot filled">
                    <span>${escapeHTML(name)}</span>
                    <span class="inv-qty">x${qty}</span>
                </div>`;
            } else {
                invGrid.innerHTML += `<div class="inv-slot">Kosong</div>`;
            }
        }
    });
    activeUnsubscribeListeners.push(unsub);
}

// ==========================================
// TOKO PERLENGKAPAN
// ==========================================
async function buyEquipment(slot, eqName, stats, cost) {
    if (!currentUserUid) return;
    const userRef = doc(db, "users", currentUserUid);
    try {
        await runTransaction(db, async (ts) => {
            const data = (await ts.get(userRef)).data();
            if ((data.gold || 0) < cost) throw "Gold tidak cukup!";
            
            let currentEq = data.equipment || { weapon: null, armor: null, accessory: null };
            currentEq[slot] = { name: eqName, ...stats };

            ts.update(userRef, { gold: data.gold - cost, equipment: currentEq });
        });
        alert(`Berhasil membeli ${eqName}!`);
    } catch (err) { alert(err); }
}

// ==========================================
// MEKANIK BATTLE DENGAN AKURASI (MISS)
// ==========================================
async function attackWorldBoss() {
    if (!currentUserUid || isCooldown) return;
    document.getElementById('btn-attack').disabled = true; isCooldown = true;

    const bossRef = doc(db, "server", "world_boss"); 
    const userRef = doc(db, "users", currentUserUid);
    
    try {
        await runTransaction(db, async (ts) => {
            const bossDoc = await ts.get(bossRef); const userDoc = await ts.get(userRef);
            if (!bossDoc.exists()) throw "Boss tidak ditemukan!";
            
            const data = userDoc.data();
            if (Date.now() - (data.lastAction || 0) < 2000) throw "Cooldown!";

            let updates = { lastAction: Date.now() };

            // Cek Akurasi: Jika random (1-100) > currentAccuracy, maka MISS!
            const hitRoll = Math.random() * 100;
            if (hitRoll > currentAccuracy) {
                ts.update(userRef, updates);
                throw "Seranganmu Meleset (MISS)!"; 
            }

            // Hitung Damage
            let baseDamage = 0;
            const eq = data.equipment || {};
            if (data.characterClass === 'Warrior') {
                baseDamage = 50 + (data.str * 10) + (eq.weapon?.patk || 0);
            } else {
                baseDamage = 50 + (data.int * 10) + (eq.weapon?.matk || 0);
            }
            
            const isCrit = (Math.random() * 100) < (data.dex * 0.5);
            if (isCrit) baseDamage *= 2; 

            let cLvl = data.level || 1; let cExp = (data.exp || 0) + 30;
            if (cExp >= (cLvl * 100)) { cLvl++; cExp -= ((cLvl-1)*100); updates.level = cLvl; }
            updates.exp = cExp;

            let newHp = bossDoc.data().hp - baseDamage;
            ts.update(bossRef, { hp: newHp < 0 ? 0 : newHp });
            ts.update(userRef, updates);
        });
    } catch (err) { 
        if (err.includes("MISS")) {
            // Animasi/Notif visual kecil jika miss
            const btn = document.getElementById('btn-attack');
            const oldText = btn.innerText;
            btn.innerText = "MISS!"; btn.style.background = "#555";
            setTimeout(() => { btn.innerText = oldText; btn.style.background = "#e67e22"; }, 1000);
        } else {
            console.log(err); 
        }
    }
    setTimeout(() => { document.getElementById('btn-attack').disabled = false; isCooldown = false; }, 2000);
}

// ==========================================
// ITEM MALL & LAINNYA
// ==========================================
async function buyMallGacha() {
    if (!currentUserUid) return;
    const userRef = doc(db, "users", currentUserUid);
    try {
        await runTransaction(db, async (ts) => {
            const data = (await ts.get(userRef)).data();
            if ((data.coin || 0) < 20) throw "COIN tidak cukup!";
            const randomGold = Math.floor(Math.random() * 5000) + 1000;
            ts.update(userRef, { coin: data.coin - 20, gold: (data.gold || 0) + randomGold });
            alert(`Gacha: +${randomGold} GOLD!`);
        });
    } catch (err) { alert(err); }
}

async function buyMallName() {
    const newName = prompt("Masukkan Nama Baru:");
    if (!newName || newName.length > 15) return;
    const userRef = doc(db, "users", currentUserUid);
    try {
        await runTransaction(db, async (ts) => {
            const data = (await ts.get(userRef)).data();
            if ((data.coin || 0) < 50) throw "COIN tidak cukup!";
            ts.update(userRef, { coin: data.coin - 50, username: newName });
        });
    } catch (err) { alert(err); }
}

async function bankTransaction(type) {
    const inputVal = parseInt(document.getElementById('input-bank').value);
    if (!inputVal || inputVal <= 0 || !currentUserUid) return;
    const userRef = doc(db, "users", currentUserUid);
    try {
        await runTransaction(db, async (ts) => {
            const docData = (await ts.get(userRef)).data();
            let wallet = docData.gold || 0; let bank = docData.bankGold || 0;
            if (type === 'DEPOSIT') {
                if (wallet < inputVal) throw "Gold tidak cukup!";
                ts.update(userRef, { gold: wallet - inputVal, bankGold: bank + inputVal });
            } else {
                if (bank < inputVal) throw "Brankas tidak cukup!";
                ts.update(userRef, { gold: wallet + inputVal, bankGold: bank - inputVal });
            }
        });
        document.getElementById('input-bank').value = "";
    } catch (err) { alert(err); }
}

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

            if (Math.random() < 0.3) {
                let currentInv = data.inventory || {};
                currentInv["Batu Dungeon"] = (currentInv["Batu Dungeon"] || 0) + 1;
                updates.inventory = currentInv;
            }
            ts.update(userRef, updates);
        });
    } catch (err) { alert(err); }
    setTimeout(() => { document.getElementById('btn-dungeon').disabled = false; isCooldown = false; }, 2000);
}

async function buyPotion(type) {
    if (!currentUserUid) return;
    const userRef = doc(db, "users", currentUserUid);
    try {
        await runTransaction(db, async (ts) => {
            const data = (await ts.get(userRef)).data();
            if ((data.gold || 0) < 500) throw "Gold tidak cukup!";
            let updates = { gold: data.gold - 500 };
            if (type === 'HP') updates.currentHp = Math.min((data.currentHp || 0) + 500, data.maxHp);
            if (type === 'MP') updates.currentMp = Math.min((data.currentMp || 0) + 300, data.maxMp);
            ts.update(userRef, updates);
        });
    } catch (err) { alert(err); }
}

function listenToWorldBoss() {
    const unsub = onSnapshot(doc(db, "server", "world_boss"), (docSnap) => {
        if (!docSnap.exists()) return;
        const d = docSnap.data();
        document.getElementById('boss-name').innerText = d.name;
        document.getElementById('hp-text').innerText = `${d.hp.toLocaleString()} / ${d.maxHp.toLocaleString()} HP`;
        document.getElementById('hp-bar').style.width = `${Math.max(0, (d.hp / d.maxHp) * 100)}%`;
    });
    activeUnsubscribeListeners.push(unsub);
}

function loadMailbox() {
    const q = query(collection(db, "mailbox", currentUserUid, "messages"), orderBy("timestamp", "desc"));
    const unsub = onSnapshot(q, (snapshot) => {
        const list = document.getElementById('mailbox-list'); list.innerHTML = "";
        snapshot.forEach((docSnap) => {
            const msg = docSnap.data();
            let btnKlaim = (!msg.isClaimed && msg.attachments) 
                ? `<button onclick="window.claimMailItem('${docSnap.id}')" style="margin-top: 5px; font-size: 10px; padding: 2px 5px; background: #28a745;">Klaim</button>`
                : `<span style="color:#777; font-size: 10px;">(Diklaim)</span>`;
            list.innerHTML += `<div style="border-bottom:1px solid #333; padding:5px 0;">
                <strong style="color:#00d2ff;">${escapeHTML(msg.title)}</strong><br>${btnKlaim}</div>`;
        });
    });
    activeUnsubscribeListeners.push(unsub);
}

window.claimMailItem = async function(msgId) {
    if (!currentUserUid) return;
    const mailRef = doc(db, "mailbox", currentUserUid, "messages", msgId);
    const userRef = doc(db, "users", currentUserUid);
    try {
        await runTransaction(db, async (ts) => {
            const mailDoc = await ts.get(mailRef); const userDoc = await ts.get(userRef);
            if (mailDoc.data().isClaimed) throw "Sudah diklaim!";
            ts.update(mailRef, { isClaimed: true });
            ts.update(userRef, { gold: (userDoc.data().gold || 0) + (mailDoc.data().attachments.gold || 0) });
        });
    } catch (err) { alert(err); }
};

function listenToChat() {
    const q = query(collection(db, "global_chat"), orderBy("timestamp", "asc"), limit(20));
    const unsub = onSnapshot(q, (snapshot) => {
        const chatBox = document.getElementById('chat-box'); chatBox.innerHTML = "";
        snapshot.forEach((docSnap) => {
            const d = docSnap.data();
            chatBox.innerHTML += `<div style="margin-bottom:4px;"><span class="chat-name">${escapeHTML(d.senderName)}</span>: <span>${escapeHTML(d.message)}</span></div>`;
        });
        chatBox.scrollTop = chatBox.scrollHeight;
    });
    activeUnsubscribeListeners.push(unsub);
}

async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text || !currentUserUid) return;
    try {
        const d = (await getDoc(doc(db, "users", currentUserUid))).data();
        await addDoc(collection(db, "global_chat"), { senderName: d.username, message: text, timestamp: serverTimestamp() });
        input.value = "";
    } catch (err) {}
}

// ==========================================
// EVENT LISTENER
// ==========================================
document.getElementById('link-toggle-auth')?.addEventListener('click', (e) => {
    e.preventDefault(); isLoginMode = !isLoginMode;
    document.getElementById('auth-title').innerText = isLoginMode ? "Masuk" : "Daftar";
    document.getElementById('btn-primary-auth').innerText = isLoginMode ? "MASUK" : "DAFTAR";
});
document.getElementById('btn-primary-auth')?.addEventListener('click', async () => {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    if (!email || !password) return alert("Isi form!");
    try { isLoginMode ? await loginWithEmail(email, password) : await registerWithEmail(email, password); } 
    catch (err) { alert(err); }
});

document.getElementById('btn-logout')?.addEventListener('click', logoutUser);
document.getElementById('class-warrior')?.addEventListener('click', () => selectCharacterClass('Warrior'));
document.getElementById('class-mage')?.addEventListener('click', () => selectCharacterClass('Mage'));

document.getElementById('btn-attack')?.addEventListener('click', attackWorldBoss);
document.getElementById('btn-dungeon')?.addEventListener('click', exploreDungeon);

document.getElementById('btn-buy-sword')?.addEventListener('click', () => buyEquipment('weapon', 'Pedang Besi', { patk: 30 }, 2000));
document.getElementById('btn-buy-staff')?.addEventListener('click', () => buyEquipment('weapon', 'Tongkat Sihir', { matk: 30 }, 2000));
document.getElementById('btn-buy-armor')?.addEventListener('click', () => buyEquipment('armor', 'Zirah Kulit', { def: 20 }, 2000));
document.getElementById('btn-buy-ring')?.addEventListener('click', () => buyEquipment('accessory', 'Cincin Akurat', { accBonus: 10 }, 3000));

document.getElementById('btn-deposit')?.addEventListener('click', () => bankTransaction('DEPOSIT'));
document.getElementById('btn-withdraw')?.addEventListener('click', () => bankTransaction('WITHDRAW'));
document.getElementById('btn-buy-hp')?.addEventListener('click', () => buyPotion('HP'));
document.getElementById('btn-buy-mp')?.addEventListener('click', () => buyPotion('MP'));
document.getElementById('btn-mall-gacha')?.addEventListener('click', buyMallGacha);
document.getElementById('btn-mall-name')?.addEventListener('click', buyMallName);

document.getElementById('btn-send-chat')?.addEventListener('click', sendChatMessage);
document.getElementById('chat-input')?.addEventListener('keypress', (e) => { if(e.key === 'Enter') sendChatMessage(); });
