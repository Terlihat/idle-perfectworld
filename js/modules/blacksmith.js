import { doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { ITEM_DB, REFINE_RATES } from '../data/items.js';

// --- DAFTAR KEKUATAN MAKSIMAL DRAGON ORB ---
const ORB_LEVELS = {
    "Dragon Orb (1 Star)": 1,
    "Dragon Orb (2 Star)": 2,
    "Dragon Orb (3 Star)": 3,
    "Dragon Orb (4 Star)": 4,
    "Dragon Orb (5 Star)": 5,
    "Dragon Orb (6 Star)": 6,
    "Dragon Orb (7 Star)": 7,
    "Dragon Orb (8 Star)": 8,
    "Dragon Orb (9 Star)": 9,
    "Dragon Orb Ocean": 10,
    "Dragon Orb Mirage": 11,
    "Dragon Orb Flame": 12
};

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

            let targetPlus = newRefine + 1; // Level yang dituju

            const itemData = ITEM_DB[baseName];
            if (!itemData) throw "Data perlengkapan tidak valid di sistem.";
            if (!inv[equipName] || inv[equipName] < 1) throw `[ERROR] [${equipName}] tidak ada di tas (Harap lepas dari badan).`;
            
            // BATAS MAKSIMAL DITAIKKAN MENJADI +12
            if (newRefine >= 12) throw "[INFO] Perlengkapan ini sudah mencapai batas maksimal (+12)!";

            const mirageCost = (itemData.type === 'weapon') ? 2 : 1;
            if (gold < 1000) throw "[ERROR] Gold tidak cukup! Butuh 1,000 Gold.";
            if ((inv["Mirage Stone"] || 0) < mirageCost) throw `[ERROR] Butuh ${mirageCost}x Mirage Stone!`;

            // DETEKSI PENGGUNAAN DRAGON ORB & VALIDASI TINGKATNYA
            const isUsingOrb = ORB_LEVELS[catalystName] !== undefined;
            if (isUsingOrb) {
                if (targetPlus > ORB_LEVELS[catalystName]) {
                    throw `[ERROR] ${catalystName} hanya menjamin tempa hingga (+${ORB_LEVELS[catalystName]})! Tingkat senjata Anda terlalu tinggi.`;
                }
            }

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

            let isSuccess = false;

            if (isUsingOrb) {
                // JIKA PAKAI ORB: 100% SUKSES ABSOLUT
                isSuccess = true;
            } else {
                // JIKA PAKAI BATU BIASA/PREMIUM LAINNYA
                const rateKey = (catalystName === "Tanpa Batu Tambahan") ? "Mirage Stone" : catalystName;
                
                // Ambil persentase (Jika tempa ke +11 atau +12 tanpa rate terdaftar, jadikan 1% / 0.01)
                let successRate = 0.01;
                if (REFINE_RATES[rateKey] && REFINE_RATES[rateKey][newRefine] !== undefined) {
                    successRate = REFINE_RATES[rateKey][newRefine];
                }

                const roll = Math.random();
                isSuccess = (roll <= successRate);
            }
            
            if (isSuccess) {
                newRefine += 1;
                logMsg = `[SUKSES] ${baseName} berhasil naik ke (+${newRefine})!`;
                logColor = "#28a745"; // Hijau
            } else {
                if (catalystName === 'Underworld Stone') {
                    newRefine = Math.max(0, newRefine - 1);
                    logMsg = `[GAGAL] Efek Underworld: Tingkat turun menjadi (+${newRefine}).`;
                    logColor = "#ffcc00"; // Kuning
                } else if (catalystName === 'Universal Stone') {
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