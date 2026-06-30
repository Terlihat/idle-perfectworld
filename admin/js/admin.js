import { db, auth } from '../../js/firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { collection, doc, getDoc, getDocs, addDoc, serverTimestamp, updateDoc, setDoc, onSnapshot, deleteDoc, query, orderBy, limit, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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
    const injectBox = document.getElementById('inject-item-name');
    const giftBox = document.getElementById('gift-code-item-name');

    if (selectBox) selectBox.innerHTML = '<option value="">-- Tidak Kirim Item --</option>';
    if (injectBox) injectBox.innerHTML = '<option value="">-- Pilih Item untuk Disuntikkan --</option>';
    if (giftBox) giftBox.innerHTML = '<option value="">-- Tidak Ada Item --</option>';

    Object.keys(ITEM_DB).forEach(itemName => {
        if (selectBox) selectBox.innerHTML += `<option value="${itemName}">${itemName}</option>`;
        if (injectBox) injectBox.innerHTML += `<option value="${itemName}">${itemName}</option>`;
        if (giftBox) giftBox.innerHTML += `<option value="${itemName}">${itemName}</option>`;
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

            window.logAdminAction("MAIL", `Mengirim surat "${title}" ke UID: ${targetUid}. Lampiran: ${gold}G, ${coin}C, Item: ${itemName}`);
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

            window.logAdminAction("MAIL", `Mengirim surat "${title}" secara BROADCAST ke ${sendPromises.length} pemain. Lampiran: ${gold}G, ${coin}C, Item: ${itemName}`);
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

            renderPlayerInventory(uid, data.inventory || {});

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

        window.logAdminAction("ECONOMY", `Mengubah data UID: ${currentEditingUid} menjadi Level ${newLevel}, Gold: ${newGold}, Coin: ${newCoin}`);
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

        window.logAdminAction("BANNED", `Telah melakukan ${newStatus ? 'Banned' : 'Unban'} pada UID: ${currentEditingUid}`);
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

// Fitur Keamanan: Freeze / Bekukan Akun
let currentEditingFrozenStatus = false;

document.getElementById('btn-freeze-player')?.addEventListener('click', async () => {
    if (!currentEditingUid) return;
    const actionText = currentEditingFrozenStatus ? "Mencairkan (Un-Freeze)" : "Membekukan";

    if (!confirm(`❄️ Yakin ingin ${actionText} akun ini? Pemain tidak akan bisa memindahkan item atau gold saat dibekukan.`)) return;

    try {
        const newStatus = !currentEditingFrozenStatus;
        await updateDoc(doc(db, "users", currentEditingUid), {
            isFrozen: newStatus
        });

        currentEditingFrozenStatus = newStatus;
        window.logAdminAction("SYSTEM", `Telah melakukan ${newStatus ? 'FREEZE' : 'UN-FREEZE'} pada UID: ${currentEditingUid}`);

        alert(`✅ Akun berhasil di-${newStatus ? "Bekukan" : "Cairkan"}!`);

        // Refresh visual tombol
        const btnFreeze = document.getElementById('btn-freeze-player');
        if (currentEditingFrozenStatus) {
            btnFreeze.innerText = "🔥 Cairkan Akun (Un-Freeze)";
            btnFreeze.style.background = "#d35400";
        } else {
            btnFreeze.innerText = "❄️ Bekukan (Freeze)";
            btnFreeze.style.background = "#6f42c1";
        }
    } catch (err) {
        alert("Gagal mengubah status pembekuan: " + err.message);
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

// ==========================================
// 7. MANAJEMEN INVENTORY PEMAIN
// ==========================================

// Fungsi Render Isi Tas ke Layar
function renderPlayerInventory(uid, inventoryObj) {
    const listDiv = document.getElementById('player-inventory-list');
    if (!listDiv) return;

    listDiv.innerHTML = "";
    const items = Object.keys(inventoryObj);

    if (items.length === 0) {
        listDiv.innerHTML = `<div style="text-align: center; color: #aaa; padding: 10px; font-size: 13px;">Tas pemain ini kosong.</div>`;
        return;
    }

    items.forEach(itemName => {
        const qty = inventoryObj[itemName];
        const row = document.createElement('div');
        row.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 8px; border-bottom: 1px solid #333; transition: 0.2s;";

        row.innerHTML = `
            <div style="color: #fff; font-size: 13px;">${itemName} <span style="color: #ffca28; font-weight: bold;">(x${qty})</span></div>
            <button class="btn-delete-item" data-item="${itemName}" style="background: #dc3545; color: white; padding: 5px 12px; font-size: 11px; font-weight: bold; border: none; border-radius: 4px; cursor: pointer;">🗑️ Hapus</button>
        `;
        listDiv.appendChild(row);
    });

    // Pasang Event Listener untuk tombol Hapus
    document.querySelectorAll('.btn-delete-item').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const itemToRemove = e.target.getAttribute('data-item');
            if (!confirm(`⚠️ PERINGATAN: Hapus SELURUH [${itemToRemove}] dari tas pemain ini secara paksa?`)) return;

            try {
                e.target.innerText = "Menghapus...";
                e.target.disabled = true;

                const userRef = doc(db, "users", uid);
                const docSnap = await getDoc(userRef);

                if (docSnap.exists()) {
                    let currentInv = docSnap.data().inventory || {};
                    delete currentInv[itemToRemove]; // Hapus objek dari database

                    await updateDoc(userRef, { inventory: currentInv });
                    renderPlayerInventory(uid, currentInv); // Refresh daftar
                }
            } catch (err) {
                alert("Gagal menghapus item: " + err.message);
                e.target.innerText = "🗑️ Hapus";
                e.target.disabled = false;
            }
        });
    });
}

// Fungsi Eksekusi Suntik Item
document.getElementById('btn-inject-item')?.addEventListener('click', async () => {
    if (!currentEditingUid) return alert("Cari pemain terlebih dahulu!");

    const itemName = document.getElementById('inject-item-name').value;
    const itemQty = parseInt(document.getElementById('inject-item-qty').value) || 1;

    if (!itemName) return alert("Pilih item yang ingin disuntikkan dari daftar!");

    const btnInject = document.getElementById('btn-inject-item');
    btnInject.innerText = "⏳ Menyuntik...";
    btnInject.disabled = true;

    try {
        const userRef = doc(db, "users", currentEditingUid);
        const docSnap = await getDoc(userRef);

        if (docSnap.exists()) {
            let currentInv = docSnap.data().inventory || {};
            currentInv[itemName] = (currentInv[itemName] || 0) + itemQty;

            await updateDoc(userRef, { inventory: currentInv });

            window.logAdminAction("INJECT", `Menyuntikkan item ${itemQty}x [${itemName}] ke tas UID: ${currentEditingUid}`);
            alert(`✅ SUKSES! ${itemQty}x [${itemName}] berhasil disuntikkan langsung ke tas pemain.`);
            renderPlayerInventory(currentEditingUid, currentInv); // Refresh daftar
        }
    } catch (err) {
        alert("Gagal menyuntikkan item: " + err.message);
    } finally {
        btnInject.innerText = "➕ Suntik Item";
        btnInject.disabled = false;
    }
});

// ==========================================
// 8. MANAJEMEN KODE REDEEM (GIFT CODES)
// ==========================================

// Fungsi untuk memuat dan menampilkan kode redeem secara realtime
function listenToGiftCodes() {
    const listDiv = document.getElementById('active-giftcodes-list');
    if (!listDiv) return;

    onSnapshot(collection(db, "giftCodes"), (snapshot) => {
        listDiv.innerHTML = "";

        if (snapshot.empty) {
            listDiv.innerHTML = `<div style="text-align: center; color: #aaa; padding: 10px; font-size: 13px;">Belum ada kode redeem yang aktif.</div>`;
            return;
        }

        snapshot.forEach((docSnap) => {
            const code = docSnap.id;
            const data = docSnap.data();
            const claimedCount = data.claimedBy ? data.claimedBy.length : 0;

            let rewardText = [];
            if (data.gold > 0) rewardText.push(`💰 ${data.gold.toLocaleString()}`);
            if (data.coin > 0) rewardText.push(`🪙 ${data.coin.toLocaleString()}`);
            if (data.itemName) rewardText.push(`📦 ${data.itemName} (x${data.itemQty})`);

            const row = document.createElement('div');
            row.style.cssText = "display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid #333; background: #1a1a24; margin-bottom: 5px; border-radius: 4px;";

            row.innerHTML = `
                <div>
                    <div style="color: #00d2ff; font-weight: bold; font-size: 16px; letter-spacing: 1px;">${code}</div>
                    <div style="color: #aaa; font-size: 11px; margin-top: 3px;">Hadiah: <span style="color: #fff;">${rewardText.join(' | ')}</span></div>
                    <div style="color: #ffca28; font-size: 11px; margin-top: 2px;">Terklaim: ${claimedCount} / ${data.limit}</div>
                </div>
                <button class="btn-delete-code" data-code="${code}" style="background: #dc3545; color: white; padding: 6px 12px; font-size: 11px; font-weight: bold; border: none; border-radius: 4px; cursor: pointer;">Hapus Kode</button>
            `;
            listDiv.appendChild(row);
        });

        // Pasang fungsi hapus kode
        document.querySelectorAll('.btn-delete-code').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const codeToDelete = e.target.getAttribute('data-code');
                if (!confirm(`Yakin ingin MENGHAPUS kode [${codeToDelete}]?\nPemain tidak akan bisa mengklaimnya lagi.`)) return;

                try {
                    await deleteDoc(doc(db, "giftCodes", codeToDelete));
                } catch (err) {
                    alert("Gagal menghapus kode: " + err.message);
                }
            });
        });
    });
}

