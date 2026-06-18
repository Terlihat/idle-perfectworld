import { doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { ITEM_DB, REFINE_RATES } from '../data/items.js';

export async function executeRefineAction(db, uid, equipName, catalystName) {
    if (!uid) return;
    const userRef = doc(db, "users", uid);

    try {
        let logMsg = "";
        let logColor = "";
        let finalItemName = equipName; // Akan berubah jika tempa berhasil/gagal
        let newRefine = 0;

        await runTransaction(db, async (ts) => {
            const data = (await ts.get(userRef)).data();
            let inv = data.inventory || {};
            let gold = data.gold || 0;

            let baseName = equipName.replace(/\s\[\+\d+\]$/, '');
            const match = equipName.match(/\[\+(\d+)\]$/);
            if (match) newRefine = parseInt(match[1]);

            const itemData = ITEM_DB[baseName];
            if (!itemData) throw "Data perlengkapan tidak valid di sistem.";
            if (!inv[equipName] || inv[equipName] < 1) throw `[ERROR] [${equipName}] tidak ada di tas (Harap lepas dari badan).`;
            if (newRefine >= 10) throw "[INFO] Perlengkapan ini sudah mencapai batas maksimal (+10)!";

            const mirageCost = (itemData.type === 'weapon') ? 2 : 1;
            if (gold < 1000) throw "[ERROR] Gold tidak cukup! Butuh 1,000 Gold.";
            if ((inv["Mirage Stone"] || 0) < mirageCost) throw `[ERROR] Butuh ${mirageCost}x Mirage Stone!`;

            if (catalystName !== "Tanpa Batu Tambahan") {
                if ((inv[catalystName] || 0) < 1) throw `[ERROR] Anda kehabisan ${catalystName}!`;
                inv[catalystName] -= 1;
                if (inv[catalystName] <= 0) delete inv[catalystName];
            }

            gold -= 1000;
            inv["Mirage Stone"] -= mirageCost;
            if (inv["Mirage Stone"] <= 0) delete inv["Mirage Stone"];

            // Tarik equip dari tas
            inv[equipName] -= 1; 
            if (inv[equipName] <= 0) delete inv[equipName];

            const rateKey = (catalystName === "Tanpa Batu Tambahan") ? "Mirage Stone" : catalystName;
            const indexRate = newRefine > 9 ? 9 : newRefine;
            const successRate = REFINE_RATES[rateKey][indexRate]; 

            const roll = Math.random();
            
            if (roll <= successRate) {
                newRefine += 1;
                logMsg = `[SUKSES] ${baseName} berhasil naik ke (+${newRefine})!`;
                logColor = "#28a745"; // Hijau
            } else {
                if (rateKey === 'Underworld Stone') {
                    newRefine = Math.max(0, newRefine - 1);
                    logMsg = `[GAGAL] Efek Underworld: Tingkat turun menjadi (+${newRefine}).`;
                    logColor = "#ffcc00"; // Kuning
                } else if (rateKey === 'Universal Stone') {
                    logMsg = `[GAGAL] Efek Universal: Tingkat tertahan di (+${newRefine}).`;
                    logColor = "#00d2ff"; // Biru
                } else {
                    newRefine = 0;
                    logMsg = `[HANCUR] Tempa Gagal! Tingkat kembali ke (+0).`;
                    logColor = "#dc3545"; // Merah
                }
            }

            // Kembalikan item (dengan status baru) ke tas, tapi UI tetap nyangkut di tungku
            finalItemName = newRefine > 0 ? `${baseName} [+${newRefine}]` : baseName;
            inv[finalItemName] = (inv[finalItemName] || 0) + 1;

            ts.update(userRef, { gold: gold, inventory: inv });
        });

        // TULIS KE LOG PANEL
        if (typeof window.addBlacksmithLog === "function") window.addBlacksmithLog(logMsg, logColor);

        // PERBARUI SLOT UI SECARA LANGSUNG (TANPA DIKOSONGKAN)
        window.bsSelectedEquip = finalItemName;
        const equipText = document.getElementById('bs-text-equip');
        if (equipText) {
            equipText.innerText = finalItemName;
            equipText.style.color = newRefine > 0 ? "#ff9800" : "#00d2ff";
        }

    } catch (err) { 
        if (typeof window.addBlacksmithLog === "function") window.addBlacksmithLog(err, "#dc3545"); 
    }
}