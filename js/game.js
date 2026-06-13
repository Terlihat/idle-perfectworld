import { db, auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { registerWithEmail, loginWithEmail, logoutUser } from './auth.js';
import { doc, collection, getDoc, getDocs, onSnapshot, runTransaction, addDoc, query, orderBy, limit, serverTimestamp, where, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

let currentUserUid = null;
let isAttackCooldown = false;
let isLoginMode = true; 
let activeUnsubscribeListeners = [];

// ==========================================
// UTILITAS UTAMA
// ==========================================
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    document.getElementById(screenId).style.display = 'block';
}

function escapeHTML(str) {
    if (!str) return "";
    return str.replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
}

// ==========================================
// MANAJEMEN AUTENTIKASI & LAYAR
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUserUid = user.uid;
        document.getElementById('player-uid').innerText = currentUserUid.substring(0, 8);
        
        const userRef = doc(db, "users", currentUserUid);
        const docSnap = await getDoc(userRef);

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
    listenToGuilds();
    loadMailbox();
}

// ==========================================
// LOGIKA PEMILIHAN KARAKTER (STARTER PACK)
// ==========================================
async function selectCharacterClass(className) {
    if (!currentUserUid) return;
    const userRef = doc(db, "users", currentUserUid);
    
    let baseStats = {};
    if (className === 'Warrior') {
        baseStats = { maxHp: 2000, currentHp: 2000, maxMp: 500, currentMp: 500, baseDmg: 200 };
    } else if (className === 'Mage') {
        baseStats = { maxHp: 1000, currentHp: 1000, maxMp: 1500, currentMp: 1500, baseDmg: 350 };
    }

    try {
        await setDoc(userRef, {
            username: "Ksatria_" + currentUserUid.substring(0, 4),
            characterClass: className,
            gold: 0, 
            level: 1,
            exp: 0,
            lastAttack: 0,
            ...baseStats
        });

        // Kirim Starter Pack ke Kotak Surat
        await addDoc(collection(db, "mailbox", currentUserUid, "messages"), {
            title: "🎁 Paket Pemula",
            body: "Selamat datang di Giga RPG! Terimalah modal awal pertempuranmu.",
            attachments: { gold: 20000 },
            isClaimed: false,
            timestamp: serverTimestamp()
        });
        
        alert(`Karakter ${className} berhasil dibuat! Buka Kotak Surat untuk mengambil Modal Awal.`);
        showScreen('screen-game');
        startLiveGameSync();
    } catch (err) { alert("Error: " + err); }
}

// ==========================================
// SINKRONISASI DATA PEMAIN REALTIME
// ==========================================
function listenToPlayerData() {
    const unsub = onSnapshot(doc(db, "users", currentUserUid), (docSnap) => {
        if (!docSnap.exists()) return;
        const data = docSnap.data();
        
        const lvl = data.level || 1;
        const maxExp = lvl * 100;
        
        document.getElementById('player-name').innerText = data.username;
        document.getElementById('player-class').innerText = data.characterClass || "Warrior";
        document.getElementById('player-gold').innerText = (data.gold || 0).toLocaleString();
        document.getElementById('player-level').innerText = lvl;
        
        document.getElementById('exp-text').innerText = `${data.exp || 0} / ${maxExp} EXP`;
        document.getElementById('exp-bar').style.width = `${Math.min(((data.exp || 0) / maxExp) * 100, 100)}%`;

        const cHp = data.currentHp || 0; const mHp = data.maxHp || 1;
        const cMp = data.currentMp || 0; const mMp = data.maxMp || 1;
        
        document.getElementById('char-hp-text').innerText = `${cHp} / ${mHp} HP`;
        document.getElementById('char-hp-bar').style.width = `${Math.min((cHp / mHp) * 100, 100)}%`;
        
        document.getElementById('char-mp-text').innerText = `${cMp} / ${mMp} MP`;
        document.getElementById('char-mp-bar').style.width = `${Math.min((cMp / mMp) * 100, 100)}%`;
    });
    activeUnsubscribeListeners.push(unsub);
}

