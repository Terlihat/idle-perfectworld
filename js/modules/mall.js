import { doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

/**
 * Fungsi universal untuk membeli item di Premium Mall menggunakan COIN
 */
export async function buyMallItem(db, uid, itemName, coinPrice) {
    if (!uid) return;
    const userRef = doc(db, "users", uid);

    try {
        await runTransaction(db, async (ts) => {
            const data = (await ts.get(userRef)).data();
            const currentCoin = data.coin || 0;

            if (currentCoin < coinPrice) {
                throw `Koin Premium tidak cukup! Butuh ${coinPrice} COIN untuk membeli ${itemName}.`;
            }

            let inv = data.inventory || {};
            // Tambahkan item ke tas utama
            inv[itemName] = (inv[itemName] || 0) + 1;

            ts.update(userRef, {
                coin: currentCoin - coinPrice,
                inventory: inv
            });
        });
        alert(`💎 Berhasil membeli ${itemName} seharga ${coinPrice} COIN! Cek tas Anda.`);
    } catch (err) {
        alert(err);
    }
}