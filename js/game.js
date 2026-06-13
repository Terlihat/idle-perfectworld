import { db, auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { registerWithEmail, loginWithEmail, logoutUser } from './auth.js';
import { doc, collection, getDoc, onSnapshot, runTransaction, addDoc, query, orderBy, limit, serverTimestamp, where, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

let currentUserUid = null;
let isAttackCooldown = false;
let isLoginMode = true; // Status penanda layar Login vs Register

// Array penampung fungsi pembersih listener realtime untuk mencegah kebocoran memori/data
let activeUnsubscribeListeners = [];

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    document.getElementById(screenId).style.display = 'block';
}

function escapeHTML(str) {
    if (!str) return "";
    return str.replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
}

// ==========================================
// 1. MANAJEMEN STATUS AUTH & ROUTING SCREEN
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUserUid = user.uid;
        document.getElementById('player-uid').innerText = currentUserUid.substring(0, 8);
        
        const userRef = doc(db, "users", currentUserUid);
        const docSnap = await getDoc(userRef);

        if (!docSnap.exists()) {
            // Jika akun baru terdaftar dan dokumen data kosong, arahkan ke layar Pemilihan Karakter
            showScreen('screen-char-select');
        } else {
            const data = docSnap.data();
            if (!data.characterClass) {
                // Jika dokumen ada tapi belum memilih class karakter
                showScreen('screen-char-select');
            } else {
                // Sesi valid, langsung arahkan ke Dashboard Game
                showScreen('screen-game');
                startLiveGameSync();
            }
        }
    } else {
        // Pemain tidak terautentikasi, bersihkan sisa listener lama dan tampilkan layar login
        currentUserUid = null;
        activeUnsubscribeListeners.forEach(unsub => unsub());
        activeUnsubscribeListeners = [];
        showScreen('screen-auth');
    }
});

// Fungsi untuk mengaktifkan seluruh pemantauan database real-time game
function startLiveGameSync() {
    listenToPlayerData();
    loadMailbox();
    listenToChat();
    listenToWorldBoss();
    listenToGuilds();
    listenToLeaderboard();
}

// ==========================================
// 2. INTERFAK KONTROL AUTH (UI EVENT LISTENERS)
// ==========================================
document.getElementById('link-toggle-auth').addEventListener('click', (e) => {
    e.preventDefault();
    isLoginMode = !isLoginMode;
    document.getElementById('auth-title').innerText = isLoginMode ? "Masuk Gerbang RPG" : "Daftar Akun Ksatria Baru";
    document.getElementById('btn-primary-auth').innerText = isLoginMode ? "MASUK" : "DAFTAR SEKARANG";
    document.getElementById('auth-toggle-text').innerText = isLoginMode ? "Belum punya akun?" : "Sudah punya akun?";
    document.getElementById('link-toggle-auth').innerText = isLoginMode ? "Daftar Sekarang" : "Masuk di Sini";
});

document.getElementById('btn-primary-auth').addEventListener('click', async () => {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;

    if (!email || !password) return alert("Harap isi semua kolom dokumen!");

    try {
        if (isLoginMode) {
            await loginWithEmail(email, password);
        } else {
            await registerWithEmail(email, password);
        }
    } catch (err) {
        alert(err);
    }
});

document.getElementById('btn-logout').addEventListener('click', () => {
    logoutUser();
});

// ==========================================
// 3. FITUR BARU: LOGIKA PEMILIHAN KARAKTER
// ==========================================
async function selectCharacterClass(className) {
    if (!currentUserUid) return;
    const userRef = doc(db, "users", currentUserUid);
    
    try {
        await setDoc(userRef, {
            username: "Knight_" + currentUserUid.substring(0, 4),
            characterClass: className,
            gold: 15000, // Bonus modal awal bermain
            level: 1,
            exp: 0,
            lastAttack: 0
        });
        
        alert("Karakter " + className + " Berhasil Dibuat!");
        showScreen('screen-game');
        startLiveGameSync();
    } catch (err) {
        alert("Gagal menyimpan karakter: " + err);
    }
}

document.getElementById('class-warrior').addEventListener('click', () => selectCharacterClass('Warrior'));
document.getElementById('class-mage').addEventListener('click', () => selectCharacterClass('Mage'));

// ==========================================
// 4. LIVE SYNC DATA PEMAIN (DIPERBARUI)
// ==========================================
function listenToPlayerData() {
    const unsub = onSnapshot(doc(db, "users", currentUserUid), (docSnap) => {
        if (!docSnap.exists()) return;
        const data = docSnap.data();
        
        const lvl = data.level || 1;
        const exp = data.exp || 0;
        const maxExp = lvl * 100;

        document.getElementById('player-name').innerText = data.username;
        document.getElementById('player-class').innerText = data.characterClass || "Belum Memilih";
        document.getElementById('player-gold').innerText = (data.gold || 0).toLocaleString();
        document.getElementById('player-level').innerText = lvl;
        document.getElementById('exp-text').innerText = `${exp} / ${maxExp} EXP`;
        document.getElementById('exp-bar').style.width = `${Math.min((exp / maxExp) * 100, 100)}%`;
    });
    activeUnsubscribeListeners.push(unsub);
}

