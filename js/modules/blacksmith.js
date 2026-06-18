import { doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { ITEM_DB, REFINE_RATES } from '../data/items.js'; // Pastikan path ini sesuai dengan file Anda

export async function executeRefineAction(db, uid, equipName, catalystName) {
    if (!uid) return;
    const userRef = doc(db, "users", uid);

    try {
        await runTransaction(db, async (ts) => {
            const data = (await ts.get(userRef)).data();
            let inv = data.inventory || {};
            let eq = data.equipment || {};
            let gold = data.gold || 0;

            const itemData = ITEM_DB[equipName];
            if (!itemData) throw "Data perlengkapan tidak valid di sistem.";

            // Cek posisi Equip (Harus terpakai)
            let isEquipped = false;
            let currentRefine = 0;
            let slotType = "";

            if (eq.weapon?.name === equipName) { isEquipped = true; currentRefine = eq.weapon.refine || 0; slotType = "weapon"; }
            else if (eq.armor?.name === equipName) { isEquipped = true; currentRefine = eq.armor.refine || 0; slotType = "armor"; }
            else if (eq.accessory?.name === equipName) { isEquipped = true; currentRefine = eq.accessory.refine || 0; slotType = "accessory"; }

            if (!isEquipped && (!inv[equipName] || inv[equipName] < 1)) {
                throw `Anda tidak memiliki [${equipName}] di tas atau sedang dipakai.`;
            }

            if (!isEquipped) {
                throw "❌ Aturan Sistem: Anda harus MEMAKAI (Equip) perlengkapan tersebut terlebih dahulu sebelum menempanya di Tungku!";
            }

            if (currentRefine >= 10) throw "Tingkat tempa perlengkapan ini sudah maksimal (+10)!";

            // KALKULASI PERFECT WORLD: Mirage Stone (Senjata butuh 2, lainnya 1)
            const mirageCost = (itemData.type === 'weapon') ? 2 : 1;
            
            if (gold < 1000) throw "Emas tidak cukup! Membutuhkan 1,000 Gold.";
            if ((inv["Mirage Stone"] || 0) < mirageCost) throw `Membutuhkan ${mirageCost}x Mirage Stone untuk menempa ${itemData.type}!`;

            if (catalystName !== "Tanpa Batu Tambahan" && catalystName !== "Mirage Stone") {
                if ((inv[catalystName] || 0) < 1) throw `Anda memerlukan 1x 💎 ${catalystName} di dalam tas!`;
            }

            // TARIK BIAYA
            gold -= 1000;
            inv["Mirage Stone"] -= mirageCost;
            if (inv["Mirage Stone"] <= 0) delete inv["Mirage Stone"];

            if (catalystName !== "Tanpa Batu Tambahan" && catalystName !== "Mirage Stone") {
                inv[catalystName] -= 1;
                if (inv[catalystName] <= 0) delete inv[catalystName];
            }

            // PROBABILITAS BERDASARKAN REFINE_RATES MILIK ANDA
            const rateKey = (catalystName === "Tanpa Batu Tambahan") ? "Mirage Stone" : catalystName;
            const indexRate = currentRefine > 9 ? 9 : currentRefine;
            const successRate = REFINE_RATES[rateKey][indexRate]; 

            const roll = Math.random();
            if (roll <= successRate) {
                eq[slotType].refine = currentRefine + 1;
                alert(`🎉 LUAR BIASA! Tempa Sukses! [${eq[slotType].name}] meningkat ke (+${eq[slotType].refine})`);
            } else {
                if (rateKey === 'Underworld Stone') {
                    eq[slotType].refine = Math.max(0, currentRefine - 1);
                    alert(`💥 GAGAL! Efek Underworld: Tingkat tempa turun -1 menjadi (+${eq[slotType].refine})`);
                } else if (rateKey === 'Universal Stone') {
                    alert(`❌ GAGAL! Efek Universal: Tingkat tempa dipertahankan di (+${eq[slotType].refine})`);
                } else {
                    eq[slotType].refine = 0;
                    alert(`💔 HANCUR! Tempa Gagal total! Tingkat tempa kembali ke (+0)`);
                }
            }

            ts.update(userRef, { gold: gold, inventory: inv, equipment: eq });
        });
    } catch (err) { alert(err); }
}