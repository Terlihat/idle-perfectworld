import { db, auth } from './firebase-config.js';
import { signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, collection, getDocs, onSnapshot, runTransaction, addDoc, query, orderBy, limit, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

let currentUserUid = null;

// Helper anti-XSS untuk membersihkan input chat dari script berbahaya
function escapeHTML(str) {
    return str.replace(/[&<>"']/g, (match) => {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[match];
    });
}

// ==========================================
// 1. AUTENTIKASI
// ==========================================
signInAnonymously(auth).catch((err) => console.error("Login Gagal:", err));

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserUid = user.uid;
        document.getElementById('player-uid').innerText = currentUserUid.substring(0, 6) + "...";
        
        listenToPlayerData(currentUserUid);
        loadMailbox(currentUserUid);
        listenToChat();
        listenToWorldBoss();
    }
});

// ==========================================
// 2. LIVE SYNC DATA PEMAIN
// ==========================================
function listenToPlayerData(uid) {
    onSnapshot(doc(db, "users", uid), (docSnap) => {
        if (docSnap.exists()) {
            document.getElementById('player-gold').innerText = docSnap.data().gold.toLocaleString();
        }
    });
}

// ==========================================
// 3. FITUR BARU: LIVE CHAT GLOBAL (Anti-XSS Fix)
// ==========================================
async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text || !currentUserUid) return;

    try {
        await addDoc(collection(db, "global_chat"), {
            senderId: currentUserUid,
            senderName: "Player_" + currentUserUid.substring(0, 4),
            message: text,
            timestamp: serverTimestamp()
        });
        input.value = ""; // Bersihkan kolom input
    } catch (err) {
        console.error("Gagal mengirim chat:", err);
    }
}

function listenToChat() {
    const q = query(collection(db, "global_chat"), orderBy("timestamp", "asc"), limit(30));
    onSnapshot(q, (snapshot) => {
        const chatBox = document.getElementById('chat-box');
        chatBox.innerHTML = "";
        snapshot.forEach((doc) => {
            const data = doc.data();
            if (!data.message) return;
            
            // Perbaikan Bug: Menggunakan kombinasi teks aman agar kebal XSS
            const msgDiv = document.createElement('div');
            msgDiv.className = "chat-msg";
            msgDiv.innerHTML = `<span class="chat-name">${escapeHTML(data.senderName)}</span>: <span>${escapeHTML(data.message)}</span>`;
            chatBox.appendChild(msgDiv);
        });
        chatBox.scrollTop = chatBox.scrollHeight; // Auto-scroll ke bawah
    });
}

document.getElementById('btn-send-chat').addEventListener('click', sendChatMessage);
document.getElementById('chat-input').addEventListener('keypress', (e) => { if(e.key === 'Enter') sendChatMessage(); });

// ==========================================
// 4. FITUR BARU: WORLD BOSS REAL-TIME (Safe Transaction)
// ==========================================
function listenToWorldBoss() {
    onSnapshot(doc(db, "server", "world_boss"), (docSnap) => {
        if (!docSnap.exists()) return;
        const data = docSnap.data();
        document.getElementById('boss-name').innerText = data.name;
        document.getElementById('hp-text').innerText = `${data.hp.toLocaleString()} / ${data.maxHp.toLocaleString()} HP`;
        
        const pct = (data.hp / data.maxHp) * 100;
        document.getElementById('hp-bar').style.width = `${Math.max(0, pct)}%`;
        
        document.getElementById('btn-attack').disabled = data.hp <= 0;
    });
}

async function attackWorldBoss() {
    if (!currentUserUid) return;
    const bossRef = doc(db, "server", "world_boss");
    const damage = Math.floor(Math.random() * 500) + 200; // Contoh kalkulasi damage acak (200 - 700)

    try {
        await runTransaction(db, async (transaction) => {
            const bossDoc = await transaction.get(bossRef);
            if (!bossDoc.exists()) throw "Boss menghilang!";
            
            const currentHp = bossDoc.data().hp;
            if (currentHp <= 0) throw "Boss sudah mati!";

            // Kurangi HP, pastikan tidak minus
            let newHp = currentHp - damage;
            if (newHp < 0) newHp = 0;

            transaction.update(bossRef, { hp: newHp });
        });
        console.log(`Berhasil memberikan ${damage} damage ke World Boss!`);
    } catch (err) {
        alert("Gagal menyerang: " + err);
    }
}

document.getElementById('btn-attack').addEventListener('click', attackWorldBoss);

// ==========================================
// 5. PASAR GLOBAL
// ==========================================
async function buyMarketItem(itemId) {
    if (!currentUserUid) return;
    const itemRef = doc(db, "market", itemId);
    const buyerRef = doc(db, "users", currentUserUid);

    try {
        await runTransaction(db, async (ts) => {
            const itemDoc = await ts.get(itemRef);
            const buyerDoc = await ts.get(buyerRef);

            if (!itemDoc.exists()) throw "Barang laku!";
            const price = itemDoc.data().price;
            const gold = buyerDoc.data().gold || 0;

            if (gold < price) throw "Gold kurang!";

            ts.update(buyerRef, { gold: gold - price });
            ts.delete(itemRef);
        });
        alert("Pembelian Berhasil!");
    } catch (err) {
        alert("Transaksi Gagal: " + err);
    }
}
document.getElementById('btn-buy-sample').addEventListener('click', () => buyMarketItem("SAMPLE_ITEM_ID"));

// ==========================================
// 6. MAILBOX (KLAIM HADIAH)
// ==========================================
async function loadMailbox(uid) {
    onSnapshot(collection(db, "mailbox", uid, "messages"), (snapshot) => {
        const list = document.getElementById('mailbox-list');
        list.innerHTML = "";
        if (snapshot.empty) { list.innerHTML = "Tidak ada surat."; return; }

        snapshot.forEach((docSnap) => {
            const msg = docSnap.data();
            const msgId = docSnap.id;
            const div = document.createElement('div');
            div.style.borderBottom = "1px solid #444";
            div.style.padding = "5px 0";
            div.innerHTML = `<strong>${escapeHTML(msg.title)}</strong><br>${escapeHTML(msg.body)}<br>`;
            
            if (!msg.isClaimed && msg.attachments?.gold) {
                const btn = document.createElement('button');
                btn.innerText = `Klaim ${msg.attachments.gold} Gold`;
                btn.style.padding = "3px 8px";
                btn.onclick = () => claimMail(uid, msgId, msg.attachments.gold);
                div.appendChild(btn);
            } else {
                div.innerHTML += "<i>Sudah diklaim / tidak ada hadiah</i>";
            }
            list.appendChild(div);
        });
    });
}

async function claimMail(uid, msgId, goldReward) {
    const msgRef = doc(db, "mailbox", uid, "messages", msgId);
    const userRef = doc(db, "users", uid);
    try {
        await runTransaction(db, async (ts) => {
            const msg = await ts.get(msgRef);
            const usr = await ts.get(userRef);
            if (msg.data().isClaimed) throw "Sudah diambil!";
            
            ts.update(userRef, { gold: (usr.data().gold || 0) + goldReward });
            ts.update(msgRef, { isClaimed: true });
        });
        alert("Hadiah diklaim!");
    } catch (err) { alert(err); }
}