// ==========================================
// 5. WORLD BOSS & SISTEM LEVEL UP
// ==========================================
function listenToWorldBoss() {
    const unsub = onSnapshot(doc(db, "server", "world_boss"), (docSnap) => {
        if (!docSnap.exists()) return;
        const data = docSnap.data();
        document.getElementById('boss-name').innerText = data.name;
        document.getElementById('hp-text').innerText = `${data.hp.toLocaleString()} / ${data.maxHp.toLocaleString()} HP`;
        const pct = (data.hp / data.maxHp) * 100;
        document.getElementById('hp-bar').style.width = `${Math.max(0, pct)}%`;
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
    const damage = Math.floor(Math.random() * 500) + 200;
    const expGained = Math.floor(Math.random() * 30) + 10;

    try {
        await runTransaction(db, async (transaction) => {
            const bossDoc = await transaction.get(bossRef);
            const userDoc = await transaction.get(userRef);
            if (!bossDoc.exists()) throw "Boss tidak ditemukan!";
            
            const lastAttack = userDoc.data().lastAttack || 0;
            const now = Date.now();
            if (now - lastAttack < 2000) throw "Spam terdeteksi!";

            let currentLevel = userDoc.data().level || 1;
            let currentExp = (userDoc.data().exp || 0) + expGained;
            let expNeeded = currentLevel * 100;

            if (currentExp >= expNeeded) {
                currentLevel += 1;
                currentExp -= expNeeded;
            }

            let newHp = bossDoc.data().hp - damage;
            transaction.update(bossRef, { hp: newHp < 0 ? 0 : newHp });
            transaction.update(userRef, { lastAttack: now, level: currentLevel, exp: currentExp });
        });
    } catch (err) { console.error(err); }
    setTimeout(() => { btnAttack.disabled = false; isAttackCooldown = false; }, 2000);
}
document.getElementById('btn-attack').addEventListener('click', attackWorldBoss);

// ==========================================
// 6. LEADERBOARD & LAIN-LAIN (TERINTEGRASI)
// ==========================================
function listenToLeaderboard() {
    const q = query(collection(db, "users"), orderBy("level", "desc"), limit(10));
    const unsub = onSnapshot(q, (snapshot) => {
        const lbList = document.getElementById('leaderboard-list');
        lbList.innerHTML = "";
        let rank = 1;
        snapshot.forEach((docSnap) => {
            const p = docSnap.data();
            const div = document.createElement('div');
            div.className = "leaderboard-item";
            div.innerHTML = `<span>#${rank} ${escapeHTML(p.username)} (${escapeHTML(p.characterClass)})</span> <span style="color:#00d2ff;">Lv.${p.level}</span>`;
            lbList.appendChild(div);
            rank++;
        });
    });
    activeUnsubscribeListeners.push(unsub);
}

function listenToChat() {
    const q = query(collection(db, "global_chat"), orderBy("timestamp", "asc"), limit(30));
    const unsub = onSnapshot(q, (snapshot) => {
        const chatBox = document.getElementById('chat-box');
        chatBox.innerHTML = "";
        snapshot.forEach((doc) => {
            const data = doc.data();
            if (!data.message) return;
            const msgDiv = document.createElement('div');
            msgDiv.className = "chat-msg";
            msgDiv.innerHTML = `<span class="chat-name">${escapeHTML(data.senderName)}</span>: <span>${escapeHTML(data.message)}</span>`;
            chatBox.appendChild(msgDiv);
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
            senderName: userDoc.data().username || "Ksatria",
            message: text,
            timestamp: serverTimestamp()
        });
        input.value = "";
    } catch (err) { console.error(err); }
}
document.getElementById('btn-send-chat').addEventListener('click', sendChatMessage);
document.getElementById('chat-input').addEventListener('keypress', (e) => { if(e.key === 'Enter') sendChatMessage(); });

function listenToGuilds() {
    const unsub = onSnapshot(collection(db, "guilds"), (snapshot) => {
        const list = document.getElementById('guild-list');
        list.innerHTML = "";
        if (snapshot.empty) { list.innerHTML = "Belum ada sekte."; return; }
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const div = document.createElement('div');
            div.style.borderBottom = "1px solid #3f3f52"; div.style.padding = "5px 0";
            div.innerHTML = `🏰 <strong>${escapeHTML(data.name)}</strong> — Anggota: ${data.members?.length || 1}`;
            list.appendChild(div);
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
document.getElementById('btn-create-guild').addEventListener('click', createGuild);

function loadMailbox() {
    const unsub = onSnapshot(collection(db, "mailbox", currentUserUid, "messages"), (snapshot) => {
        const list = document.getElementById('mailbox-list'); list.innerHTML = "";
        if (snapshot.empty) { list.innerHTML = "Tidak ada surat."; return; }
        snapshot.forEach((docSnap) => {
            const msg = docSnap.data();
            const div = document.createElement('div');
            div.style.borderBottom = "1px solid #3f3f52"; div.style.padding = "5px 0";
            div.innerHTML = `✉️ <strong>${escapeHTML(msg.title)}</strong><br>${escapeHTML(msg.body)}<br>`;
            list.appendChild(div);
        });
    });
    activeUnsubscribeListeners.push(unsub);
}
