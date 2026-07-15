// File: admin-player.js
import { db } from '../../js/firebase-config.js';
// 🔥 PERUBAHAN 1: Tambahkan collection, query, where, getDocs ke dalam import
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

let currentEditingUid = null;
let currentEditingBannedStatus = false;
let currentEditingFrozenStatus = false;

// ==========================================
// FITUR PENCARIAN GANDA (UID / NICKNAME)
// ==========================================
document.getElementById('btn-search-player')?.addEventListener('click', async () => {
    const searchValue = document.getElementById('editor-search-uid').value.trim();
    if (!searchValue) return alert("Masukkan UID atau Nickname Pemain!");

    try {
        let targetUid = searchValue;
        let docSnap = await getDoc(doc(db, "users", targetUid));

        // 🔥 PERUBAHAN 2: Jika pencarian UID gagal, sistem akan melacak berdasarkan Nickname (username)
        if (!docSnap.exists()) {
            const q = query(collection(db, "users"), where("username", "==", searchValue));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                // Ambil data dari pemain pertama yang namanya cocok
                docSnap = querySnapshot.docs[0];
                targetUid = docSnap.id; // Dapatkan UID asli dari pemain tersebut
            }
        }

        // Jika pemain ditemukan (baik lewat UID maupun Nickname)
        if (docSnap.exists()) {
            const data = docSnap.data();
            currentEditingUid = targetUid; // Kunci UID pemain untuk proses edit selanjutnya
            currentEditingBannedStatus = data.banned || false;
            currentEditingFrozenStatus = data.isFrozen || false;

            document.getElementById('edit-player-name').innerText = data.username || "Hero Anonim";
            document.getElementById('edit-player-level').innerText = data.level || 1;
            document.getElementById('edit-player-class').innerText = data.characterClass || "Tidak diketahui";
            document.getElementById('edit-player-gold').value = data.gold || 0;
            document.getElementById('edit-player-coin').value = data.coin || 0;
            document.getElementById('edit-player-level-input').value = data.level || 1;
            document.getElementById('edit-player-exp').value = data.exp || 0;
            document.getElementById('edit-player-vip').value = data.vipLevel || 0;

            const btnBan = document.getElementById('btn-ban-player');
            btnBan.innerText = currentEditingBannedStatus ? "✅ Buka Ban" : "🚫 Banned Pemain";
            btnBan.style.background = currentEditingBannedStatus ? "#28a745" : "#dc3545";

            const btnFreeze = document.getElementById('btn-freeze-player');
            btnFreeze.innerText = currentEditingFrozenStatus ? "🔥 Cairkan Akun" : "❄️ Bekukan (Freeze)";
            btnFreeze.style.background = currentEditingFrozenStatus ? "#d35400" : "#6f42c1";

            renderPlayerInventory(targetUid, data.inventory || {});
            document.getElementById('editor-results').style.display = "block";
        } else {
            alert("❌ Pemain tidak ditemukan! Pastikan ejaan Nickname (huruf besar/kecil) atau UID sudah benar.");
            document.getElementById('editor-results').style.display = "none";
        }
    } catch (err) {
        console.error("Error mencari pemain:", err);
        alert("Terjadi kesalahan saat mencari pemain.");
    }
});

// ==========================================
// SIMPAN, BAN, DAN FREEZE PEMAIN
// ==========================================
document.getElementById('btn-save-player')?.addEventListener('click', async () => {
    if (!currentEditingUid) return;
    const newGold = parseInt(document.getElementById('edit-player-gold').value) || 0;
    const newCoin = parseInt(document.getElementById('edit-player-coin').value) || 0;
    const newLevel = parseInt(document.getElementById('edit-player-level-input').value) || 1;
    if (!confirm("Yakin ingin mengubah data?")) return;
    try {
        await updateDoc(doc(db, "users", currentEditingUid), {
            gold: newGold, coin: newCoin, level: newLevel,
            exp: parseInt(document.getElementById('edit-player-exp').value) || 0,
            vipLevel: parseInt(document.getElementById('edit-player-vip').value) || 0
        });
        if (window.logAdminAction) window.logAdminAction("ECONOMY", `Ubah UID: ${currentEditingUid} | Lvl: ${newLevel}, Gold: ${newGold}, Coin: ${newCoin}`);
        document.getElementById('edit-player-level').innerText = newLevel;
        alert("✅ Data diperbarui!");
    } catch (err) { alert("Gagal menyimpan."); }
});