// ==========================================
// MEKANIK WORLD BOSS & LEVELING
// ==========================================
function listenToWorldBoss() {
    const unsub = onSnapshot(doc(db, "server", "world_boss"), (docSnap) => {
        if (!docSnap.exists()) return;
        const data = docSnap.data();
        document.getElementById('boss-name').innerText = data.name;
        document.getElementById('hp-text').innerText = `${data.hp.toLocaleString()} / ${data.maxHp.toLocaleString()} HP`;
        document.getElementById('hp-bar').style.width = `${Math.max(0, (data.hp / data.maxHp) * 100)}%`;
        document.getElementById('btn-attack').disabled = data.hp <= 0;
    });
    activeUnsubscribeListeners.push(unsub);
}

async function attackWorldBoss() {
    if (!currentUserUid || isAttackCooldown) return;

    const btnAttack = document.getElementById('btn-attack');
    btnAttack.disabled = true;
    isAttackCooldown = true;

    const bossRef = doc(db, "server", "world_boss");
    const userRef = doc(db, "users", currentUserUid);

    try {
        await runTransaction(db, async (ts) => {
            const bossDoc = await ts.get(bossRef);
            const userDoc = await ts.get(userRef);
            if (!bossDoc.exists()) throw "Boss tidak ditemukan!";
            
            const userData = userDoc.data();
            const now = Date.now();
            if (now - (userData.lastAttack || 0) < 2000) throw "Cooldown menyerang (2 detik)!";

            // Hitung Damage & EXP (Base Damage Karakter + Random)
            const damage = (userData.baseDmg || 100) + Math.floor(Math.random() * 50);
            const expGained = Math.floor(Math.random() * 30) + 10;

            let currentLevel = userData.level || 1;
            let currentExp = (userData.exp || 0) + expGained;
            let expNeeded = currentLevel * 100;

            if (currentExp >= expNeeded) {
                currentLevel += 1;
                currentExp -= expNeeded;
            }

            let newHp = bossDoc.data().hp - damage;
            ts.update(bossRef, { hp: newHp < 0 ? 0 : newHp });
            ts.update(userRef, { lastAttack: now, level: currentLevel, exp: currentExp });
        });
    } catch (err) { console.log(err); }

    setTimeout(() => { btnAttack.disabled = false; isAttackCooldown = false; }, 2000);
}

// ==========================================
// TOKO ALKEMIS & PENGATURAN NAMA
// ==========================================
async function buyPotion(type) {
    if (!currentUserUid) return;
    const userRef = doc(db, "users", currentUserUid);
    const cost = 500;

    try {
        await runTransaction(db, async (ts) => {
            const docSnap = await ts.get(userRef);
            const data = docSnap.data();
            
            if ((data.gold || 0) < cost) throw "Gold tidak cukup!";
            
            let updates = { gold: data.gold - cost };

            if (type === 'HP') {
                const newHp = Math.min((data.currentHp || 0) + 500, data.maxHp || 1000);
                if (data.currentHp === newHp) throw "HP sudah penuh!";
                updates.currentHp = newHp;
            } else if (type === 'MP') {
                const newMp = Math.min((data.currentMp || 0) + 300, data.maxMp || 500);
                if (data.currentMp === newMp) throw "MP sudah penuh!";
                updates.currentMp = newMp;
            }

            ts.update(userRef, updates);
        });
    } catch (err) { alert(err); }
}

async function changePlayerName() {
    const input = document.getElementById('input-new-name');
    const newName = input.value.trim();
    if (!newName || !currentUserUid) return alert("Nama tidak boleh kosong!");
    if (newName.length > 15) return alert("Maksimal 15 karakter!");

    const userRef = doc(db, "users", currentUserUid);
    try {
        await runTransaction(db, async (ts) => {
            const userDoc = await ts.get(userRef);
            if ((userDoc.data().gold || 0) < 2000) throw "Gold tidak cukup!";
            ts.update(userRef, { gold: userDoc.data().gold - 2000, username: newName });
        });
        input.value = "";
        alert("Berhasil ganti nama menjadi: " + newName);
    } catch (err) { alert(err); }
}

