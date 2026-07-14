// File: admin-items.js
import { db } from '../../js/firebase-config.js';
import { collection, doc, setDoc, deleteDoc, onSnapshot, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { ITEM_DB } from '../../js/data/items.js';

// ==========================================
// 1. LISTEN DATABASE ITEM DARI FIRESTORE
// ==========================================
window.listenToItemsDb = function () {
    const listDiv = document.getElementById('admin-item-db-list');
    if (!listDiv) return;

    onSnapshot(collection(db, "items"), (snapshot) => {
        listDiv.innerHTML = "";

        if (snapshot.empty) {
            listDiv.innerHTML = `<div style="text-align: center; color: #aaa; padding: 30px; font-size: 13px;">Database Item kosong. Klik Sync Default untuk memigrasi data statis.</div>`;
            return;
        }

        let itemsArray = [];
        snapshot.forEach((docSnap) => itemsArray.push({ id: docSnap.id, ...docSnap.data() }));

        // Urutkan berdasarkan nama agar mudah dicari
        itemsArray.sort((a, b) => a.id.localeCompare(b.id));

        itemsArray.forEach((data) => {
            const dataString = encodeURIComponent(JSON.stringify(data));
            let typeColor = "#aaa";
            if (data.type === "equipment") typeColor = "#ff4c4c";
            if (data.type === "consumable") typeColor = "#a6e3a1";
            if (data.type === "mount") typeColor = "#ffca28";

            listDiv.innerHTML += `
                <div style="padding: 10px; border-bottom: 1px solid #333; background: #1a1a24; margin-bottom: 5px; border-radius: 4px; display: flex; justify-content: space-between; align-items: center;">
                    <div style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="color: #fff; font-weight: bold; font-size: 14px;">${data.id}</span>
                            <span style="background: #333; color: ${typeColor}; padding: 2px 6px; border-radius: 3px; font-size: 9px; font-weight: bold; text-transform: uppercase;">${data.type || 'MATERIAL'}</span>
                        </div>
                        <div style="color: #aaa; font-size: 11px; margin-top: 5px; display: flex; gap: 10px;">
                            <span>Sprite: [Col: ${data.col || 0}, Row: ${data.row || 0}]</span>
                            <span style="color: #ffd700;">Harga: ${data.goldPrice || 0}G</span>
                        </div>
                    </div>
                    <button class="btn-edit-item-db" data-info="${dataString}" style="background: #0366d6; color: white; padding: 6px 12px; font-size: 11px; font-weight: bold; border: none; border-radius: 4px; cursor: pointer;">Edit</button>
                </div>`;
        });

        // Event Listener Tombol Edit
        document.querySelectorAll('.btn-edit-item-db').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const data = JSON.parse(decodeURIComponent(e.target.getAttribute('data-info')));

                document.getElementById('editor-item-original-id').value = data.id;
                document.getElementById('editor-item-name').value = data.id;
                document.getElementById('editor-item-type').value = data.type || "material";
                document.getElementById('editor-item-col').value = data.col || 0;
                document.getElementById('editor-item-row').value = data.row || 0;
                document.getElementById('editor-item-price-gold').value = data.goldPrice || 0;
                document.getElementById('editor-item-price-coin').value = data.coinPrice || 0;
                document.getElementById('editor-item-desc').value = data.description || "";
                document.getElementById('editor-item-patk').value = data.patk || 0;
                document.getElementById('editor-item-matk').value = data.matk || 0;
                document.getElementById('editor-item-def').value = data.def || 0;
                document.getElementById('editor-item-hp-bonus').value = data.hpBonus || 0;
                document.getElementById('editor-item-acc-bonus').value = data.accBonus || 0;
                document.getElementById('editor-item-stam-discount').value = data.stamDiscount || 0;

                const editorPanel = document.getElementById('item-editor-panel');
                editorPanel.style.opacity = "1";
                editorPanel.style.pointerEvents = "auto";
            });
        });
    });
};

// ==========================================
// 2. SIMPAN & HAPUS ITEM MANUAL
// ==========================================
document.getElementById('btn-add-new-item')?.addEventListener('click', () => {
    document.getElementById('editor-item-original-id').value = "";
    document.getElementById('editor-item-name').value = "";
    document.getElementById('editor-item-type').value = "material";
    document.getElementById('editor-item-col').value = "0";
    document.getElementById('editor-item-row').value = "0";
    document.getElementById('editor-item-price-gold').value = "0";
    document.getElementById('editor-item-price-coin').value = "0";
    document.getElementById('editor-item-desc').value = "";
    document.getElementById('editor-item-patk').value = "0";
    document.getElementById('editor-item-matk').value = "0";
    document.getElementById('editor-item-def').value = "0";
    document.getElementById('editor-item-hp-bonus').value = "0";
    document.getElementById('editor-item-acc-bonus').value = "0";
    document.getElementById('editor-item-stam-discount').value = "0";

    document.getElementById('item-editor-panel').style.opacity = "1";
    document.getElementById('item-editor-panel').style.pointerEvents = "auto";
});

