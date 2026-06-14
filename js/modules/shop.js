import { doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Definisikan harga dan status item toko di sini agar rapi
export const SHOP_ITEMS = {
    "Pedang Besi": { type: "weapon", patk: 30, sellValue: 1000, price: 2000 },
    "Tongkat Sihir": { type: "weapon", matk: 30, sellValue: 1000, price: 2000 },
    "Zirah Kulit": { type: "armor", def: 20, sellValue: 1000, price: 2000 },
    "Cincin Akurat": { type: "accessory", accBonus: 10, sellValue: 1500, price: 3000 }
};

export async function buyEquipment(db, uid, itemName) {
    if (!uid) return;
    const itemData = SHOP_ITEMS[itemName];
    if (!itemData) return;

    const userRef = doc(db, "users", uid);
    try {
        await runTransaction(db, async (ts) => {
            const data = (await ts.get(userRef)).data();
            const gold = data.gold || 0;

            if (gold < itemData.price) throw "Emas Anda tidak cukup untuk membeli item ini!";

            let inv = data.inventory || {};
            // Batasi slot maksimal tas jika diperlukan, contoh di bawah langsung menambahkan
            inv[itemName] = (inv[itemName] || 0) + 1;

            ts.update(userRef, {
                gold: gold - itemData.price,
                inventory: inv
            });
        });
        alert(`🛒 Berhasil membeli ${itemName}!`);
    } catch (err) {
        alert(err);
    }
}