// Panggil fungsi pemantau saat admin berhasil login
// (Kita selipkan pemanggilannya di sini agar berjalan otomatis)
setTimeout(listenToGiftCodes, 1500);

// Fungsi membuat kode redeem baru
document.getElementById('btn-create-giftcode')?.addEventListener('click', async () => {
    let codeName = document.getElementById('gift-code-name').value.trim().toUpperCase();
    codeName = codeName.replace(/\s+/g, ''); // Paksa hapus spasi

    const limit = parseInt(document.getElementById('gift-code-limit').value) || 100;
    const gold = parseInt(document.getElementById('gift-code-gold').value) || 0;
    const coin = parseInt(document.getElementById('gift-code-coin').value) || 0;
    const itemName = document.getElementById('gift-code-item-name').value;
    const itemQty = parseInt(document.getElementById('gift-code-item-qty').value) || 1;

    if (!codeName) return alert("Kode redeem tidak boleh kosong!");
    if (codeName.length < 4) return alert("Kode redeem minimal 4 huruf/angka!");
    if (gold === 0 && coin === 0 && !itemName) return alert("Kode redeem harus memiliki setidaknya 1 hadiah!");

    const btnCreate = document.getElementById('btn-create-giftcode');
    btnCreate.innerText = "⏳ Menyimpan...";
    btnCreate.disabled = true;

    try {
        const codeRef = doc(db, "giftCodes", codeName);
        const codeSnap = await getDoc(codeRef);

        if (codeSnap.exists()) {
            alert(`❌ Kode [${codeName}] sudah ada dan masih aktif! Silakan hapus kode lama atau gunakan nama lain.`);
        } else {
            // Simpan kode ke database
            await setDoc(codeRef, {
                limit: limit,
                gold: gold,
                coin: coin,
                itemName: itemName || null,
                itemQty: itemName ? itemQty : 0,
                claimedBy: [], // Array kosong untuk menyimpan UID pemain yang sudah klaim
                createdAt: serverTimestamp()
            });

            window.logAdminAction("SYSTEM", `Membuat Kode Redeem [${codeName}] dengan kuota ${limit}. Hadiah: ${gold} Gold, ${coin} Coin, ${itemName || 'Tanpa Item'}`);
            alert(`✅ SUKSES! Kode Redeem [${codeName}] berhasil dibuat.`);

            // Kosongkan form
            document.getElementById('gift-code-name').value = "";
            document.getElementById('gift-code-gold').value = "0";
            document.getElementById('gift-code-coin').value = "0";
            document.getElementById('gift-code-item-name').value = "";
        }
    } catch (err) {
        alert("Gagal membuat kode: " + err.message);
    } finally {
        btnCreate.innerText = "✨ Buat Kode Redeem";
        btnCreate.disabled = false;
    }
});

