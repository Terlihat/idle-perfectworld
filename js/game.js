import { db, auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { registerWithEmail, loginWithEmail, logoutUser } from './auth.js';
import { doc, collection, getDoc, onSnapshot, runTransaction, addDoc, query, orderBy, limit, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

let currentUserUid = null;
let isCooldown = false;
let isLoginMode = true; 
let activeUnsubscribeListeners = [];

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
    listenToLeaderboard();
    listenToChat();
}

// ==========================================
// INISIALISASI ATRIBUT KARAKTER (BARU)
// ==========================================
async function selectCharacterClass(className) {
    if (!currentUserUid) return;
    const userRef = doc(db, "users", currentUserUid);
    
    // Penetapan Base Stats
    let stats = { str: 0, con: 0, dex: 0, int: 0 };
    if (className === 'Warrior') { stats = { str: 15, con: 20, dex: 5, int: 2 }; } 
    else if (className === 'Mage') { stats = { str: 2, con: 8, dex: 10, int: 25 }; }

    // Formula Batas HP & MP Awal
    const maxHp = 1000 + (stats.con * 50);
    const maxMp = 200 + (stats.int * 30);

    try {
        await setDoc(userRef, {
            username: "Hero_" + currentUserUid.substring(0, 4),
            characterClass: className,
            level: 1,
            exp: 0,
            gold: 5000, 
            bankGold: 0, // Fitur Bankir
            inventory: { "Roti Keras": 5 }, // Fitur Inventaris
            ...stats,
            maxHp: maxHp, currentHp: maxHp,
            maxMp: maxMp, currentMp: maxMp,
            lastAction: 0
        });
        showScreen('screen-game');
        startLiveGameSync();
    } catch (err) { alert("Error: " + err); }
}

// ==========================================
// SINKRONISASI DATA & KALKULASI STATUS REALTIME
// ==========================================
function listenToPlayerData() {
    const unsub = onSnapshot(doc(db, "users", currentUserUid), (docSnap) => {
        if (!docSnap.exists()) return;
        const d = docSnap.data();
        
        // Render Info Dasar
        document.getElementById('player-name').innerText = d.username;
        document.getElementById('player-class').innerText = d.characterClass;
        document.getElementById('player-level').innerText = d.level || 1;
        document.getElementById('player-gold').innerText = (d.gold || 0).toLocaleString() + " G";
        document.getElementById('player-bank').innerText = (d.bankGold || 0).toLocaleString() + " G";
        
        // Render Bar
        const maxExp = (d.level || 1) * 100;
        document.getElementById('exp-text').innerText = `${d.exp || 0} / ${maxExp}`;
        document.getElementById('exp-bar').style.width = `${Math.min(((d.exp || 0) / maxExp) * 100, 100)}%`;

        document.getElementById('char-hp-text').innerText = `${d.currentHp} / ${d.maxHp}`;
        document.getElementById('char-hp-bar').style.width = `${Math.min((d.currentHp / d.maxHp) * 100, 100)}%`;
        
        document.getElementById('char-mp-text').innerText = `${d.currentMp} / ${d.maxMp}`;
        document.getElementById('char-mp-bar').style.width = `${Math.min((d.currentMp / d.maxMp) * 100, 100)}%`;

        // Render Stats Atribut
        document.getElementById('stat-str').innerText = d.str;
        document.getElementById('stat-con').innerText = d.con;
        document.getElementById('stat-dex').innerText = d.dex;
        document.getElementById('stat-int').innerText = d.int;

        // Formula Turunan Stat
        const isWarrior = d.characterClass === 'Warrior';
        const atk = 50 + (isWarrior ? (d.str * 10) : (d.int * 10));
        const crit = (d.dex * 0.5).toFixed(1);
        const eva = (d.dex * 0.2).toFixed(1);
        const acc = (80 + (d.dex * 0.2)).toFixed(1);

        document.getElementById('stat-atk').innerText = atk;
        document.getElementById('stat-crit').innerText = crit + "%";
        document.getElementById('stat-eva').innerText = eva + "%";
        document.getElementById('stat-acc').innerText = acc + "%";

        // Render Inventaris
        const invBox = document.getElementById('inventory-list');
        invBox.innerHTML = "";
        if (d.inventory) {
            for (const [itemName, qty] of Object.entries(d.inventory)) {
                invBox.innerHTML += `<span class="inv-item">${escapeHTML(itemName)} x${qty}</span>`;
            }
        } else {
            invBox.innerHTML = "<span style='color:#777'>Tas kosong.</span>";
        }
    });
    activeUnsubscribeListeners.push(unsub);
}

// ==========================================
// FITUR BARU: BANKIR
// ==========================================
async function bankTransaction(type) {
    const inputVal = parseInt(document.getElementById('input-bank').value);
    if (!inputVal || inputVal <= 0 || !currentUserUid) return alert("Masukkan jumlah yang valid!");

    const userRef = doc(db, "users", currentUserUid);
    try {
        await runTransaction(db, async (ts) => {
            const docData = (await ts.get(userRef)).data();
            let wallet = docData.gold || 0;
            let bank = docData.bankGold || 0;

            if (type === 'DEPOSIT') {
                if (wallet < inputVal) throw "Uang di dompet tidak cukup!";
                ts.update(userRef, { gold: wallet - inputVal, bankGold: bank + inputVal });
            } else {
                if (bank < inputVal) throw "Uang di brankas tidak cukup!";
                ts.update(userRef, { gold: wallet + inputVal, bankGold: bank - inputVal });
            }
        });
        document.getElementById('input-bank').value = "";
    } catch (err) { alert(err); }
}

// ==========================================
// FITUR BARU: EKSPLORASI DUNGEON
// ==========================================
async function exploreDungeon() {
    if (!currentUserUid || isCooldown) return;
    
    document.getElementById('btn-dungeon').disabled = true;
    isCooldown = true;
    const userRef = doc(db, "users", currentUserUid);

    try {
        await runTransaction(db, async (ts) => {
            const data = (await ts.get(userRef)).data();
            const now = Date.now();
            
            if (now - (data.lastAction || 0) < 2000) throw "Sedang memulihkan nafas (Cooldown)!";
            if (data.currentMp < 20) throw "MP tidak cukup untuk konsentrasi di Dungeon!";

            // Reward Gacha
            const expGained = Math.floor(Math.random() * 50) + 20;
            const goldGained = Math.floor(Math.random() * 300) + 100;
            
            let updates = {
                currentMp: data.currentMp - 20,
                gold: (data.gold || 0) + goldGained,
                lastAction: now
            };

            // Logic Naik Level
            let cLvl = data.level || 1;
            let cExp = (data.exp || 0) + expGained;
            if (cExp >= (cLvl * 100)) { cLvl++; cExp -= ((cLvl-1)*100); updates.level = cLvl; }
            updates.exp = cExp;

            // Logic Drop Item Inventaris (30% Chance)
            if (Math.random() < 0.3) {
                const drops = ["Kristal Gelap", "Tulang Monster", "Koin Kuno"];
                const dropItem = drops[Math.floor(Math.random() * drops.length)];
                let currentInv = data.inventory || {};
                currentInv[dropItem] = (currentInv[dropItem] || 0) + 1;
                updates.inventory = currentInv;
            }

            ts.update(userRef, updates);
        });
    } catch (err) { alert(err); }

    setTimeout(() => { document.getElementById('btn-dungeon').disabled = false; isCooldown = false; }, 2000);
}

// ==========================================
// TOKO AHLI OBAT (DULU ALKEMIS)
// ==========================================
async function buyPotion(type) {
    if (!currentUserUid) return;
    const userRef = doc(db, "users", currentUserUid);
    try {
        await runTransaction(db, async (ts) => {
            const data = (await ts.get(userRef)).data();
            if ((data.gold || 0) < 500) throw "Gold tidak cukup!";
            let updates = { gold: data.gold - 500 };

            if (type === 'HP') {
                const newHp = Math.min((data.currentHp || 0) + 500, data.maxHp);
                if (data.currentHp === newHp) throw "HP sudah penuh!";
                updates.currentHp = newHp;
            } else if (type === 'MP') {
                const newMp = Math.min((data.currentMp || 0) + 300, data.maxMp);
                if (data.currentMp === newMp) throw "MP sudah penuh!";
                updates.currentMp = newMp;
            }
            ts.update(userRef, updates);
        });
    } catch (err) { alert(err); }
}

// ==========================================
// WORLD BOSS (DENGAN HITUNGAN STATS)
// ==========================================
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

async function attackWorldBoss() {
    if (!currentUserUid || isCooldown) return;
    document.getElementById('btn-attack').disabled = true;
    isCooldown = true;

    const bossRef = doc(db, "server", "world_boss");
    const userRef = doc(db, "users", currentUserUid);

    try {
        await runTransaction(db, async (ts) => {
            const bossDoc = await ts.get(bossRef);
            const userDoc = await ts.get(userRef);
            if (!bossDoc.exists()) throw "Boss tidak ditemukan!";
            
            const data = userDoc.data();
            const now = Date.now();
            if (now - (data.lastAction || 0) < 2000) throw "Cooldown menyerang!";

            // Kalkulasi Damage berdasarkan Stat + Critical Chance
            const isWarrior = data.characterClass === 'Warrior';
            let baseDamage = 50 + (isWarrior ? (data.str * 10) : (data.int * 10));
            const isCrit = (Math.random() * 100) < (data.dex * 0.5); // DEX menentukan Crit
            
            if (isCrit) baseDamage *= 2; // Damage ganda jika critical
            
            let updates = { lastAction: now };

            // Logic Naik Level dari nyerang boss
            let cLvl = data.level || 1;
            let cExp = (data.exp || 0) + 30; // Boss beri EXP flat
            if (cExp >= (cLvl * 100)) { cLvl++; cExp -= ((cLvl-1)*100); updates.level = cLvl; }
            updates.exp = cExp;

            let newHp = bossDoc.data().hp - baseDamage;
            ts.update(bossRef, { hp: newHp < 0 ? 0 : newHp });
            ts.update(userRef, updates);
        });
    } catch (err) { console.log(err); }

    setTimeout(() => { document.getElementById('btn-attack').disabled = false; isCooldown = false; }, 2000);
}

// ==========================================
// FITUR SOSIAL
// ==========================================
function listenToLeaderboard() {
    const q = query(collection(db, "users"), orderBy("level", "desc"), limit(5));
    const unsub = onSnapshot(q, (snapshot) => {
        const lbList = document.getElementById('leaderboard-list'); lbList.innerHTML = "";
        let rank = 1;
        snapshot.forEach((docSnap) => {
            const p = docSnap.data();
            lbList.innerHTML += `<div style="border-bottom:1px solid #333; padding:5px 0; display:flex; justify-content:space-between;"><span>#${rank} ${escapeHTML(p.username)}</span> <span style="color:#00d2ff;">Lv.${p.level}</span></div>`;
            rank++;
        });
    });
    activeUnsubscribeListeners.push(unsub);
}

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
    } catch (err) { console.error(err); }
}

