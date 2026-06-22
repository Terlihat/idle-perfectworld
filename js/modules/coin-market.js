import { db } from '../firebase-config.js';
import { doc, runTransaction, collection, addDoc, deleteDoc, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

window.cmDeposit = async function(type) {
    const amountStr = await window.rpgPrompt(`Berapa banyak ${type.toUpperCase()} yang ingin disetor ke Bursa?`, "Deposit Bursa", "number");
    const amount = parseInt(amountStr);
    if (!amount || amount <= 0) return;

    try {
        await runTransaction(db, async (ts) => {
            const userRef = doc(db, "users", window.currentUserUid);
            const data = (await ts.get(userRef)).data();

            if (type === 'coin') {
                if ((data.coin || 0) < amount) throw "Koin Anda di Tas tidak cukup!";
                ts.update(userRef, { 
                    coin: data.coin - amount, 
                    auctionBalanceCoin: (data.auctionBalanceCoin || 0) + amount 
                });
            } else {
                if ((data.gold || 0) < amount) throw "Gold Anda di Tas tidak cukup!";
                ts.update(userRef, { 
                    gold: data.gold - amount, 
                    auctionBalanceGold: (data.auctionBalanceGold || 0) + amount 
                });
            }
        });
        window.rpgAlert(`Berhasil menyetor ${amount} ${type.toUpperCase()} ke Bursa!`);
    } catch (err) { window.rpgAlert(err, "Deposit Gagal"); }
};

window.cmWithdraw = async function(type) {
    const amountStr = await window.rpgPrompt(`Berapa banyak ${type.toUpperCase()} yang ingin ditarik ke Tas?`, "Tarik Dana Bursa", "number");
    const amount = parseInt(amountStr);
    if (!amount || amount <= 0) return;

    try {
        await runTransaction(db, async (ts) => {
            const userRef = doc(db, "users", window.currentUserUid);
            const data = (await ts.get(userRef)).data();

            if (type === 'coin') {
                if ((data.auctionBalanceCoin || 0) < amount) throw "Saldo Koin di Bursa tidak cukup!";
                ts.update(userRef, { 
                    coin: (data.coin || 0) + amount, 
                    auctionBalanceCoin: data.auctionBalanceCoin - amount 
                });
            } else {
                if ((data.auctionBalanceGold || 0) < amount) throw "Saldo Gold di Bursa tidak cukup!";
                ts.update(userRef, { 
                    gold: (data.gold || 0) + amount, 
                    auctionBalanceGold: data.auctionBalanceGold - amount 
                });
            }
        });
        window.rpgAlert(`Berhasil menarik ${amount} ${type.toUpperCase()} ke Tas!`);
    } catch (err) { window.rpgAlert(err, "Penarikan Gagal"); }
};

// --- PASANG LELANG (DENGAN AMBANG BATAS 50-100%) ---
window.cmSubmitSell = async function() {
    const amount = parseInt(document.getElementById('cm-sell-amount').value);
    const price = parseInt(document.getElementById('cm-sell-price').value);

    if (!amount || amount <= 0 || !price || price <= 0) return window.rpgAlert("Masukkan jumlah dan harga yang valid!");

    // KALKULASI AMBANG BATAS (100 Coin = 10.000 Gold => 1 Coin = 100 Gold)
    const maxPrice = amount * 100; // 100%
    const minPrice = amount * 50;  // 50%

    if (price < minPrice) return window.rpgAlert(`Harga terlalu MURAH! Minimal untuk ${amount} Coin adalah ${minPrice} Gold.`, "Ditolak Sistem");
    if (price > maxPrice) return window.rpgAlert(`Harga terlalu MAHAL! Maksimal untuk ${amount} Coin adalah ${maxPrice} Gold.`, "Ditolak Sistem");

    try {
        await runTransaction(db, async (ts) => {
            const userRef = doc(db, "users", window.currentUserUid);
            const data = (await ts.get(userRef)).data();

            if ((data.auctionBalanceCoin || 0) < amount) throw "Saldo Koin Bursa Anda tidak cukup! Lakukan Deposit Koin terlebih dahulu.";
            
            // Potong saldo koin bursa pemain
            ts.update(userRef, { auctionBalanceCoin: data.auctionBalanceCoin - amount });
        });

        // Masukkan barang ke Market
        await addDoc(collection(db, "coin_market"), {
            sellerUid: window.currentUserUid,
            sellerName: window.playerUsername,
            amount: amount,
            price: price,
            timestamp: Date.now()
        });

        document.getElementById('cm-sell-amount').value = "";
        document.getElementById('cm-sell-price').value = "";
        window.rpgAlert("Koin berhasil dilelang!", "Sukses");

    } catch (err) { window.rpgAlert(err, "Gagal Pasang Lelang"); }
};

// --- BELI KOIN ---
window.cmBuyCoin = async function(marketId, sellerUid, amount, price) {
    if (sellerUid === window.currentUserUid) return window.rpgAlert("Anda tidak bisa membeli lelang Anda sendiri!");
    
    if (!await window.rpgConfirm(`Beli ${amount} Coin seharga ${price} Gold? (Pastikan saldo Bursa Gold cukup)`, "Beli Coin")) return;

    try {
        await runTransaction(db, async (ts) => {
            const buyerRef = doc(db, "users", window.currentUserUid);
            const sellerRef = doc(db, "users", sellerUid);
            const marketRef = doc(db, "coin_market", marketId);

            const buyerData = (await ts.get(buyerRef)).data();
            const marketSnap = await ts.get(marketRef);

            if (!marketSnap.exists()) throw "Barang sudah terjual atau ditarik!";
            if ((buyerData.auctionBalanceGold || 0) < price) throw "Saldo Gold Bursa Anda tidak cukup! Deposit Gold dulu.";

            // 1. Kurangi Gold pembeli, tambah Koin pembeli
            ts.update(buyerRef, {
                auctionBalanceGold: buyerData.auctionBalanceGold - price,
                auctionBalanceCoin: (buyerData.auctionBalanceCoin || 0) + amount
            });

            // 2. Tambah Gold penjual (Bayar penjual)
            // Karena ini transaksi asinkron, kita pastikan penjual ada
            const sellerData = (await ts.get(sellerRef)).data();
            if (sellerData) {
                ts.update(sellerRef, { auctionBalanceGold: (sellerData.auctionBalanceGold || 0) + price });
            }

            // 3. Hapus lelang dari market
            ts.delete(marketRef);
        });

        window.rpgAlert(`Pembelian sukses! ${amount} Coin masuk ke Saldo Bursa Anda.`);
    } catch (err) { window.rpgAlert(err, "Transaksi Gagal"); }
};

// --- LISTENER LIVE UPDATE BURSA ---
export function listenToCoinMarket(db, renderCallback) {
    const q = query(collection(db, "coin_market"), orderBy("timestamp", "asc"));
    return onSnapshot(q, (snapshot) => {
        let marketItems = [];
        snapshot.forEach(doc => marketItems.push({ id: doc.id, ...doc.data() }));
        renderCallback(marketItems);
    });
}