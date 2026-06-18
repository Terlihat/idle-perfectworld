import { doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { ITEM_DB, REFINE_RATES } from '../data/items.js';

export async function executeRefineAction(db, uid, equipName, catalystName) {
    if (!uid) return;
    const userRef = doc(db, "users", uid);

    try {
        await runTransaction(db, async (ts) => {
            const data = (await ts.get(userRef)).data();
            let inv = data.inventory || {};
            let gold = data.gold || 0;

            // 1. Ekstrak Nama dan Level Plus (Contoh: "Pedang Besi [+2]")
            let baseName = equipName.replace(/\s\[\+\d+\]$/, '');
            let currentRefine = 0;
            const match = equipName.match(/\[\+(\d+)\]$/);
            if (match) currentRefine = parseInt(match[1]);

            const itemData = ITEM_DB[baseName];
            if (!itemData) throw "Data perlengkapan tidak valid di sistem.";

            // 2. Cek Ketersediaan Tas
            if (!inv[equipName] || inv[equipName] < 1) {
                throw `Anda tidak memiliki [${equipName}] di tas! (Harap lepas/Unequip terlebih dahulu jika sedang dipakai).`;
            }
            if (currentRefine >= 10) throw "Tingkat tempa perlengkapan ini sudah maksimal (+10)!";

            // 3. Tarik Biaya Mirage & Gold
            const mirageCost = (itemData.type === 'weapon') ? 2 : 1;
            if (gold < 1000) throw "Emas tidak cukup! Membutuhkan 1,000 Gold.";
            if ((inv["Mirage Stone"] || 0) < mirageCost) throw `Membutuhkan ${mirageCost}x Mirage Stone!`;

            if (catalystName !== "Tanpa Batu Tambahan") {
                if ((inv[catalystName] || 0) < 1) throw `Anda memerlukan 1x 💎 ${catalystName} di dalam tas!`;
                inv[catalystName] -= 1;
                if (inv[catalystName] <= 0) delete inv[catalystName];
            }

            gold -= 1000;
            inv["Mirage Stone"] -= mirageCost;
            if (inv["Mirage Stone"] <= 0) delete inv["Mirage Stone"];

            // 4. Tarik Equip dari Tas (Untuk ditempa)
            inv[equipName] -= 1; 
            if (inv[equipName] <= 0) delete inv[equipName];

            // 5. Gulir Peluang (Gacha)
            const rateKey = (catalystName === "Tanpa Batu Tambahan") ? "Mirage Stone" : catalystName;
            const indexRate = currentRefine > 9 ? 9 : currentRefine;
            const successRate = REFINE_RATES[rateKey][indexRate]; 

            let newRefine = currentRefine;
            const roll = Math.random();
            
            if (roll <= successRate) {
                newRefine += 1;
                alert(`🎉 LUAR BIASA! Tempa Sukses! [${baseName}] meningkat ke (+${newRefine})`);
            } else {
                if (rateKey === 'Underworld Stone') {
                    newRefine = Math.max(0, currentRefine - 1);
                    alert(`💥 GAGAL! Efek Underworld: Tingkat tempa turun menjadi (+${newRefine})`);
                } else if (rateKey === 'Universal Stone') {
                    alert(`❌ GAGAL! Efek Universal: Tingkat tempa dipertahankan di (+${newRefine})`);
                } else {
                    newRefine = 0;
                    alert(`💔 HANCUR! Tempa Gagal total! Tingkat tempa kembali ke (+0)`);
                }
            }

            // 6. Masukkan Hasil ke Tas (Akan otomatis membuat tumpukan baru)
            let newItemName = newRefine > 0 ? `${baseName} [+${newRefine}]` : baseName;
            inv[newItemName] = (inv[newItemName] || 0) + 1;

            ts.update(userRef, { gold: gold, inventory: inv });
            
            // Mengosongkan Slot Tungku Secara Otomatis
            document.getElementById('bs-icon-equip').innerText = "🛡️";
            document.getElementById('bs-text-equip').innerText = "Pilih Equip";
            document.getElementById('bs-text-equip').style.color = "#aaa";
        });
    } catch (err) { alert(err); }
}