document.getElementById('btn-save-item')?.addEventListener('click', async () => {
    const originalId = document.getElementById('editor-item-original-id').value;
    const newId = document.getElementById('editor-item-name').value.trim(); // Nama item bertindak sebagai ID

    if (!newId) return alert("Nama item tidak boleh kosong!");

    const dataToSave = {
        name: newId,
        type: document.getElementById('editor-item-type').value,
        col: parseInt(document.getElementById('editor-item-col').value) || 0,
        row: parseInt(document.getElementById('editor-item-row').value) || 0,
        goldPrice: parseInt(document.getElementById('editor-item-price-gold').value) || 0,
        coinPrice: parseInt(document.getElementById('editor-item-price-coin').value) || 0,
        description: document.getElementById('editor-item-desc').value.trim()
    };

    const patk = parseInt(document.getElementById('editor-item-patk').value) || 0;
    const matk = parseInt(document.getElementById('editor-item-matk').value) || 0;
    const def = parseInt(document.getElementById('editor-item-def').value) || 0;
    const hpBonus = parseInt(document.getElementById('editor-item-hp-bonus').value) || 0;
    const accBonus = parseInt(document.getElementById('editor-item-acc-bonus').value) || 0;
    const stamDiscount = parseInt(document.getElementById('editor-item-stam-discount').value) || 0;

    if (patk > 0) dataToSave.patk = patk; else dataToSave.patk = 0; // atau bisa menggunakan FieldValue.delete() jika mau dihapus total
    if (matk > 0) dataToSave.matk = matk; else dataToSave.matk = 0;
    if (def > 0) dataToSave.def = def; else dataToSave.def = 0;
    if (hpBonus > 0) dataToSave.hpBonus = hpBonus; else dataToSave.hpBonus = 0;
    if (accBonus > 0) dataToSave.accBonus = accBonus; else dataToSave.accBonus = 0;
    if (stamDiscount > 0) dataToSave.stamDiscount = stamDiscount; else dataToSave.stamDiscount = 0;

    try {
        const btn = document.getElementById('btn-save-item');
        btn.innerText = "⏳ Menyimpan..."; btn.disabled = true;

        // Jika pemain mengubah nama (ID), kita harus menghapus ID lama agar tidak duplikat
        if (originalId && originalId !== newId) {
            await deleteDoc(doc(db, "items", originalId));
        }

        await setDoc(doc(db, "items", newId), dataToSave, { merge: true });

        if (window.logAdminAction) window.logAdminAction("SYSTEM", `Menyimpan data Item: [${newId}]`);

        btn.innerText = "✅ Tersimpan!";
        setTimeout(() => { btn.innerText = "💾 Simpan Item"; btn.disabled = false; }, 2000);
        document.getElementById('editor-item-original-id').value = newId; // Update ID aktif
    } catch (err) {
        alert("Gagal menyimpan item: " + err.message);
        document.getElementById('btn-save-item').disabled = false;
    }
});

document.getElementById('btn-delete-item')?.addEventListener('click', async () => {
    const itemId = document.getElementById('editor-item-original-id').value;
    if (!itemId) return alert("Pilih item yang sudah ada terlebih dahulu!");

    if (!confirm(`YAKIN ingin menghapus item [${itemId}] dari database secara permanen?`)) return;

    try {
        await deleteDoc(doc(db, "items", itemId));
        if (window.logAdminAction) window.logAdminAction("SYSTEM", `MENGHAPUS Item: [${itemId}].`);
        alert("💥 Item berhasil dihapus.");

        document.getElementById('item-editor-panel').style.opacity = "0.5";
        document.getElementById('item-editor-panel').style.pointerEvents = "none";
    } catch (err) {
        alert("Gagal menghapus: " + err.message);
    }
});