// ==========================================
// 9. SISTEM AUDIT LOG & KEAMANAN
// ==========================================

// Fungsi untuk mencatat aktivitas ke database
window.logAdminAction = async function (actionType, details) {
    try {
        await addDoc(collection(db, "adminLogs"), {
            adminUid: adminUid || "UNKNOWN",
            actionType: actionType,
            details: details,
            timestamp: serverTimestamp()
        });
    } catch (err) {
        console.error("Gagal mencatat log admin:", err);
    }
};

// Fungsi untuk membaca dan menampilkan log secara realtime
function listenToAdminLogs() {
    const listDiv = document.getElementById('admin-log-list');
    if (!listDiv) return;

    // Ambil 50 log terbaru, diurutkan dari yang paling baru
    const q = query(collection(db, "adminLogs"), orderBy("timestamp", "desc"), limit(50));

    onSnapshot(q, (snapshot) => {
        listDiv.innerHTML = "";

        if (snapshot.empty) {
            listDiv.innerHTML = `<div style="text-align: center; color: #aaa; padding: 10px; font-size: 13px;">Belum ada catatan aktivitas admin.</div>`;
            return;
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const time = data.timestamp ? data.timestamp.toDate().toLocaleString('id-ID') : 'Baru saja...';

            // Pewarnaan Badge Kategori
            let typeColor = "#fff";
            let typeBg = "#333";

            if (data.actionType === "BANNED") { typeColor = "#fff"; typeBg = "#dc3545"; }
            else if (data.actionType === "INJECT") { typeColor = "#fff"; typeBg = "#28a745"; }
            else if (data.actionType === "ECONOMY") { typeColor = "#000"; typeBg = "#ffca28"; }
            else if (data.actionType === "SYSTEM") { typeColor = "#000"; typeBg = "#00d2ff"; }
            else if (data.actionType === "MAIL") { typeColor = "#fff"; typeBg = "#6f42c1"; }

            const row = document.createElement('div');
            row.style.cssText = "padding: 10px; border-bottom: 1px solid #333; background: #1a1a24; margin-bottom: 5px; border-radius: 4px;";
            row.innerHTML = `
                <div style="font-size: 11px; margin-bottom: 5px; color: #aaa;">
                    <span style="background: ${typeBg}; color: ${typeColor}; padding: 2px 6px; border-radius: 3px; font-weight: bold; margin-right: 8px;">${data.actionType}</span> 
                    🕰️ ${time}
                </div>
                <div style="color: #fff; font-size: 13px; line-height: 1.4;">${data.details}</div>
            `;
            listDiv.appendChild(row);
        });
    });
}

