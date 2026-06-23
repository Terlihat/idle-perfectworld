import { db } from '../firebase-config.js';
import { doc, runTransaction, collection, addDoc, deleteDoc, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

window.cmDeposit = async function (type) {
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

window.cmWithdraw = async function (type) {
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
window.cmSubmitSell = async function () {
    const amount = parseInt(document.getElementById('cm-sell-amount').value);
    const price = parseInt(document.getElementById('cm-sell-price').value);

    if (!amount || amount <= 0 || !price || price <= 0) return window.rpgAlert("Masukkan jumlah dan harga yang valid!");

    // KALKULASI AMBANG BATAS (100 Coin = 10.000 Gold => 1 Coin = 100 Gold)[cite: 1]
    const maxPrice = amount * 100; // 100%[cite: 1]
    const minPrice = amount * 50;  // 50%[cite: 1]

    if (price < minPrice) return window.rpgAlert(`Harga terlalu MURAH! Minimal untuk ${amount} Coin adalah ${minPrice} Gold.`, "Ditolak Sistem");[cite: 1]
    if (price > maxPrice) return window.rpgAlert(`Harga terlalu MAHAL! Maksimal untuk ${amount} Coin adalah ${maxPrice} Gold.`, "Ditolak Sistem");[cite: 1]

    try {
        await runTransaction(db, async (ts) => {
            const userRef = doc(db, "users", window.currentUserUid);
            // Bikin Referensi Dokumen Baru di dalam Transaksi (Pengganti addDoc)
            const newMarketRef = doc(collection(db, "coin_market"));

            const dataSnap = await ts.get(userRef);
            const data = dataSnap.data();

            if ((data.auctionBalanceCoin || 0) < amount) throw "Saldo Koin Bursa Anda tidak cukup! Lakukan Deposit Koin terlebih dahulu.";[cite: 1]

            // 1. Potong saldo koin bursa pemain[cite: 1]
            ts.update(userRef, { auctionBalanceCoin: data.auctionBalanceCoin - amount });[cite: 1]

            // 2. Masukkan barang ke Market di dalam transaksi yang SAMA (Anti Hilang Koin)
            ts.set(newMarketRef, {
                sellerUid: window.currentUserUid, [cite: 1]
                sellerName: window.playerUsername, [cite: 1]
                amount: amount, [cite: 1]
                price: price, [cite: 1]
                timestamp: Date.now()[cite: 1]
            });
        });

        document.getElementById('cm-sell-amount').value = "";[cite: 1]
        document.getElementById('cm-sell-price').value = "";[cite: 1]
        window.rpgAlert("Koin berhasil dilelang!", "Sukses");[cite: 1]

    } catch (err) { window.rpgAlert(err, "Gagal Pasang Lelang"); } [cite: 1]
};

// --- BELI KOIN ---
window.cmBuyCoin = async function (marketId, sellerUid, amount, price) {
    [cite: 1]
    if (sellerUid === window.currentUserUid) return window.rpgAlert("Anda tidak bisa membeli lelang Anda sendiri!");[cite: 1]

    if (!await window.rpgConfirm(`Beli ${amount} Coin seharga ${price} Gold? (Pastikan saldo Bursa Gold cukup)`, "Beli Coin")) return;[cite: 1]

    try {
        await runTransaction(db, async (ts) => {
            // Siapkan alamat dokumen
            const buyerRef = doc(db, "users", window.currentUserUid);[cite: 1]
            const sellerRef = doc(db, "users", sellerUid);[cite: 1]
            const marketRef = doc(db, "coin_market", marketId);[cite: 1]

            // ===================================
            // TAHAP 1: SEMUA PROSES BACA (READ)
            // ===================================
            const buyerSnap = await ts.get(buyerRef);
            const sellerSnap = await ts.get(sellerRef);
            const marketSnap = await ts.get(marketRef);

            const buyerData = buyerSnap.data();
            const sellerData = sellerSnap.exists() ? sellerSnap.data() : null;

            if (!marketSnap.exists()) throw "Barang sudah terjual atau ditarik!";[cite: 1]
            if ((buyerData.auctionBalanceGold || 0) < price) throw "Saldo Gold Bursa Anda tidak cukup! Deposit Gold dulu.";[cite: 1]

            // ===================================
            // TAHAP 2: SEMUA PROSES TULIS (WRITE)
            // ===================================
            // 1. Kurangi Gold pembeli, tambah Koin pembeli[cite: 1]
            ts.update(buyerRef, {
                auctionBalanceGold: buyerData.auctionBalanceGold - price, [cite: 1]
                auctionBalanceCoin: (buyerData.auctionBalanceCoin || 0) + amount[cite: 1]
            });

            // 2. Tambah Gold penjual (Bayar penjual)[cite: 1]
            if (sellerData) {
                ts.update(sellerRef, { auctionBalanceGold: (sellerData.auctionBalanceGold || 0) + price });[cite: 1]
            }

            // 3. Hapus lelang dari market[cite: 1]
            ts.delete(marketRef);[cite: 1]
        });

        window.rpgAlert(`Pembelian sukses! ${amount} Coin masuk ke Saldo Bursa Anda.`);[cite: 1]
    } catch (err) { window.rpgAlert(err, "Transaksi Gagal"); } [cite: 1]
};

// --- BATALKAN LELANG (TARIK BARANG) ---
window.cmCancelSell = async function (marketId) {
    if (!await window.rpgConfirm("Apakah Anda yakin ingin menarik lelang ini? Koin akan kembali ke Saldo Bursa Anda.", "Tarik Lelang")) return;

    try {
        await runTransaction(db, async (ts) => {
            const marketRef = doc(db, "coin_market", marketId);
            const userRef = doc(db, "users", window.currentUserUid);

            // ===================================
            // TAHAP 1: SEMUA PROSES BACA (READ)
            // ===================================
            const marketSnap = await ts.get(marketRef);
            if (!marketSnap.exists()) throw "Barang ini sudah tidak ada di bursa (mungkin sudah terjual).";

            const marketData = marketSnap.data();

            // Validasi: Pastikan yang membatalkan adalah benar-benar si penjual
            if (marketData.sellerUid !== window.currentUserUid) throw "Anda bukan pemilik lelang ini!";

            const userSnap = await ts.get(userRef);
            const userData = userSnap.data();

            // ===================================
            // TAHAP 2: SEMUA PROSES TULIS (WRITE)
            // ===================================
            // 1. Kembalikan Koin ke Saldo Bursa penjual
            ts.update(userRef, {
                auctionBalanceCoin: (userData.auctionBalanceCoin || 0) + marketData.amount
            });

            // 2. Hapus barang dari market
            ts.delete(marketRef);
        });

        window.rpgAlert("Lelang berhasil ditarik! Koin Anda telah kembali ke Saldo Bursa.", "Sukses");

    } catch (err) {
        window.rpgAlert(err, "Gagal Menarik Lelang");
    }
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