document.getElementById('btn-ban-player')?.addEventListener('click', async () => {
    if (!currentEditingUid) return;
    if (!confirm(`Yakin ingin ${currentEditingBannedStatus ? 'Un-Ban' : 'Ban'}?`)) return;
    try {
        currentEditingBannedStatus = !currentEditingBannedStatus;
        await updateDoc(doc(db, "users", currentEditingUid), { banned: currentEditingBannedStatus });
        if (window.logAdminAction) window.logAdminAction("BANNED", `${currentEditingBannedStatus ? 'Banned' : 'Unban'} pada UID: ${currentEditingUid}`);

        alert(`✅ Pemain berhasil di-${currentEditingBannedStatus ? "Banned" : "Unban"}!`);

        const btnBan = document.getElementById('btn-ban-player');
        btnBan.innerText = currentEditingBannedStatus ? "✅ Buka Ban (Un-Ban)" : "🚫 Banned Pemain";
        btnBan.style.background = currentEditingBannedStatus ? "#28a745" : "#dc3545";

    } catch (err) { alert("Gagal mengubah ban."); }
});

document.getElementById('btn-freeze-player')?.addEventListener('click', async () => {
    if (!currentEditingUid) return;
    if (!confirm(`Yakin ingin ${currentEditingFrozenStatus ? 'Cairkan' : 'Bekukan'}?`)) return;
    try {
        currentEditingFrozenStatus = !currentEditingFrozenStatus;
        await updateDoc(doc(db, "users", currentEditingUid), { isFrozen: currentEditingFrozenStatus });
        if (window.logAdminAction) window.logAdminAction("SYSTEM", `${currentEditingFrozenStatus ? 'FREEZE' : 'UN-FREEZE'} pada UID: ${currentEditingUid}`);

        alert(`✅ Akun berhasil di-${currentEditingFrozenStatus ? "Bekukan" : "Cairkan"}!`);

        const btnFreeze = document.getElementById('btn-freeze-player');
        btnFreeze.innerText = currentEditingFrozenStatus ? "🔥 Cairkan Akun (Un-Freeze)" : "❄️ Bekukan (Freeze)";
        btnFreeze.style.background = currentEditingFrozenStatus ? "#d35400" : "#6f42c1";

    } catch (err) { alert("Gagal mengubah freeze."); }
});

// ==========================================
// SISTEM INVENTORY PEMAIN
// ==========================================
function renderPlayerInventory(uid, inventoryObj) {
    const listDiv = document.getElementById('player-inventory-list');
    if (!listDiv) return;
    listDiv.innerHTML = "";
    const items = Object.keys(inventoryObj);
    if (items.length === 0) return listDiv.innerHTML = `<div style="text-align: center; color: #aaa; padding: 10px;">Tas kosong.</div>`;

    items.forEach(itemName => {
        listDiv.innerHTML += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; border-bottom: 1px solid #333;">
                <div style="color: #fff; font-size: 13px;">${itemName} <span style="color: #ffca28; font-weight: bold;">(x${inventoryObj[itemName]})</span></div>
                <button class="btn-delete-item" data-item="${itemName}" style="background: #dc3545; color: white; padding: 5px 12px; font-size: 11px; border: none; border-radius: 4px; cursor: pointer;">🗑️ Hapus</button>
            </div>`;
    });

    document.querySelectorAll('.btn-delete-item').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const itemToRemove = e.target.getAttribute('data-item');
            if (!confirm(`Hapus SELURUH [${itemToRemove}]?`)) return;
            try {
                const userRef = doc(db, "users", uid);
                const docSnap = await getDoc(userRef);
                if (docSnap.exists()) {
                    let currentInv = docSnap.data().inventory || {};
                    delete currentInv[itemToRemove];
                    await updateDoc(userRef, { inventory: currentInv });
                    renderPlayerInventory(uid, currentInv);
                }
            } catch (err) { alert("Gagal menghapus."); }
        });
    });
}

document.getElementById('btn-inject-item')?.addEventListener('click', async () => {
    if (!currentEditingUid) return alert("Cari pemain dulu!");
    const itemName = document.getElementById('inject-item-name').value;
    const itemQty = parseInt(document.getElementById('inject-item-qty').value) || 1;
    if (!itemName) return alert("Pilih item!");

    try {
        const userRef = doc(db, "users", currentEditingUid);
        const docSnap = await getDoc(userRef);
        if (docSnap.exists()) {
            let currentInv = docSnap.data().inventory || {};
            currentInv[itemName] = (currentInv[itemName] || 0) + itemQty;
            await updateDoc(userRef, { inventory: currentInv });
            if (window.logAdminAction) window.logAdminAction("INJECT", `Suntik ${itemQty}x [${itemName}] ke UID: ${currentEditingUid}`);
            alert(`✅ SUKSES menyuntik item!`);
            renderPlayerInventory(currentEditingUid, currentInv);
        }
    } catch (err) { alert("Gagal menyuntik."); }
});