// ==========================================
// SISTEM KOTAK SURAT (CLAIM STARTER PACK)
// ==========================================
function loadMailbox() {
    const q = query(collection(db, "mailbox", currentUserUid, "messages"), orderBy("timestamp", "desc"));
    const unsub = onSnapshot(q, (snapshot) => {
        const list = document.getElementById('mailbox-list'); list.innerHTML = "";
        if (snapshot.empty) { list.innerHTML = "<p style='color:#aaa'>Tidak ada pesan.</p>"; return; }
        
        snapshot.forEach((docSnap) => {
            const msg = docSnap.data();
            const div = document.createElement('div');
            div.style.borderBottom = "1px solid #3f3f52"; div.style.padding = "10px 0";
            
            let btnKlaim = '';
            if (!msg.isClaimed && msg.attachments && msg.attachments.gold) {
                // Tombol klaim memanggil fungsi global
                btnKlaim = `<button onclick="window.claimMailItem('${docSnap.id}')" style="margin-top: 8px; font-size: 11px; padding: 5px 10px; background: #28a745;">Klaim ${msg.attachments.gold.toLocaleString()} Gold</button>`;
            } else if (msg.isClaimed) {
                btnKlaim = `<br><span style="color:#aaa; font-size: 11px;">(Hadiah Sudah Diklaim)</span>`;
            }

            div.innerHTML = `✉️ <strong style="color:#00d2ff;">${escapeHTML(msg.title)}</strong><br>
                             <span style="font-size:13px; color:#ddd;">${escapeHTML(msg.body)}</span>
                             <br>${btnKlaim}`;
            list.appendChild(div);
        });
    });
    activeUnsubscribeListeners.push(unsub);
}

// Mengekspos fungsi ke window agar bisa dipanggil oleh tombol HTML on-the-fly
window.claimMailItem = async function(msgId) {
    if (!currentUserUid) return;
    const mailRef = doc(db, "mailbox", currentUserUid, "messages", msgId);
    const userRef = doc(db, "users", currentUserUid);
    try {
        await runTransaction(db, async (ts) => {
            const mailDoc = await ts.get(mailRef);
            const userDoc = await ts.get(userRef);
            
            if (!mailDoc.exists()) throw "Surat tidak ditemukan!";
            if (mailDoc.data().isClaimed) throw "Hadiah sudah diklaim sebelumnya!";
            
            const goldReward = mailDoc.data().attachments.gold;
            ts.update(mailRef, { isClaimed: true });
            ts.update(userRef, { gold: (userDoc.data().gold || 0) + goldReward });
        });
        alert("Selamat! Gold berhasil masuk ke tas Anda.");
    } catch (err) { alert(err); }
};

// ==========================================
// FITUR KOMUNITAS (CHAT, LEADERBOARD, GUILD)
// ==========================================
function listenToLeaderboard() {
    const q = query(collection(db, "users"), orderBy("level", "desc"), limit(10));
    const unsub = onSnapshot(q, (snapshot) => {
        const lbList = document.getElementById('leaderboard-list'); lbList.innerHTML = "";
        let rank = 1;
        snapshot.forEach((docSnap) => {
            const p = docSnap.data();
            lbList.innerHTML += `<div class="leaderboard-item"><span>#${rank} ${escapeHTML(p.username)} <small style="color:#888;">(${p.characterClass})</small></span> <span style="color:#00d2ff;">Lv.${p.level}</span></div>`;
            rank++;
        });
    });
    activeUnsubscribeListeners.push(unsub);
}

