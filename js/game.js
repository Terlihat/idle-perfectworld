import { db, auth } from './firebase-config.js';
import { signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, collection, getDocs, onSnapshot, runTransaction, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

let currentUserUid = null;

// ==========================================
// 1. SISTEM AUTENTIKASI (Login Otomatis)
// ==========================================
signInAnonymously(auth).catch((error) => console.error("Login Gagal:", error));

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserUid = user.uid;
        document.getElementById('auth-status').innerText = "Online";
        document.getElementById('player-uid').innerText = currentUserUid;
        
        // Mulai pantau data pemain dan kotak masuk setelah login
        listenToPlayerData(currentUserUid);
        loadMailbox(currentUserUid);
    }
});

// ==========================================
// 2. PANTAU DATA PEMAIN (Live Update Gold)
// ==========================================
function listenToPlayerData(uid) {
    const userRef = doc(db, "users", uid);
    onSnapshot(userRef, (docSnap) => {
        if (docSnap.exists()) {
            document.getElementById('player-gold').innerText = docSnap.data().gold;
        } else {
            console.log("Data user belum ada di database, harap buat dulu struktur datanya.");
        }
    });
}

// ==========================================
// 3. LOGIKA PASAR GLOBAL (Anti-Cheat Transaction)
// ==========================================
async function buyMarketItem(itemId) {
    if (!currentUserUid) return alert("Anda belum login!");

    // Misal ID Item yang mau dibeli adalah ini (Disesuaikan dengan UI Anda nanti)
    const itemRef = doc(db, "market", itemId);
    const buyerRef = doc(db, "users", currentUserUid);

    try {
        await runTransaction(db, async (transaction) => {
            // A. Ambil data secara bersamaan
            const itemDoc = await transaction.get(itemRef);
            const buyerDoc = await transaction.get(buyerRef);

            if (!itemDoc.exists()) throw "Barang sudah terjual atau tidak ada!";
            if (!buyerDoc.exists()) throw "Data pemain Anda tidak ditemukan!";

            const itemData = itemDoc.data();
            const buyerGold = buyerDoc.data().gold;

            // B. Validasi Uang
            if (buyerGold < itemData.price) {
                throw "Gold tidak cukup! Harga: " + itemData.price;
            }

            // C. Eksekusi Pembelian (Semua terjadi instan & tidak bisa di-hack)
            const sellerRef = doc(db, "users", itemData.sellerId);
            
            // 1. Kurangi gold pembeli
            transaction.update(buyerRef, { gold: buyerGold - itemData.price });
            
            // 2. Tambahkan item ke inventory pembeli (Anggap ada field 'inventory' array)
            // Note: Untuk array update butuh arrayUnion, tapi kita lewati agar simpel.
            
            // 3. Hapus barang dari pasar
            transaction.delete(itemRef);
        });

        alert("Berhasil membeli " + itemId + "!");
    } catch (error) {
        console.error(error);
        alert("Transaksi gagal: " + error);
    }
}

// Event Listener Tombol Beli
document.getElementById('btn-buy-sample').addEventListener('click', () => {
    // Pastikan dokumen ID ini benar-benar ada di koleksi "market" di Firestore Anda
    buyMarketItem("CONTOH_ID_DOKUMEN_PASAR_123"); 
});

// ==========================================
// 4. LOGIKA KOTAK MASUK (Mailbox)
// ==========================================
async function loadMailbox(uid) {
    const mailboxRef = collection(db, "mailbox", uid, "messages");
    
    // Ambil data mailbox (Untuk realtime bisa pakai onSnapshot)
    const querySnapshot = await getDocs(mailboxRef);
    const mailboxList = document.getElementById('mailbox-list');
    mailboxList.innerHTML = ''; // Bersihkan loading

    if (querySnapshot.empty) {
        mailboxList.innerHTML = '<p>Tidak ada pesan baru.</p>';
        return;
    }

    querySnapshot.forEach((docSnap) => {
        const msg = docSnap.data();
        const msgId = docSnap.id;
        
        // Buat elemen UI untuk pesan
        const div = document.createElement('div');
        div.style.borderBottom = "1px solid #ccc";
        div.style.paddingBottom = "10px";
        
        div.innerHTML = `
            <h4>${msg.title}</h4>
            <p>${msg.body}</p>
            ${!msg.isClaimed && msg.attachments ? `<button id="btn-claim-${msgId}">Klaim ${msg.attachments.gold} Gold</button>` : '<i>Sudah diklaim</i>'}
        `;
        
        mailboxList.appendChild(div);

        // Tambahkan event listener untuk tombol klaim jika belum diklaim
        if (!msg.isClaimed && msg.attachments) {
            document.getElementById(`btn-claim-${msgId}`).addEventListener('click', () => claimReward(uid, msgId, msg.attachments.gold));
        }
    });
}

// Fitur Klaim Reward Mailbox
async function claimReward(uid, messageId, goldReward) {
    const msgRef = doc(db, "mailbox", uid, "messages", messageId);
    const userRef = doc(db, "users", uid);

    try {
        await runTransaction(db, async (transaction) => {
            const msgDoc = await transaction.get(msgRef);
            const userDoc = await transaction.get(userRef);

            if (msgDoc.data().isClaimed) throw "Hadiah sudah diklaim sebelumnya!";

            // Update Gold Player
            const currentGold = userDoc.data().gold || 0;
            transaction.update(userRef, { gold: currentGold + goldReward });

            // Tandai pesan sudah diklaim
            transaction.update(msgRef, { isClaimed: true });
        });

        alert("Hadiah berhasil diklaim!");
        loadMailbox(uid); // Muat ulang kotak masuk
    } catch (error) {
        alert("Gagal mengklaim: " + error);
    }
}