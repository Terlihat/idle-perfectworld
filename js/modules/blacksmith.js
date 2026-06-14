import { doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { REFINE_RATES } from '../data/items.js';

export async function refineEquipment(db, uid, slotType, stoneType) {
    if (!uid) return;
    const userRef = doc(db, "users", uid);

    try {
        await runTransaction(db, async (ts) => {
            const data = (await ts.get(userRef)).data();
            let inv = data.inventory || {};
            let eq = data.equipment || {};
            let gold = data.gold || 0;

            if (!eq[slotType] || !eq[slotType].name) throw "Anda tidak mengenakan perlengkapan di slot ini!";
            if (!inv[stoneType] || inv[stoneType] < 1) throw `Anda memerlukan 1x 💎 ${stoneType} di dalam tas!`;
            if (gold < 1000) throw "Emas tidak cukup! Membutuhkan 1,000 Gold.";

            let currentRefine = eq[slotType].refine || 0;
            if (currentRefine >= 10) throw "Tingkat tempa perlengkapan ini sudah maksimal (+10)!";

            inv[stoneType] -= 1;
            if (inv[stoneType] === 0) delete inv[stoneType];
            gold -= 1000;

            const indexRate = currentRefine > 9 ? 9 : currentRefine;
            const successRate = REFINE_RATES[stoneType][indexRate]; 

            const roll = Math.random();
            if (roll <= successRate) {
                eq[slotType].refine = currentRefine + 1;
                alert(`🎉 LUAR BIASA! Tempa Sukses! [${eq[slotType].name}] meningkat ke (+${eq[slotType].refine})`);
            } else {
                if (stoneType === 'Underworld Stone') {
                    eq[slotType].refine = Math.max(0, currentRefine - 1);
                    alert(`💥 GAGAL! Efek Underworld: Tingkat tempa turun -1 menjadi (+${eq[slotType].refine})`);
                } else if (stoneType === 'Universal Stone') {
                    alert(`❌ GAGAL! Efek Universal: Tingkat tempa dipertahankan di (+${eq[slotType].refine})`);
                } else {
                    eq[slotType].refine = 0;
                    alert(`💔 HANCUR! Tempa Gagal total. Tingkat tempa kembali ke (+0)`);
                }
            }
            ts.update(userRef, { inventory: inv, equipment: eq, gold: gold });
        });
    } catch (err) { alert(err); }
}