// Panggil pendengar log saat halaman dimuat
setTimeout(listenToAdminLogs, 1500);

// ==========================================
// 10. MANAJEMEN GUILD (KLAN)
// ==========================================
let currentEditingGuildId = null;

document.getElementById('btn-search-guild')?.addEventListener('click', async () => {
    const searchValue = document.getElementById('admin-search-guild').value.trim();
    if (!searchValue) return alert("Masukkan Nama Guild terlebih dahulu!");

    const btnSearch = document.getElementById('btn-search-guild');
    btnSearch.innerText = "Mencari...";

    try {
        // METODE BARU: Mencari berdasarkan field "name" di dalam database
        const q = query(collection(db, "guilds"), where("name", "==", searchValue));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            // Guild ditemukan melalui nama field!
            const docSnap = querySnapshot.docs[0]; // Ambil guild pertama yang cocok
            currentEditingGuildId = docSnap.id;
            const data = docSnap.data();

            document.getElementById('admin-guild-name').innerText = data.name || docSnap.id;
            document.getElementById('admin-guild-level').innerText = data.level || 1;
            document.getElementById('admin-guild-gold').innerText = (data.gold || 0).toLocaleString();
            document.getElementById('admin-guild-leader').value = data.leaderId || "";

            document.getElementById('admin-guild-results').style.display = "block";
        } else {
            // METODE CADANGAN: Jika ternyata ID Dokumennya adalah nama guild
            const guildRef = doc(db, "guilds", searchValue);
            const fallbackSnap = await getDoc(guildRef);

            if (fallbackSnap.exists()) {
                currentEditingGuildId = fallbackSnap.id;
                const data = fallbackSnap.data();

                document.getElementById('admin-guild-name').innerText = data.name || fallbackSnap.id;
                document.getElementById('admin-guild-level').innerText = data.level || 1;
                document.getElementById('admin-guild-gold').innerText = (data.gold || 0).toLocaleString();
                document.getElementById('admin-guild-leader').value = data.leaderId || "";

                document.getElementById('admin-guild-results').style.display = "block";
            } else {
                alert("❌ Guild tidak ditemukan! Pastikan nama persis sama (termasuk huruf besar/kecil dan spasi).");
                document.getElementById('admin-guild-results').style.display = "none";
            }
        }
    } catch (err) {
        alert("Gagal mencari Guild: " + err.message);
    } finally {
        btnSearch.innerText = "Cari Guild";
    }
});

