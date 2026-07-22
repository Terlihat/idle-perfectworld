// ==========================================
// SISTEM DATABASE: CLOUD ITEM DB
// ==========================================
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Tetap menggunakan window agar database item ini bisa dibaca dari file mana saja
window.CLOUD_ITEM_DB = {};

export async function loadCloudItems(db) {
    try {
        const querySnapshot = await getDocs(collection(db, "items"));

        querySnapshot.forEach(doc => {
            window.CLOUD_ITEM_DB[doc.id] = doc.data();
        });

        console.log("✅ Data Item Cloud berhasil dimuat ke memori pemain!");

        // 🔥 PERBAIKAN: Paksa sistem menggambar ulang UI Tas dan Bank 
        // SETELAH data Cloud benar-benar selesai diunduh.
        if (typeof window.renderInventoryUI === 'function' && window.currentInventoryData) {
            window.renderInventoryUI(window.currentInventoryData);
        }

        // (Opsional) Panggil ulang fungsi update utama game Anda jika ada
        if (typeof window.updateUI === 'function') {
            window.updateUI();
        }

    } catch (err) {
        console.error("Gagal menarik data item dari Cloud:", err);
    }
}