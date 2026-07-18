/* ===================================================
   MODUL PASAR LELANG (AUCTION & BIDDING)
   Versi Code: 2.0.0
   =================================================== */
import { collection, doc, runTransaction, query, orderBy, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// 1. LISTENER PASAR
export function listenToAuction(db, callbackRender) {
    const q = query(collection(db, "market"), orderBy("timestamp", "desc"));
    return onSnapshot(q, (snapshot) => {
        let items = [];
        snapshot.forEach((docSnap) => { items.push({ id: docSnap.id, ...docSnap.data() }); });
        callbackRender(items);
    });
}

// 2. JUAL BARANG (Set Waktu 24 Jam)
export async function listAuctionItem(db, uid, itemName, price, sellerName) {
    if (!uid) return;
    const userRef = doc(db, "users", uid);
    const marketRef = doc(collection(db, "market"));

    try {
        await runTransaction(db, async (ts) => {
            // CEK STATUS GLOBAL KILL SWITCH
            const buffSnap = await ts.get(doc(db, "events", "serverBuffs"));
            if (buffSnap.exists() && buffSnap.data().marketFrozen) {
                throw "🚨 PASAR SEDANG DIBEKUKAN OLEH ADMIN! Transaksi dihentikan sementara untuk maintenance keamanan.";
            }

            const data = (await ts.get(userRef)).data();
            let inv = data.inventory || {};
            if (!inv[itemName] || inv[itemName] < 1) throw "Item tidak ditemukan di tas!";
            if (price <= 0) throw "Harga tidak valid!";

            inv[itemName] -= 1;
            if (inv[itemName] === 0) delete inv[itemName];

            const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 Hari dari sekarang

            ts.set(marketRef, {
                sellerId: uid, sellerName: sellerName, itemName: itemName, buyoutPrice: price,
                highestBid: null, timestamp: serverTimestamp(), expiresAt: expiresAt
            });
            ts.update(userRef, { inventory: inv });
        });
        alert(`⚖️ Berhasil mendaftarkan ${itemName}! Batas waktu lelang: 7 Hari.`);
    } catch (err) { alert(err); }
}

// 3. TAWAR BARANG (BIDDING & REFUND PREVIOUS BIDDER)
export async function placeBid(db, buyerUid, buyerName, auctionId, bidAmount) {
    const buyerRef = doc(db, "users", buyerUid);
    const auctionRef = doc(db, "market", auctionId);

    try {
        await runTransaction(db, async (ts) => {
            // CEK STATUS GLOBAL KILL SWITCH
            const buffSnap = await ts.get(doc(db, "events", "serverBuffs"));
            if (buffSnap.exists() && buffSnap.data().marketFrozen) {
                throw "🚨 PASAR SEDANG DIBEKUKAN OLEH ADMIN! Transaksi dihentikan sementara untuk maintenance keamanan.";
            }

            const auctionSnap = await ts.get(auctionRef);
            if (!auctionSnap.exists()) throw "Lelang sudah ditarik atau selesai!";
            const auction = auctionSnap.data();

            if (auction.expiresAt < Date.now()) throw "Lelang sudah kadaluarsa!";
            if (bidAmount >= auction.buyoutPrice) throw "Tawaran Anda melebihi atau sama dengan Harga Langsung Beli. Silakan Beli Langsung.";
            if (auction.highestBid && bidAmount <= auction.highestBid.amount) throw "Tawaran harus lebih tinggi dari penawar sebelumnya!";

            const buyerSnap = await ts.get(buyerRef);
            const buyerData = buyerSnap.data();
            if ((buyerData.gold || 0) < bidAmount) throw "Gold Anda tidak cukup untuk tawaran ini!";

            let prevBuyerRef = null;
            let prevBuyerData = null;
            if (auction.highestBid && auction.highestBid.buyerId !== buyerUid) {
                prevBuyerRef = doc(db, "users", auction.highestBid.buyerId);
                const prevSnap = await ts.get(prevBuyerRef);
                if (prevSnap.exists()) prevBuyerData = prevSnap.data();
            }

            // Tahan Gold penawar baru
            let newGold = buyerData.gold - bidAmount;
            if (auction.highestBid && auction.highestBid.buyerId === buyerUid) {
                // Jika pemain yang sama menaikkan bid-nya, potong selisihnya saja
                newGold = buyerData.gold - (bidAmount - auction.highestBid.amount);
            }
            ts.update(buyerRef, { gold: newGold });

            // Kembalikan (Refund) Gold penawar lama
            if (prevBuyerRef && prevBuyerData) {
                ts.update(prevBuyerRef, { gold: (prevBuyerData.gold || 0) + auction.highestBid.amount });
            }

            ts.update(auctionRef, { highestBid: { buyerId: buyerUid, buyerName: buyerName, amount: bidAmount } });
        });
        alert("💰 Tawaran berhasil diajukan!");
    } catch (err) { alert(err); }
}

// 4. TERIMA TAWARAN (ACCEPT BID)
export async function acceptBid(db, sellerUid, auctionId) {
    const sellerRef = doc(db, "users", sellerUid);
    const auctionRef = doc(db, "market", auctionId);

    try {
        await runTransaction(db, async (ts) => {
            // CEK STATUS GLOBAL KILL SWITCH
            const buffSnap = await ts.get(doc(db, "events", "serverBuffs"));
            if (buffSnap.exists() && buffSnap.data().marketFrozen) {
                throw "🚨 PASAR SEDANG DIBEKUKAN OLEH ADMIN! Transaksi dihentikan sementara untuk maintenance keamanan.";
            }

            const auctionSnap = await ts.get(auctionRef);
            if (!auctionSnap.exists()) throw "Lelang tidak ditemukan!";
            const auction = auctionSnap.data();

            if (!auction.highestBid) throw "Tidak ada tawaran untuk diterima!";
            if (auction.sellerId !== sellerUid) throw "Ini bukan barang Anda!";

            const buyerRef = doc(db, "users", auction.highestBid.buyerId);
            const buyerSnap = await ts.get(buyerRef);
            if (!buyerSnap.exists()) throw "Pembeli tidak ditemukan!";

            const sellerSnap = await ts.get(sellerRef);

            // Transfer Item ke Pembeli
            let buyerInv = buyerSnap.data().inventory || {};
            buyerInv[auction.itemName] = (buyerInv[auction.itemName] || 0) + 1;
            ts.update(buyerRef, { inventory: buyerInv });

            // Transfer Uang ke Penjual
            ts.update(sellerRef, { gold: (sellerSnap.data().gold || 0) + auction.highestBid.amount });
            ts.delete(auctionRef);
        });
        alert("🤝 Transaksi Selesai! Uang telah masuk ke tas Anda.");
    } catch (err) { alert(err); }
}

// 5. TOLAK TAWARAN (REJECT BID & REFUND)
export async function rejectBid(db, sellerUid, auctionId) {
    const auctionRef = doc(db, "market", auctionId);

    try {
        await runTransaction(db, async (ts) => {
            // CEK STATUS GLOBAL KILL SWITCH
            const buffSnap = await ts.get(doc(db, "events", "serverBuffs"));
            if (buffSnap.exists() && buffSnap.data().marketFrozen) {
                throw "🚨 PASAR SEDANG DIBEKUKAN OLEH ADMIN! Transaksi dihentikan sementara untuk maintenance keamanan.";
            }

            const auctionSnap = await ts.get(auctionRef);
            if (!auctionSnap.exists()) throw "Lelang tidak ditemukan!";
            const auction = auctionSnap.data();

            if (auction.sellerId !== sellerUid) throw "Akses Ditolak!";
            if (!auction.highestBid) throw "Tidak ada tawaran!";

            const buyerRef = doc(db, "users", auction.highestBid.buyerId);
            const buyerSnap = await ts.get(buyerRef);

            // Kembalikan Uang ke Pembeli yang ditolak
            if (buyerSnap.exists()) {
                ts.update(buyerRef, { gold: (buyerSnap.data().gold || 0) + auction.highestBid.amount });
            }
            ts.update(auctionRef, { highestBid: null });
        });
        alert("Tawaran ditolak! Uang telah dikembalikan ke penawar.");
    } catch (err) { alert(err); }
}

// 6. BELI LANGSUNG (BUYOUT & REFUND JIKA ADA BID)
export async function buyAuctionItem(db, buyerUid, auctionId, itemName, price, sellerId) {
    if (!buyerUid || buyerUid === sellerId) return alert("Anda tidak bisa membeli barang Anda sendiri!");
    const buyerRef = doc(db, "users", buyerUid);
    const sellerRef = doc(db, "users", sellerId);
    const auctionRef = doc(db, "market", auctionId);

    try {
        await runTransaction(db, async (ts) => {
            // CEK STATUS GLOBAL KILL SWITCH
            const buffSnap = await ts.get(doc(db, "events", "serverBuffs"));
            if (buffSnap.exists() && buffSnap.data().marketFrozen) {
                throw "🚨 PASAR SEDANG DIBEKUKAN OLEH ADMIN! Transaksi dihentikan sementara untuk maintenance keamanan.";
            }

            const auctionSnap = await ts.get(auctionRef);
            if (!auctionSnap.exists()) throw "Barang ini sudah terjual atau ditarik!";
            const auction = auctionSnap.data();

            const buyerSnap = await ts.get(buyerRef);
            const sellerSnap = await ts.get(sellerRef);

            let costToBuyer = price;
            let isPrevBidder = false;
            let prevBuyerRef = null;
            let prevBuyerData = null;

            // Jika ada bid, harus diselesaikan refund-nya
            if (auction.highestBid) {
                if (auction.highestBid.buyerId === buyerUid) {
                    costToBuyer = price - auction.highestBid.amount; // Bayar sisa kekurangannya saja
                    isPrevBidder = true;
                } else {
                    prevBuyerRef = doc(db, "users", auction.highestBid.buyerId);
                    const prevSnap = await ts.get(prevBuyerRef);
                    if (prevSnap.exists()) prevBuyerData = prevSnap.data();
                }
            }

            if ((buyerSnap.data().gold || 0) < costToBuyer) throw "Emas Anda tidak mencukupi untuk Beli Langsung!";

            // Proses Transaksi
            let buyerInv = buyerSnap.data().inventory || {};
            buyerInv[itemName] = (buyerInv[itemName] || 0) + 1;
            ts.update(buyerRef, { gold: (buyerSnap.data().gold || 0) - costToBuyer, inventory: buyerInv });

            if (sellerSnap.exists()) ts.update(sellerRef, { gold: (sellerSnap.data().gold || 0) + price });

            if (prevBuyerRef && prevBuyerData && !isPrevBidder) {
                ts.update(prevBuyerRef, { gold: (prevBuyerData.gold || 0) + auction.highestBid.amount });
            }

            ts.delete(auctionRef);
        });
        alert(`🛍️ Berhasil Beli Langsung ${itemName}!`);
    } catch (err) { alert(err); }
}

// 7. TARIK BARANG / EXPIRED CLAIM (CANCEL AUCTION)
export async function cancelAuction(db, sellerUid, auctionId) {
    const sellerRef = doc(db, "users", sellerUid);
    const auctionRef = doc(db, "market", auctionId);

    try {
        await runTransaction(db, async (ts) => {
            // CEK STATUS GLOBAL KILL SWITCH
            const buffSnap = await ts.get(doc(db, "events", "serverBuffs"));
            if (buffSnap.exists() && buffSnap.data().marketFrozen) {
                throw "🚨 PASAR SEDANG DIBEKUKAN OLEH ADMIN! Transaksi dihentikan sementara untuk maintenance keamanan.";
            }

            const auctionSnap = await ts.get(auctionRef);
            if (!auctionSnap.exists()) throw "Lelang tidak ditemukan!";
            const auction = auctionSnap.data();
            if (auction.sellerId !== sellerUid) throw "Ini bukan barang Anda!";

            // Refund jika ada orang yang sedang nge-bid
            if (auction.highestBid) {
                const buyerRef = doc(db, "users", auction.highestBid.buyerId);
                const buyerSnap = await ts.get(buyerRef);
                if (buyerSnap.exists()) ts.update(buyerRef, { gold: (buyerSnap.data().gold || 0) + auction.highestBid.amount });
            }

            // Kembalikan barang ke tas penjual
            const sellerSnap = await ts.get(sellerRef);
            let inv = sellerSnap.data().inventory || {};
            inv[auction.itemName] = (inv[auction.itemName] || 0) + 1;

            ts.update(sellerRef, { inventory: inv });
            ts.delete(auctionRef);
        });
        alert("Barang berhasil ditarik dan dikembalikan ke dalam Tas Anda.");
    } catch (err) { alert(err); }
}

// 8. KEMBALIKAN BARANG KADALUARSA KE KOTAK SURAT
export async function returnExpiredToMail(db, auctionId) {
    const auctionRef = doc(db, "market", auctionId);

    try {
        await runTransaction(db, async (ts) => {
            const auctionSnap = await ts.get(auctionRef);
            if (!auctionSnap.exists()) return;
            const auction = auctionSnap.data();

            // Cek apakah benar-benar sudah kadaluarsa
            if (auction.expiresAt >= Date.now()) return;

            // 1. Refund uang ke penawar terakhir (jika ada yang menawar tapi lelang keburu habis)
            if (auction.highestBid) {
                const buyerRef = doc(db, "users", auction.highestBid.buyerId);
                const buyerSnap = await ts.get(buyerRef);
                if (buyerSnap.exists()) {
                    ts.update(buyerRef, { gold: (buyerSnap.data().gold || 0) + auction.highestBid.amount });
                }
            }

            // 2. Buat Surat untuk Penjual (Berisi item miliknya yang gagal terjual)
            const mailRef = doc(collection(db, "mails")); // Asumsi collection kotak surat Anda bernama "mails"
            ts.set(mailRef, {
                receiverId: auction.sellerId,
                title: "Lelang Kadaluarsa",
                content: `Waktu lelang 7 Hari untuk [${auction.itemName}] telah berakhir.\nBarang Anda dikembalikan.`,
                attachments: { itemName: auction.itemName, qty: 1, gold: 0, coin: 0 },
                isRead: false,
                isClaimed: false,
                date: new Date().toLocaleDateString('id-ID'),
                timestamp: serverTimestamp()
            });

            // 3. Hapus data dari Pasar Lelang
            ts.delete(auctionRef);
        });
    } catch (err) {
        console.error("Gagal mengembalikan barang kadaluarsa: ", err);
    }
}