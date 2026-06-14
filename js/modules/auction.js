import { collection, doc, runTransaction, query, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

/**
 * Mendengarkan daftar barang di pasar lelang secara real-time
 */
export function listenToAuction(db, callbackRender) {
    const q = query(collection(db, "market"), orderBy("timestamp", "desc"));
    return onSnapshot(q, (snapshot) => {
        let items = [];
        snapshot.forEach((docSnap) => {
            items.push({ id: docSnap.id, ...docSnap.data() });
        });
        callbackRender(items);
    });
}

/**
 * Menjual barang dari tas ke Pasar Lelang
 */
export async function listAuctionItem(db, uid, itemName, price, sellerName) {
    if (!uid) return;
    const userRef = doc(db, "users", uid);
    const marketRef = doc(collection(db, "market"));

    try {
        await runTransaction(db, async (ts) => {
            const data = (await ts.get(userRef)).data();
            let inv = data.inventory || {};

            if (!inv[itemName] || inv[itemName] < 1) throw "Item tidak ditemukan di tas!";
            if (price <= 0) throw "Harga tidak valid!";

            // Kurangi barang dari tas
            inv[itemName] -= 1;
            if (inv[itemName] === 0) delete inv[itemName];

            // Pasang barang di database market
            ts.set(marketRef, {
                sellerId: uid,
                sellerName: sellerName,
                itemName: itemName,
                price: price,
                timestamp: serverTimestamp()
            });

            ts.update(userRef, { inventory: inv });
        });
        alert(`⚖️ Berhasil mendaftarkan ${itemName} ke Lelang seharga ${price} Gold!`);
    } catch (err) {
        alert(err);
    }
}

/**
 * Membeli barang dari Pasar Lelang
 */
export async function buyAuctionItem(db, buyerUid, auctionId, itemName, price, sellerId) {
    if (!buyerUid) return;
    if (buyerUid === sellerId) return alert("Anda tidak bisa membeli barang Anda sendiri!");

    const buyerRef = doc(db, "users", buyerUid);
    const sellerRef = doc(db, "users", sellerId);
    const auctionRef = doc(db, "market", auctionId);

    try {
        await runTransaction(db, async (ts) => {
            const buyerData = (await ts.get(buyerRef)).data();
            const auctionData = (await ts.get(auctionRef)).data();
            const sellerData = (await ts.get(sellerRef)).data();

            if (!auctionData) throw "Barang ini sudah terjual atau ditarik oleh penjual!";
            if ((buyerData.gold || 0) < price) throw "Emas Anda tidak mencukupi!";

            // Proses Pembeli (Kurangi emas, tambah barang)
            let buyerInv = buyerData.inventory || {};
            buyerInv[itemName] = (buyerInv[itemName] || 0) + 1;
            ts.update(buyerRef, { gold: buyerData.gold - price, inventory: buyerInv });

            // Proses Penjual (Tambah emas)
            if (sellerData) {
                ts.update(sellerRef, { gold: (sellerData.gold || 0) + price });
            }

            // Hapus daftar lelang
            ts.delete(auctionRef);
        });
        alert(`🛍️ Berhasil membeli ${itemName} seharga ${price} Gold!`);
    } catch (err) {
        alert(err);
    }
}