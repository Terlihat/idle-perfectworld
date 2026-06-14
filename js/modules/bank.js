import { doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

/**
 * Menyimpan Gold ke dalam Bank Pemain
 */
export async function depositGold(db, uid, amount) {
    if (!uid || amount <= 0) return;
    const userRef = doc(db, "users", uid);
    try {
        await runTransaction(db, async (ts) => {
            const data = (await ts.get(userRef)).data();
            const currentGold = data.gold || 0;
            const currentBankGold = data.bankGold || 0;

            if (currentGold < amount) throw "Emas di tas Anda tidak mencukupi!";

            ts.update(userRef, {
                gold: currentGold - amount,
                bankGold: currentBankGold + amount
            });
        });
        alert(`💰 Berhasil menyimpan ${amount.toLocaleString()} Gold ke Bank!`);
    } catch (err) {
        alert(err);
    }
}

/**
 * Menarik Gold dari Bank kembali ke Tas Pemain
 */
export async function withdrawGold(db, uid, amount) {
    if (!uid || amount <= 0) return;
    const userRef = doc(db, "users", uid);
    try {
        await runTransaction(db, async (ts) => {
            const data = (await ts.get(userRef)).data();
            const currentGold = data.gold || 0;
            const currentBankGold = data.bankGold || 0;

            if (currentBankGold < amount) throw "Saldo Gold di Bank tidak mencukupi!";

            ts.update(userRef, {
                gold: currentGold + amount,
                bankGold: currentBankGold - amount
            });
        });
        alert(`💰 Berhasil menarik ${amount.toLocaleString()} Gold dari Bank!`);
    } catch (err) {
        alert(err);
    }
}

/**
 * Menyimpan Item dari Tas ke Bank (Maksimal Grid 4x8 = 32 Slot Unik)
 */
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

/**
 * Mengambil Item dari Bank dimasukkan kembali ke Tas Pemain
 */
export async function withdrawItem(db, uid, itemName) {
    if (!uid) return;
    const userRef = doc(db, "users", uid);
    try {
        await runTransaction(db, async (ts) => {
            const data = (await ts.get(userRef)).data();
            let inv = data.inventory || {};
            let bankInv = data.bankInventory || {};

            if (!bankInv[itemName] || bankInv[itemName] <= 0) throw "Item tidak ditemukan di dalam Bank!";

            // Pindahkan kembali ke tas utama
            inv[itemName] = (inv[itemName] || 0) + 1;

            // Kurangi saldo item di Bank
            bankInv[itemName] -= 1;
            if (bankInv[itemName] === 0) delete bankInv[itemName];

            ts.update(userRef, { inventory: inv, bankInventory: bankInv });
        });
    } catch (err) {
        alert(err);
    }
}