// Ganti Ketua Guild Paksa
document.getElementById('btn-change-leader')?.addEventListener('click', async () => {
    if (!currentEditingGuildId) return;
    const newLeaderId = document.getElementById('admin-guild-leader').value.trim();
    if (!newLeaderId) return alert("UID Ketua baru tidak boleh kosong!");

    if (!confirm(`Yakin ingin memaksa pemindahan kepemimpinan Guild [${currentEditingGuildId}] ke UID: ${newLeaderId}?`)) return;

    try {
        await updateDoc(doc(db, "guilds", currentEditingGuildId), {
            leaderId: newLeaderId
        });

        window.logAdminAction("SYSTEM", `Mengganti paksa Ketua Guild [${currentEditingGuildId}] ke UID: ${newLeaderId}`);
        alert("✅ Kepemimpinan Guild berhasil dipindahtangankan!");
    } catch (err) {
        alert("Gagal mengganti ketua: " + err.message);
    }
});

// Bubarkan Guild Paksa
document.getElementById('btn-disband-guild')?.addEventListener('click', async () => {
    if (!currentEditingGuildId) return;

    if (!confirm(`⚠️ PERINGATAN KERAS: Yakin ingin MEMBUBARKAN Guild [${currentEditingGuildId}] secara sepihak? Seluruh dana dan level guild akan hangus!`)) return;

    try {
        await deleteDoc(doc(db, "guilds", currentEditingGuildId));

        window.logAdminAction("SYSTEM", `Membubarkan paksa Guild: [${currentEditingGuildId}]`);

        document.getElementById('admin-guild-results').style.display = "none";
        document.getElementById('admin-search-guild').value = "";
        alert("💥 Guild berhasil dibubarkan selamanya!");
    } catch (err) {
        alert("Gagal membubarkan Guild: " + err.message);
    }
});