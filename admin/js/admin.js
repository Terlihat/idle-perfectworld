import { db, auth } from '../../js/firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { collection, doc, getDoc, getDocs, addDoc, serverTimestamp, updateDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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
                populateItemDropdown();
                listenToGlobalEvents();
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
// 4. FITUR KIRIM SURAT & HADIAH (KOMPLIT & BROADCAST)
// ==========================================
document.getElementById('btn-send-mail').addEventListener('click', async () => {
    const targetUid = document.getElementById('mail-target-uid').value.trim();
    const title = document.getElementById('mail-title').value.trim();
    const message = document.getElementById('mail-message').value.trim();
    const gold = parseInt(document.getElementById('mail-gold').value) || 0;
    const coin = parseInt(document.getElementById('mail-coin').value) || 0;

    const itemName = document.getElementById('mail-item-name').value;
    const itemQty = parseInt(document.getElementById('mail-item-qty')?.value) || 1;

    // PERBAIKAN: Target UID tidak lagi wajib. Hanya Judul yang wajib.
    if (!title) {
        return alert("Judul Surat wajib diisi!");
    }

    const btnSend = document.getElementById('btn-send-mail');
    btnSend.disabled = true;
    btnSend.innerText = "Menyiapkan Surat...";

    try {
        // Membungkus hadiah ke dalam attachments
        let attachmentsData = null;
        if (itemName && itemName !== "") {
            attachmentsData = {
                itemName: itemName,
                qty: itemQty,
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

        if (targetUid) {
            // JIKA UID DIISI: Kirim ke 1 Pemain saja (Logika Lama)
            const mailboxRef = collection(db, "users", targetUid, "mailbox");
            await addDoc(mailboxRef, mailData);
            alert(`✅ Surat "${title}" berhasil dikirim ke UID: ${targetUid}`);
        } else {
            // JIKA UID KOSONG: Lakukan Broadcast ke Seluruh Pemain
            const confirmBroadcast = confirm("⚠️ PERINGATAN BROADCAST: Anda mengosongkan kolom UID. Surat ini akan dikirim ke SELURUH PEMAIN yang terdaftar. Lanjutkan?");
            if (!confirmBroadcast) {
                btnSend.disabled = false;
                btnSend.innerText = "Kirim Surat Sekarang";
                return;
            }

            btnSend.innerText = "Mengambil data pemain...";

            // Ambil semua data pemain dari database
            const usersCol = collection(db, "users");
            const userSnapshot = await getDocs(usersCol);

            let sendPromises = [];

            // Masukkan perintah pengiriman ke masing-masing kotak surat pemain
            userSnapshot.forEach((userDoc) => {
                const mailboxRef = collection(db, "users", userDoc.id, "mailbox");
                sendPromises.push(addDoc(mailboxRef, mailData));
            });

            btnSend.innerText = `Mengirim ke ${sendPromises.length} pemain... (Mohon Tunggu)`;

            // Eksekusi semua pengiriman secara serentak (paralel) agar tidak lag
            await Promise.all(sendPromises);

            alert(`📢 BROADCAST SUKSES! Surat beserta hadiah berhasil dikirim ke ${sendPromises.length} pemain.`);
        }

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

// ==========================================
// 5. FITUR PLAYER EDITOR & BANNED
// ==========================================
let currentEditingUid = null;
let currentEditingBannedStatus = false;

document.getElementById('btn-search-player').addEventListener('click', async () => {
    const uid = document.getElementById('editor-search-uid').value.trim();
    if (!uid) return alert("Masukkan UID terlebih dahulu!");

    const btnSearch = document.getElementById('btn-search-player');
    btnSearch.innerText = "Mencari...";

    try {
        const userRef = doc(db, "users", uid);
        const docSnap = await getDoc(userRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            currentEditingUid = uid;
            currentEditingBannedStatus = data.banned || false;

            // Masukkan data ke UI
            document.getElementById('edit-player-name').innerText = data.username || "Hero Anonim";
            document.getElementById('edit-player-level').innerText = data.level || 1;
            document.getElementById('edit-player-class').innerText = data.characterClass || "Tidak diketahui";
            document.getElementById('edit-player-gold').value = data.gold || 0;
            document.getElementById('edit-player-coin').value = data.coin || 0;
            document.getElementById('edit-player-level-input').value = data.level || 1;
            document.getElementById('edit-player-exp').value = data.exp || 0;
            document.getElementById('edit-player-vip').value = data.vipLevel || 0;

            // Atur tombol Banned
            const btnBan = document.getElementById('btn-ban-player');
            if (currentEditingBannedStatus) {
                btnBan.innerText = "✅ Buka Ban (Un-Ban)";
                btnBan.style.background = "#28a745"; // Hijau
            } else {
                btnBan.innerText = "🚫 Banned Pemain";
                btnBan.style.background = "#dc3545"; // Merah
            }

            document.getElementById('editor-results').style.display = "block";
        } else {
            alert("❌ Pemain dengan UID tersebut tidak ditemukan!");
            document.getElementById('editor-results').style.display = "none";
        }
    } catch (err) {
        console.error(err);
        alert("Terjadi kesalahan saat mencari pemain.");
    } finally {
        btnSearch.innerText = "Cari Pemain";
    }
});

// Fungsi Menyimpan Perubahan Ekonomi (Gold/Coin)
document.getElementById('btn-save-player').addEventListener('click', async () => {
    if (!currentEditingUid) return;
    const newGold = parseInt(document.getElementById('edit-player-gold').value) || 0;
    const newCoin = parseInt(document.getElementById('edit-player-coin').value) || 0;
    const newLevel = parseInt(document.getElementById('edit-player-level-input').value) || 1;
    const newExp = parseInt(document.getElementById('edit-player-exp').value) || 0;
    const newVip = parseInt(document.getElementById('edit-player-vip').value) || 0;

    if (!confirm("Yakin ingin mengubah jumlah Gold/Coin pemain ini?")) return;

    try {
        await updateDoc(doc(db, "users", currentEditingUid), {
            gold: newGold,
            coin: newCoin,
            level: newLevel,
            exp: newExp,
            vipLevel: newVip
        });

        document.getElementById('edit-player-level').innerText = newLevel;
        alert("✅ Data ekonomi pemain berhasil diperbarui!");
    } catch (err) {
        console.error(err);
        alert("Gagal menyimpan data.");
    }
});

// Fungsi Banned / Un-Banned
document.getElementById('btn-ban-player').addEventListener('click', async () => {
    if (!currentEditingUid) return;
    const actionText = currentEditingBannedStatus ? "Membuka Ban (Un-Ban)" : "Membanned";

    if (!confirm(`⚠️ Yakin ingin ${actionText} pemain ini?`)) return;

    try {
        const newStatus = !currentEditingBannedStatus;
        await updateDoc(doc(db, "users", currentEditingUid), {
            banned: newStatus
        });

        currentEditingBannedStatus = newStatus;
        alert(`✅ Pemain berhasil di-${newStatus ? "Banned" : "Unban"}!`);

        // Refresh warna tombol
        const btnBan = document.getElementById('btn-ban-player');
        if (currentEditingBannedStatus) {
            btnBan.innerText = "✅ Buka Ban (Un-Ban)";
            btnBan.style.background = "#28a745";
        } else {
            btnBan.innerText = "🚫 Banned Pemain";
            btnBan.style.background = "#dc3545";
        }
    } catch (err) {
        console.error(err);
        alert("Gagal mengubah status ban.");
    }
});

// ==========================================
// 6. FITUR KONTROL WORLD BOSS
// ==========================================
document.getElementById('btn-admin-spawn-wb').addEventListener('click', async () => {
    const bossName = document.getElementById('wb-admin-name').value.trim() || "World Boss Misterius";
    const bossHp = parseInt(document.getElementById('wb-admin-hp').value) || 5000000;

    if (!confirm(`Yakin ingin memunculkan "${bossName}" dengan total darah ${bossHp.toLocaleString()} HP ke seluruh server?`)) return;

    try {
        const btnSpawn = document.getElementById('btn-admin-spawn-wb');
        btnSpawn.innerText = "Memunculkan...";
        btnSpawn.disabled = true;

        // Menggunakan setDoc untuk me-reset data boss secara utuh
        await setDoc(doc(db, "events", "worldBoss"), {
            name: bossName,
            maxHp: bossHp,
            currentHp: bossHp,
            isActive: true,
            participants: {} // Kosongkan daftar penyerang sebelumnya
        });

        alert(`✅ World Boss "${bossName}" berhasil dimunculkan! Pemain sekarang bisa melihat dan menyerangnya.`);
        btnSpawn.innerText = "⚔️ Munculkan Boss";
        btnSpawn.disabled = false;
    } catch (err) {
        console.error(err);
        alert("Gagal memunculkan boss: " + err.message);
        document.getElementById('btn-admin-spawn-wb').disabled = false;
    }
});

document.getElementById('btn-admin-kill-wb').addEventListener('click', async () => {
    if (!confirm("Yakin ingin mematikan event World Boss secara paksa? (HP Boss akan menjadi 0)")) return;

    try {
        const btnKill = document.getElementById('btn-admin-kill-wb');
        btnKill.innerText = "Mematikan...";
        btnKill.disabled = true;

        // Menggunakan updateDoc agar hanya mengubah statusnya saja
        await updateDoc(doc(db, "events", "worldBoss"), {
            isActive: false,
            currentHp: 0
        });

        alert("✅ World Boss berhasil dihentikan (Mati).");
        btnKill.innerText = "💀 Bunuh / Hentikan Boss";
        btnKill.disabled = false;
    } catch (err) {
        console.error(err);
        alert("Gagal mematikan boss: " + err.message);
        document.getElementById('btn-admin-kill-wb').disabled = false;
    }
});

// FITUR: MANAJER EVENT GLOBAL (SERVER BUFFS)
let isDoubleExpActive = false;
let isDoubleDropActive = false;

function listenToGlobalEvents() {
    const eventsRef = doc(db, "events", "serverBuffs");

    // Dengarkan perubahan secara realtime (jika admin lain mengubahnya, UI Anda ikut berubah)
    onSnapshot(eventsRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            isDoubleExpActive = !!data.doubleExp;
            isDoubleDropActive = !!data.doubleDrop;

            // Render UI Event Double EXP
            const expStatus = document.getElementById('status-exp-event');
            const btnExp = document.getElementById('btn-toggle-exp');
            if (isDoubleExpActive) {
                expStatus.innerText = "[ ON ]"; expStatus.style.color = "#28a745";
                btnExp.innerText = "Matikan Event"; btnExp.style.background = "#dc3545";
            } else {
                expStatus.innerText = "[ OFF ]"; expStatus.style.color = "#dc3545";
                btnExp.innerText = "🚀 Aktifkan Event"; btnExp.style.background = "#28a745";
            }

            // Render UI Event Double Drop
            const dropStatus = document.getElementById('status-drop-event');
            const btnDrop = document.getElementById('btn-toggle-drop');
            if (isDoubleDropActive) {
                dropStatus.innerText = "[ ON ]"; dropStatus.style.color = "#28a745";
                btnDrop.innerText = "Matikan Event"; btnDrop.style.background = "#dc3545";
            } else {
                dropStatus.innerText = "[ OFF ]"; dropStatus.style.color = "#dc3545";
                btnDrop.innerText = "🚀 Aktifkan Event"; btnDrop.style.background = "#28a745";
            }
        } else {
            // Jika dokumen belum ada di database, buat dokumen default (OFF semua)
            setDoc(eventsRef, { doubleExp: false, doubleDrop: false });
        }
    });
}

// Tombol Pemicu Event Double EXP
document.getElementById('btn-toggle-exp').addEventListener('click', async () => {
    try {
        await updateDoc(doc(db, "events", "serverBuffs"), { doubleExp: !isDoubleExpActive });
    } catch (err) { alert("Gagal mengubah status event: " + err.message); }
});

// Tombol Pemicu Event Double Drop
document.getElementById('btn-toggle-drop').addEventListener('click', async () => {
    try {
        await updateDoc(doc(db, "events", "serverBuffs"), { doubleDrop: !isDoubleDropActive });
    } catch (err) { alert("Gagal mengubah status event: " + err.message); }
});