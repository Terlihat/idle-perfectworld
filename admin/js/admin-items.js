// File: admin-items.js
import { db } from '../../js/firebase-config.js';
import { collection, doc, setDoc, deleteDoc, onSnapshot, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Mengimpor data dari file items.js yang benar
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
    if (typeof ITEM_DB === 'undefined') return alert("Data statis tidak ditemukan. Pastikan file items.js tersedia.");
    if (!confirm("Tarik dan PERBARUI OTOMATIS semua data sprite koordinat dari file statis ke Firestore? Data lama tidak akan ditimpa jika sudah diedit.")) return;

    try {
        const batch = writeBatch(db);
        let count = 0;

        // 🔥 Perhatikan: Kita sekarang menggunakan ITEM_DB
        for (const [itemName, data] of Object.entries(ITEM_DB)) {
            const ref = doc(db, "items", itemName);

            // Logika tebakan Tipe Item otomatis berdasarkan namanya
            let guessedType = "material";
            const nameLower = itemName.toLowerCase();
            if (nameLower.includes("pedang") || nameLower.includes("tongkat") || nameLower.includes("zirah") || nameLower.includes("cincin") || nameLower.includes("helem") || nameLower.includes("arrow") || nameLower.includes("cover") || nameLower.includes("stir") || nameLower.includes("creator")) guessedType = "equipment";
            if (nameLower.includes("ramuan") || nameLower.includes("health") || nameLower.includes("magic") || nameLower.includes("panacea") || nameLower.includes("coca") || nameLower.includes("sprite")) guessedType = "consumable";
            if (nameLower.includes("kuda") || nameLower.includes("beruang") || nameLower.includes("naga") || nameLower.includes("ufo") || nameLower.includes("gajah") || nameLower.includes("leopard")) guessedType = "mount";

            const itemData = {
                name: itemName,
                col: data.col !== undefined ? data.col : 0,
                row: data.row !== undefined ? data.row : 0,
                type: guessedType,
                goldPrice: 10,
                coinPrice: 0,
                description: `Diimpor otomatis dari sistem statis.`
            };

            batch.set(ref, itemData, { merge: true });
            count++;
        }

        await batch.commit();
        if (window.logAdminAction) window.logAdminAction("SYSTEM", `Auto-Sync ${count} Item Koordinat ke Firestore.`);
        alert(`✅ ${count} item berhasil disinkronkan. Koordinat Sprite (Col/Row) telah diamankan di Cloud!`);
    } catch (err) {
        alert("Gagal Sync: " + err.message);
    }
});