function listenToChat() {
    const q = query(collection(db, "global_chat"), orderBy("timestamp", "asc"), limit(30));
    const unsub = onSnapshot(q, (snapshot) => {
        const chatBox = document.getElementById('chat-box'); chatBox.innerHTML = "";
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            chatBox.innerHTML += `<div style="margin-bottom:4px;"><span class="chat-name">${escapeHTML(data.senderName)}</span>: <span>${escapeHTML(data.message)}</span></div>`;
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
        const userDoc = await getDoc(doc(db, "users", currentUserUid));
        await addDoc(collection(db, "global_chat"), {
            senderId: currentUserUid,
            senderName: userDoc.data().username,
            message: text,
            timestamp: serverTimestamp()
        });
        input.value = "";
    } catch (err) { console.error(err); }
}

function listenToGuilds() {
    const unsub = onSnapshot(collection(db, "guilds"), (snapshot) => {
        const list = document.getElementById('guild-list'); list.innerHTML = "";
        if (snapshot.empty) { list.innerHTML = "<span style='color:#aaa;'>Belum ada sekte. Jadilah yang pertama!</span>"; return; }
        snapshot.forEach((docSnap) => {
            list.innerHTML += `<div style="border-bottom:1px solid #3f3f52; padding:5px 0;">🏰 <strong>${escapeHTML(docSnap.data().name)}</strong> — Anggota: ${docSnap.data().members.length}</div>`;
        });
    });
    activeUnsubscribeListeners.push(unsub);
}

async function createGuild() {
    const input = document.getElementById('guild-input'); const name = input.value.trim();
    if (!name || !currentUserUid) return;
    const userRef = doc(db, "users", currentUserUid);
    try {
        const check = await getDocs(query(collection(db, "guilds"), where("name", "==", name)));
        if (!check.empty) return alert("Nama sekte sudah dipakai!");
        await runTransaction(db, async (ts) => {
            const usr = await ts.get(userRef);
            if ((usr.data().gold || 0) < 10000) throw "Gold tidak cukup!";
            ts.update(userRef, { gold: usr.data().gold - 10000 });
        });
        await addDoc(collection(db, "guilds"), { name, leaderId: currentUserUid, members: [currentUserUid], createdAt: serverTimestamp() });
        input.value = ""; alert("Sekte didirikan!");
    } catch(e) { alert(e); }
}


// ==========================================
// PENGIKAT EVENT LISTENER (AMAN DARI BUG NULL)
// ==========================================
document.getElementById('link-toggle-auth')?.addEventListener('click', (e) => {
    e.preventDefault();
    isLoginMode = !isLoginMode;
    document.getElementById('auth-title').innerText = isLoginMode ? "Masuk Gerbang RPG" : "Daftar Akun Baru";
    document.getElementById('btn-primary-auth').innerText = isLoginMode ? "MASUK" : "DAFTAR SEKARANG";
    document.getElementById('auth-toggle-text').innerText = isLoginMode ? "Belum punya akun?" : "Sudah punya akun?";
    document.getElementById('link-toggle-auth').innerText = isLoginMode ? "Daftar Sekarang" : "Masuk di Sini";
});

document.getElementById('btn-primary-auth')?.addEventListener('click', async () => {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    if (!email || !password) return alert("Harap isi email dan password!");
    try { isLoginMode ? await loginWithEmail(email, password) : await registerWithEmail(email, password); } 
    catch (err) { alert(err); }
});

document.getElementById('btn-logout')?.addEventListener('click', logoutUser);
document.getElementById('class-warrior')?.addEventListener('click', () => selectCharacterClass('Warrior'));
document.getElementById('class-mage')?.addEventListener('click', () => selectCharacterClass('Mage'));

document.getElementById('btn-attack')?.addEventListener('click', attackWorldBoss);
document.getElementById('btn-buy-hp')?.addEventListener('click', () => buyPotion('HP'));
document.getElementById('btn-buy-mp')?.addEventListener('click', () => buyPotion('MP'));
document.getElementById('btn-change-name')?.addEventListener('click', changePlayerName);
document.getElementById('btn-create-guild')?.addEventListener('click', createGuild);

document.getElementById('btn-send-chat')?.addEventListener('click', sendChatMessage);
document.getElementById('chat-input')?.addEventListener('keypress', (e) => { if(e.key === 'Enter') sendChatMessage(); });