// ==========================================
// 3. MIGRASI CERDAS DATA LAMA (SYNC DEFAULT)
// ==========================================
document.getElementById('btn-sync-default-items')?.addEventListener('click', async () => {
    if (typeof ITEM_DB === 'undefined') return alert("Data items.js tidak ditemukan.");
    if (!confirm("Tarik dan GABUNGKAN data dari items.json (Gambar) dan items.js (Status RPG) ke Firestore?")) return;

    try {
        const btn = document.getElementById('btn-sync-default-items');
        btn.innerText = "⏳ Menarik Data..."; btn.disabled = true;

        // 1. Tarik Data Gambar (Koordinat Sprite) dari JSON
        const response = await fetch('../data/items.json');
        if (!response.ok) throw new Error("Gagal menemukan items.json.");
        const ITEM_JSON_DB = await response.json();

        const batch = writeBatch(db);
        let count = 0;

        // 2. Kumpulkan SEMUA nama item dari kedua file agar tidak ada yang terlewat
        const allItemNames = new Set([
            ...Object.keys(ITEM_JSON_DB),
            ...Object.keys(ITEM_DB)
        ]);

        // 3. Mulai Penggabungan (Merge)
        for (const itemName of allItemNames) {
            const ref = doc(db, "items", itemName);

            // Ambil data dari masing-masing file (jika tidak ada, beri objek kosong)
            const jsonInfo = ITEM_JSON_DB[itemName] || {};
            const jsInfo = ITEM_DB[itemName] || {};

            // Logika Fallback Tipe (Jika di items.js tidak ada type-nya)
            let finalType = jsInfo.type || "material";
            if (!jsInfo.type) {
                const nameLower = itemName.toLowerCase();
                if (nameLower.includes("pedang") || nameLower.includes("tongkat") || nameLower.includes("zirah")) finalType = "equipment";
                if (nameLower.includes("ramuan") || nameLower.includes("health")) finalType = "consumable";
            }

            let finalType = jsInfo.type || "loot"; // default ke loot
            if (!jsInfo.type) {
                const nameLower = itemName.toLowerCase();
                if (nameLower.includes("pedang") || nameLower.includes("tongkat") || nameLower.includes("kapak")) finalType = "weapon";
                if (nameLower.includes("zirah") || nameLower.includes("jubah") || nameLower.includes("helem")) finalType = "armor";
                if (nameLower.includes("cincin") || nameLower.includes("kalung") || nameLower.includes("mahkota")) finalType = "accessory";
                if (nameLower.includes("ramuan") || nameLower.includes("health") || nameLower.includes("magic") || nameLower.includes("panacea") || nameLower.includes("coca") || nameLower.includes("sprite")) finalType = "consumable";
                if (nameLower.includes("kuda") || nameLower.includes("beruang") || nameLower.includes("naga") || nameLower.includes("ufo") || nameLower.includes("gajah") || nameLower.includes("leopard")) finalType = "mount";
                if (nameLower.includes("orb") || nameLower.includes("stone")) finalType = "catalyst";
            }

            // Susun Data Final
            const itemData = {
                name: itemName,
                col: jsonInfo.col !== undefined ? jsonInfo.col : 0,
                row: jsonInfo.row !== undefined ? jsonInfo.row : 0,
                type: finalType,
                // Ambil harga dari sellValue items.js
                goldPrice: jsInfo.sellValue !== undefined ? jsInfo.sellValue : 10,
                coinPrice: 0,
                description: jsInfo.desc || `Diimpor otomatis dari sistem statis.`
            };

            // 🔥 SELAMATKAN STATUS RPG! 
            // Jika item punya status ATK/DEF di items.js, masukkan ke Firestore!
            if (jsInfo.patk) itemData.patk = jsInfo.patk;
            if (jsInfo.matk) itemData.matk = jsInfo.matk;
            if (jsInfo.def) itemData.def = jsInfo.def;
            if (jsInfo.hpBonus) itemData.hpBonus = jsInfo.hpBonus;
            if (jsInfo.accBonus) itemData.accBonus = jsInfo.accBonus;
            if (jsInfo.stamDiscount) itemData.stamDiscount = jsInfo.stamDiscount;

            batch.set(ref, itemData, { merge: true });
            count++;
        }

        await batch.commit();
        if (window.logAdminAction) window.logAdminAction("SYSTEM", `Auto-Sync & Merge ${count} Item ke Firestore.`);

        btn.innerText = "♻️ Sync Default"; btn.disabled = false;
        alert(`✅ ${count} item berhasil digabungkan! Koordinat, Harga, dan Status RPG sekarang bersatu di Cloud.`);

    } catch (err) {
        alert("Gagal Sync: " + err.message);
        document.getElementById('btn-sync-default-items').innerText = "♻️ Sync Default";
        document.getElementById('btn-sync-default-items').disabled = false;
    }
});