// ==========================================
// PENGIKAT EVENT LISTENER
// ==========================================
document.getElementById('link-toggle-auth')?.addEventListener('click', (e) => {
    e.preventDefault();
    isLoginMode = !isLoginMode;
    document.getElementById('auth-title').innerText = isLoginMode ? "Masuk Gerbang RPG" : "Daftar Akun Baru";
    document.getElementById('btn-primary-auth').innerText = isLoginMode ? "MASUK" : "DAFTAR SEKARANG";
    document.getElementById('auth-toggle-text').innerText = isLoginMode ? "Belum punya akun?" : "Sudah punya akun?";
    document.getElementById('link-toggle-auth').innerText = isLoginMode ? "Daftar" : "Masuk";
});

document.getElementById('btn-primary-auth')?.addEventListener('click', async () => {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    if (!email || !password) return alert("Isi email dan password!");
    try { isLoginMode ? await loginWithEmail(email, password) : await registerWithEmail(email, password); } 
    catch (err) { alert(err); }
});

document.getElementById('btn-logout')?.addEventListener('click', logoutUser);
document.getElementById('class-warrior')?.addEventListener('click', () => selectCharacterClass('Warrior'));
document.getElementById('class-mage')?.addEventListener('click', () => selectCharacterClass('Mage'));

document.getElementById('btn-attack')?.addEventListener('click', attackWorldBoss);
document.getElementById('btn-dungeon')?.addEventListener('click', exploreDungeon);

document.getElementById('btn-deposit')?.addEventListener('click', () => bankTransaction('DEPOSIT'));
document.getElementById('btn-withdraw')?.addEventListener('click', () => bankTransaction('WITHDRAW'));

document.getElementById('btn-buy-hp')?.addEventListener('click', () => buyPotion('HP'));
document.getElementById('btn-buy-mp')?.addEventListener('click', () => buyPotion('MP'));

document.getElementById('btn-send-chat')?.addEventListener('click', sendChatMessage);
document.getElementById('chat-input')?.addEventListener('keypress', (e) => { if(e.key === 'Enter') sendChatMessage(); });
