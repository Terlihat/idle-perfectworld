import { doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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

// SIMPAN BARANG KE BANK (DENGAN BATAS 16 SLOT)
export async function depositItem(db, uid, itemName, qty) {
    if (!uid) return;
    const userRef = doc(db, "users", uid);
    try {
        await runTransaction(db, async (ts) => {
            const data = (await ts.get(userRef)).data();
            let inv = data.inventory || {};
            let bankInv = data.bankInventory || {};

            // Validasi jumlah di tas
            if (!inv[itemName] || inv[itemName] < qty) {
                throw `❌ Anda tidak memiliki ${qty}x [${itemName}] di tas.`;
            }

            // Validasi Slot Bank (4x4 = 16 Slot)
            // Jika item belum ada di bank, dia memakan slot baru
            const isNewItem = !bankInv[itemName];
            const currentBankSlots = Object.keys(bankInv).length;
            if (isNewItem && currentBankSlots >= 16) {
                throw "💥 Gagal! Brankas penuh. Slot Bank maksimal 16 jenis item.";
            }

            // Pindahkan jumlah item
            inv[itemName] -= qty;
            if (inv[itemName] <= 0) delete inv[itemName];
            
            bankInv[itemName] = (bankInv[itemName] || 0) + qty;

            ts.update(userRef, { inventory: inv, bankInventory: bankInv });
        });
    } catch (err) {
        if (typeof window.rpgAlert === "function") window.rpgAlert(err, "Gagal Menyimpan");
        else alert(err);
    }
}

// TARIK BARANG DARI BANK
export async function withdrawItem(db, uid, itemName, qty) {
    if (!uid) return;
    const userRef = doc(db, "users", uid);
    try {
        await runTransaction(db, async (ts) => {
            const data = (await ts.get(userRef)).data();
            let inv = data.inventory || {};
            let bankInv = data.bankInventory || {};

            // Validasi jumlah di bank
            if (!bankInv[itemName] || bankInv[itemName] < qty) {
                throw `❌ Anda tidak memiliki ${qty}x [${itemName}] di brankas.`;
            }

            // Pindahkan jumlah item
            bankInv[itemName] -= qty;
            if (bankInv[itemName] <= 0) delete bankInv[itemName];
            
            inv[itemName] = (inv[itemName] || 0) + qty;

            ts.update(userRef, { inventory: inv, bankInventory: bankInv });
        });
    } catch (err) {
        if (typeof window.rpgAlert === "function") window.rpgAlert(err, "Gagal Menarik");
        else alert(err);
    }
}