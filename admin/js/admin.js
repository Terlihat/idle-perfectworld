import { db, auth } from '../../js/firebase-config.js'; // Pastikan path ini mengarah dengan benar ke konfigurasi Anda
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { collection, doc, getDoc, getDocs, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js"; // PERBAIKAN: setDoc diganti menjadi addDoc

let adminUid = null;

// ==========================================
// 1. VERIFIKASI AKSES ADMIN
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        adminUid = user.uid;
        try {
            const userRef = doc(db, "users", adminUid);
            const docSnap = await getDoc(userRef);
            
            if (docSnap.exists() && docSnap.data().role === 'admin') {
                document.getElementById('loading-screen').style.display = 'none';
                document.getElementById('admin-content').style.display = 'block';
                loadServerStats();
            } else {
                alert("Akses Ditolak! Anda bukan Admin.");
                window.location.href = '../index.html'; // Usir ke halaman game
            }
        } catch (err) {
            console.error(err);
            alert("Gagal memverifikasi status. Pastikan Rules Firebase mengizinkan.");
        }
    } else {
        window.location.href = '../index.html';
    }
});

// ==========================================
// 2. SISTEM STATISTIK SERVER
// ==========================================
async function loadServerStats() {
    try {
        const usersCol = collection(db, "users");
        const userSnapshot = await getDocs(usersCol);
        
        let totalPlayers = 0;
        let totalGold = 0;
        let totalCoin = 0;

        userSnapshot.forEach((doc) => {
            totalPlayers++;
            const data = doc.data();
            totalGold += (data.gold || 0) + (data.bankGold || 0); // Gabungkan gold di tas dan di bank
            totalCoin += (data.coin || 0);
        });

        document.getElementById('stat-total-players').innerText = totalPlayers.toLocaleString();
        document.getElementById('stat-total-gold').innerText = totalGold.toLocaleString();
        document.getElementById('stat-total-coin').innerText = totalCoin.toLocaleString();

    } catch (err) {
        console.error("Gagal memuat statistik:", err);
    }
}

// ==========================================
// 3. FITUR KIRIM SURAT & HADIAH (DIPERBAIKI)
// ==========================================
document.getElementById('btn-send-mail').addEventListener('click', async () => {
    const targetUid = document.getElementById('mail-target-uid').value.trim();
    const title = document.getElementById('mail-title').value.trim();
    const message = document.getElementById('mail-message').value.trim();
    const gold = parseInt(document.getElementById('mail-gold').value) || 0;
    const coin = parseInt(document.getElementById('mail-coin').value) || 0;
    const itemName = document.getElementById('mail-item-name').value;

    if (!targetUid || !title) {
        return alert("UID Penerima dan Judul Surat wajib diisi!");
    }

    const btnSend = document.getElementById('btn-send-mail');
    btnSend.disabled = true;
    btnSend.innerText = "Mengirim...";

    try {
        // PERBAIKAN: Rute diarahkan ke sub-koleksi mailbox milik user target
        const mailboxRef = collection(db, "users", targetUid, "mailbox"); 
        
        // Mempersiapkan struktur lampiran hadiah yang kompatibel dengan game.js
        let attachmentsData = null;
        if (itemName && itemName !== "") {
            attachmentsData = {
                itemName: itemName,
                qty: 1,
                gold: gold,
                coin: coin
            };
        } else if (gold > 0 || coin > 0) {
            attachmentsData = {
                gold: gold,
                coin: coin
            };
        }

        const mailData = {
            senderId: "SYSTEM",
            senderName: "Administrator",
            title: title,
            message: message,
            attachments: attachmentsData,
            isClaimed: false,
            timestamp: serverTimestamp()
        };

        // PERBAIKAN: Menggunakan addDoc agar Firebase membuatkan ID Surat Otomatis
        await addDoc(mailboxRef, mailData); 
        alert(`✅ Surat "${title}" berhasil dikirim ke UID: ${targetUid}`);
        
        // Reset form
        document.getElementById('mail-title').value = "";
        document.getElementById('mail-message').value = "";
        document.getElementById('mail-gold').value = "0";
        document.getElementById('mail-coin').value = "0";
        // Reset dropdown item secara manual jika diperlukan (opsional)
        
    } catch (err) {
        console.error(err);
        alert("Gagal mengirim surat: " + err.message);
    } finally {
        btnSend.disabled = false;
        btnSend.innerText = "Kirim Surat Sekarang";
    }
});

document.getElementById('btn-home')?.addEventListener('click', () => {
    window.location.href = '../index.html';
});