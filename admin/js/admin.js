import { db, auth } from '../../js/firebase-config.js'; 
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { collection, doc, getDoc, getDocs, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// PERBAIKAN: Import Database Item agar list selalu up-to-date otomatis!
import { ITEM_DB } from '../../js/data/items.js';

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
                populateItemDropdown(); // Jalankan fungsi pengisian item otomatis
            } else {
                alert("Akses Ditolak! Anda bukan Admin.");
                window.location.href = '../index.html'; 
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
            totalGold += (data.gold || 0) + (data.bankGold || 0); 
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
// 3. GENERATOR LIST ITEM OTOMATIS
// ==========================================
function populateItemDropdown() {
    const selectBox = document.getElementById('mail-item-name');
    if (!selectBox) return;

    selectBox.innerHTML = '<option value="">-- Tidak Kirim Item --</option>';
    
    // Melakukan looping ke seluruh data item di items.js
    Object.keys(ITEM_DB).forEach(itemName => {
        selectBox.innerHTML += `<option value="${itemName}">${itemName}</option>`;
    });
}

// ==========================================
// 4. FITUR KIRIM SURAT & HADIAH (KOMPLIT)
// ==========================================
document.getElementById('btn-send-mail').addEventListener('click', async () => {
    const targetUid = document.getElementById('mail-target-uid').value.trim();
    const title = document.getElementById('mail-title').value.trim();
    const message = document.getElementById('mail-message').value.trim();
    const gold = parseInt(document.getElementById('mail-gold').value) || 0;
    const coin = parseInt(document.getElementById('mail-coin').value) || 0;
    
    const itemName = document.getElementById('mail-item-name').value;
    const itemQty = parseInt(document.getElementById('mail-item-qty')?.value) || 1;

    if (!targetUid || !title) {
        return alert("UID Penerima dan Judul Surat wajib diisi!");
    }

    const btnSend = document.getElementById('btn-send-mail');
    btnSend.disabled = true;
    btnSend.innerText = "Mengirim...";

    try {
        // Rute ke sub-koleksi kotak surat user
        const mailboxRef = collection(db, "users", targetUid, "mailbox"); 
        
        // Membungkus hadiah ke dalam attachments
        let attachmentsData = null;
        if (itemName && itemName !== "") {
            attachmentsData = {
                itemName: itemName,
                qty: itemQty, // Menerapkan jumlah qty
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

        await addDoc(mailboxRef, mailData); 
        alert(`✅ Surat "${title}" beserta hadiah berhasil dikirim ke UID: ${targetUid}`);
        
        // Reset form setelah sukses
        document.getElementById('mail-title').value = "";
        document.getElementById('mail-message').value = "";
        document.getElementById('mail-gold').value = "0";
        document.getElementById('mail-coin').value = "0";
        document.getElementById('mail-item-name').value = "";
        if (document.getElementById('mail-item-qty')) document.getElementById('mail-item-qty').value = "1";
        
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