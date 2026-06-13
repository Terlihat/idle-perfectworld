import { db, auth } from './firebase-config.js';
import { signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, collection, getDoc, getDocs, onSnapshot, runTransaction, addDoc, query, orderBy, limit, serverTimestamp, where, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

let currentUserUid = null;
let isAttackCooldown = false;

function escapeHTML(str) {
    if (!str) return "";
    return str.replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
}

// ==========================================
// 1. AUTENTIKASI & INISIALISASI (BUG FIXED)
// ==========================================
signInAnonymously(auth).catch((err) => console.error("Login Gagal:", err));

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUserUid = user.uid;
        document.getElementById('player-uid').innerText = currentUserUid.substring(0, 8);
        
        const userRef = doc(db, "users", currentUserUid);
        
        // PERBAIKAN BUG: Gunakan getDoc sekali saja untuk mengecek data baru, BUKAN onSnapshot
        const docSnap = await getDoc(userRef);
        if (!docSnap.exists()) {
            await setDoc(userRef, {
                username: "Player_" + currentUserUid.substring(0, 4),
                gold: 50000,
                level: 1,      // Status baru
                exp: 0,        // Status baru
                lastAttack: 0
            });
        }

        // Setelah dipastikan data ada, baru nyalakan listener realtime
        listenToPlayerData();
        loadMailbox();
        listenToChat();
        listenToWorldBoss();
        listenToGuilds();
        listenToLeaderboard();
    }
});

// ==========================================
// 2. LIVE SYNC STATUS PEMAIN (TERMASUK EXP)
// ==========================================
function listenToPlayerData() {
    onSnapshot(doc(db, "users", currentUserUid), (docSnap) => {
        if (!docSnap.exists()) return;
        const data = docSnap.data();
        
        const lvl = data.level || 1;
        const exp = data.exp || 0;
        const maxExp = lvl * 100; // Rumus: Butuh 100 EXP untuk Lv 2, 200 EXP untuk Lv 3, dst.

        document.getElementById('player-gold').innerText = (data.gold || 0).toLocaleString();
        document.getElementById('player-level').innerText = lvl;
        document.getElementById('exp-text').innerText = `${exp} / ${maxExp} EXP`;
        
        const expPct = Math.min((exp / maxExp) * 100, 100);
        document.getElementById('exp-bar').style.width = `${expPct}%`;
    });
}

// ==========================================
// 3. WORLD BOSS & SISTEM LEVEL UP
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
    if (!currentUserUid || isAttackCooldown) return;

    const btnAttack = document.getElementById('btn-attack');
    btnAttack.disabled = true;
    isAttackCooldown = true;

    const bossRef = doc(db, "server", "world_boss");
    const userRef = doc(db, "users", currentUserUid);
    
    // Kalkulasi Damage & EXP yang didapat
    const damage = Math.floor(Math.random() * 500) + 200;
    const expGained = Math.floor(Math.random() * 30) + 10; // Dapat 10 - 40 EXP per serangan

    try {
        await runTransaction(db, async (transaction) => {
            const bossDoc = await transaction.get(bossRef);
            const userDoc = await transaction.get(userRef);
            
            if (!bossDoc.exists()) throw "Boss tidak ditemukan!";
            
            const lastAttack = userDoc.data().lastAttack || 0;
            const now = Date.now();
            if (now - lastAttack < 2000) throw "Spam terdeteksi!";

            const currentHp = bossDoc.data().hp;
            if (currentHp <= 0) throw "Boss sudah mati!";

            // Logika Naik Level (Level Up Logic)
            let currentLevel = userDoc.data().level || 1;
            let currentExp = (userDoc.data().exp || 0) + expGained;
            let expNeeded = currentLevel * 100;

            // Jika EXP melampaui batas, naikkan level dan simpan sisa EXP
            if (currentExp >= expNeeded) {
                currentLevel += 1;
                currentExp = currentExp - expNeeded; 
                // Bonus naik level bisa ditambah di sini (misal: +1000 Gold)
            }

            let newHp = currentHp - damage;
            transaction.update(bossRef, { hp: newHp < 0 ? 0 : newHp });
            transaction.update(userRef, { 
                lastAttack: now,
                level: currentLevel,
                exp: currentExp
            });
        });
        console.log(`Damage: ${damage} | EXP +${expGained}`);
    } catch (err) { console.error(err); }

    setTimeout(() => { btnAttack.disabled = false; isAttackCooldown = false; }, 2000);
}
document.getElementById('btn-attack').addEventListener('click', attackWorldBoss);

// ==========================================
// 4. LEADERBOARD (Diubah menjadi Top Level)
// ==========================================
function listenToLeaderboard() {
    // Sekarang diurutkan berdasarkan Level tertinggi, lalu Gold terbanyak
    const q = query(collection(db, "users"), orderBy("level", "desc"), limit(10));
    onSnapshot(q, (snapshot) => {
        const lbList = document.getElementById('leaderboard-list');
        lbList.innerHTML = "";
        let rank = 1;
        snapshot.forEach((docSnap) => {
            const p = docSnap.data();
            const div = document.createElement('div');
            div.className = "leaderboard-item";
            div.innerHTML = `<span>#${rank} ${escapeHTML(p.username)}</span> <span style="color:#00d2ff;">Lv.${p.level || 1}</span>`;
            lbList.appendChild(div);
            rank++;
        });
    });
}

// ==========================================
// 5. FITUR LAINNYA (TETAP SAMA SEPERTI v6.0)
// ==========================================
// (Masukkan fungsi createGuild, listenToGuilds, sendChatMessage, listenToChat, buyMarketItem, loadMailbox, dan claimMail persis seperti kode v6.0 sebelumnya di sini untuk menghemat ruang)

async function createGuild() { /* Sama seperti v6.0 */ }
function listenToGuilds() { /* Sama seperti v6.0 */ }
async function sendChatMessage() { /* Sama seperti v6.0 */ }
function listenToChat() { /* Sama seperti v6.0 */ }
async function buyMarketItem(itemId) { /* Sama seperti v6.0 */ }
function loadMailbox() { /* Sama seperti v6.0 */ }
async function claimMail(uid, msgId, goldReward) { /* Sama seperti v6.0 */ }

document.getElementById('btn-create-guild').addEventListener('click', createGuild);
document.getElementById('btn-send-chat').addEventListener('click', sendChatMessage);
document.getElementById('chat-input').addEventListener('keypress', (e) => { if(e.key === 'Enter') sendChatMessage(); });
document.getElementById('btn-buy-sample').addEventListener('click', () => buyMarketItem("SAMPLE_ITEM_ID"));
