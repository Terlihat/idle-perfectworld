/**
 * Menyimpan Item dari Tas ke Bank (Maksimal Grid 4x4 = 16 Slot Unik)
 */
export async function depositItem(db, uid, itemName) {
    if (!uid) return;
    const userRef = doc(db, "users", uid);
    try {
        await runTransaction(db, async (ts) => {
            const data = (await ts.get(userRef)).data();
            let inv = data.inventory || {};
            let bankInv = data.bankInventory || {};

            if (!inv[itemName] || inv[itemName] <= 0) throw "Item tidak ditemukan di tas Anda!";

            // FIX BUG: Proteksi kapasitas Grid diubah menjadi 16 Slot Unik
            const currentBankSlots = Object.keys(bankInv).length;
            if (!bankInv[itemName] && currentBankSlots >= 16) {
                throw "💥 Gagal! Brankas penuh. Slot Bank Anda telah mencapai batas maksimal grid 4x4 (16 Slot).";
            }

            // Kurangi jumlah item dari tas pemain
            inv[itemName] -= 1;
            if (inv[itemName] === 0) delete inv[itemName];

            // Tambahkan item ke dalam penyimpanan Bank
            bankInv[itemName] = (bankInv[itemName] || 0) + 1;

            ts.update(userRef, { inventory: inv, bankInventory: bankInv });
        });
    } catch (err) {
        alert(err);
    }
}