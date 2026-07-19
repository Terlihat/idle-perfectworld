// ==========================================
// SISTEM DATABASE: KLAIM KODE REDEEM
// ==========================================
import { runTransaction, doc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export async function claimGiftCodeTransaction(db, uid, codeName) {
    let rewardMsg = [];

    await runTransaction(db, async (transaction) => {
        const codeRef = doc(db, "giftCodes", codeName);
        const userRef = doc(db, "users", uid);

        const codeSnap = await transaction.get(codeRef);
        if (!codeSnap.exists()) {
            throw new Error("❌ Kode tidak valid atau tidak ditemukan.");
        }

        const codeData = codeSnap.data();
        const claimedArray = codeData.claimedBy || [];

        // 1. Cek apakah pemain sudah pernah mengklaim kode ini
        if (claimedArray.includes(uid)) {
            throw new Error("⚠️ Anda sudah pernah menukarkan kode ini!");
        }

        // 2. Cek apakah kuota kode sudah habis
        if (claimedArray.length >= codeData.limit) {
            throw new Error("😭 Yah, kuota untuk kode ini sudah habis diklaim pemain lain.");
        }

        // 3. Ambil data pemain saat ini
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists()) throw new Error("Gagal membaca data pemain.");
        const userData = userSnap.data();

        // 4. Proses kalkulasi hadiah
        let newGold = (userData.gold || 0) + (codeData.gold || 0);
        let newCoin = (userData.coin || 0) + (codeData.coin || 0);
        let newInv = userData.inventory || {};

        if (codeData.gold > 0) rewardMsg.push(`💰 ${codeData.gold.toLocaleString()} Gold`);
        if (codeData.coin > 0) rewardMsg.push(`🪙 ${codeData.coin.toLocaleString()} Coin`);

        if (codeData.itemName && codeData.itemQty > 0) {
            newInv[codeData.itemName] = (newInv[codeData.itemName] || 0) + codeData.itemQty;
            rewardMsg.push(`📦 ${codeData.itemName} (x${codeData.itemQty})`);
        }

        // 5. Update array claimedBy di dokumen kode
        claimedArray.push(uid);
        transaction.update(codeRef, { claimedBy: claimedArray });

        // 6. Update data pemain (Berikan hadiahnya)
        transaction.update(userRef, {
            gold: newGold,
            coin: newCoin,
            inventory: newInv
        });
    });

    // Jika transaksi sukses tanpa terlempar (throw) error, kembalikan teks sukses ini:
    return `🎉 SELAMAT! Anda berhasil menukarkan kode.\n\nMendapatkan:\n${rewardMsg.join('\n')}`;
}