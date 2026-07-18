/* ===================================================
   MODUL TOKO PERLENGKAPAN & MOUNT (SHOP)
   =================================================== */
import { doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { ITEM_DB } from '../data/items.js';

// DAFTAR HARGA BARANG DI TOKO (GOLD)
const SHOP_PRICES = {
    "Pedang Besi": 2000,
    "Tongkat Sihir": 2000,
    "Zirah Kulit": 2000,
    "Cincin Akurat": 3000,
    "Kuda Coklat": 5000,        // Harga Mount Kuda
    "Beruang Kutub": 25000      // Harga Mount Beruang
};

export async function buyEquipment(db, uid, itemName) {
    if (!uid || !itemName) return;

    const price = SHOP_PRICES[itemName];
    if (!price) return alert("Item tidak dijual di toko ini!");

    const userRef = doc(db, "users", uid);

    try {
        await runTransaction(db, async (ts) => {
            const snap = await ts.get(userRef);
            if (!snap.exists()) throw "Data pemain tidak ditemukan!";
            const data = snap.data();

            if ((data.gold || 0) < price) throw `Gold Anda tidak cukup! Butuh ${price.toLocaleString()} Gold untuk membeli ${itemName}.`;

            // Tambahkan barang ke Inventory
            let inv = data.inventory || {};
            inv[itemName] = (inv[itemName] || 0) + 1;

            // Kurangi Gold
            ts.update(userRef, {
                gold: data.gold - price,
                inventory: inv
            });
        });
        alert(`🛒 Berhasil membeli ${itemName} seharga ${price.toLocaleString()} Gold! Silakan cek Tas Anda untuk memakainya.`);
    } catch (err) {
        alert(err);
    }
}

// ==========================================
// TRANSAKSI PEMBELIAN TOKO & MALL
// ==========================================
export async function executePurchase(db, uid, itemName, price, qty, currency) {
    const userRef = doc(db, "users", uid);
    const totalCost = price * qty;

    await runTransaction(db, async (ts) => {
        const snap = await ts.get(userRef);
        if (!snap.exists()) throw "User tidak ditemukan.";
        const data = snap.data();
        let updates = {};

        if (currency === 'Gold') {
            if ((data.gold || 0) < totalCost) throw `Gold tidak cukup! Butuh ${totalCost.toLocaleString()} Gold.`;
            updates.gold = data.gold - totalCost;
        } else if (currency === 'Coin') {
            if ((data.coin || 0) < totalCost) throw `Coin Premium tidak cukup! Butuh ${totalCost.toLocaleString()} Coin.`;
            updates.coin = data.coin - totalCost;
        }

        let inv = data.inventory || {};
        inv[itemName] = (inv[itemName] || 0) + qty;
        updates.inventory = inv;

        ts.update(userRef, updates);
    });
}