/* ===================================================
   MODUL CRAFTING & PELEBURAN (DISMANTLE ENGINE)
   =================================================== */
import { doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// 1. KAMUS PELEBURAN (Sesuai item kroco di monsters.js Anda)
export const DISMANTLE_CONFIG = {
    "Pedang Besi": { resultItem: "Serpihan Baja", min: 1, max: 3 },
    "Ramuan HP": { resultItem: "Botol Kosong", min: 1, max: 1 },
    "Zirah Kulit": { resultItem: "Potongan Kulit", min: 1, max: 2 },
    "Tongkat Sihir": { resultItem: "Kayu Ajaib", min: 1, max: 2 },
    "Cincin Akurat": { resultItem: "Serbuk Kristal", min: 1, max: 1 }
};

// 2. FUNGSI PELEBURAN ITEM
export async function dismantleItemAction(db, uid, itemName) {
    const recipe = DISMANTLE_CONFIG[itemName];
    if (!recipe) return alert(`❌ Item [${itemName}] tidak memiliki resep peleburan.`);

    const userRef = doc(db, "users", uid);

    try {
        await runTransaction(db, async (ts) => {
            const snap = await ts.get(userRef);
            if (!snap.exists()) throw "User tidak ditemukan!";
            const data = snap.data();
            let inv = data.inventory || {};

            if (!inv[itemName] || inv[itemName] < 1) throw `Anda tidak memiliki [${itemName}] untuk dilebur.`;

            // Kurangi item sampah (-1)
            inv[itemName] -= 1;
            if (inv[itemName] <= 0) delete inv[itemName];

            // Hitung material yang didapat
            const getQty = Math.floor(Math.random() * (recipe.max - recipe.min + 1)) + recipe.min;

            // Tambahkan material ke tas
            inv[recipe.resultItem] = (inv[recipe.resultItem] || 0) + getQty;

            // Simpan
            ts.update(userRef, { inventory: inv });
            alert(`🔥 PELEBURAN BERHASIL!\n[${itemName}] hancur dan Anda mendapatkan +${getQty} ${recipe.resultItem}.`);
        });
    } catch (err) { alert(err); }
}