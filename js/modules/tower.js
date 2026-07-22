// File: js/modules/tower.js
import { db } from '../firebase-config.js';
import { doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// FITUR: Logika Pertarungan Menara
window.attackTower = async function () {
    const btn = document.getElementById('btn-attack-tower');
    if (!btn || btn.disabled) return;

    const pStats = window.currentPlayerStats;
    if (!pStats) return window.rpgAlert("Stat pemain belum dimuat!", "Error");

    btn.disabled = true;
    btn.innerText = "⚔️ Bertarung...";

    try {
        const userRef = doc(db, "users", window.currentUserUid);

        await runTransaction(db, async (ts) => {
            const userSnap = await ts.get(userRef);
            if (!userSnap.exists()) throw "Data pemain tidak ditemukan.";
            const d = userSnap.data();

            let floor = d.towerFloor || 1;
            let pCurrentHp = d.currentHp;

            if (pCurrentHp <= 0) throw "HP Anda habis! Pulihkan HP Anda sebelum menantang menara.";

            // 🔥 PERBAIKAN 1: Stat Musuh ditingkatkan agar lebih menantang
            let eHp = floor * 450 + 800;
            let eAtk = floor * 35 + 60;
            let eDef = floor * 15 + 20;

            // Kalkulasi
            let pDmg = Math.max(1, pStats.patk - eDef);
            let eDmg = Math.max(1, eAtk - pStats.def);

            let turnsToKillEnemy = Math.ceil(eHp / pDmg);
            let turnsToKillPlayer = Math.ceil(pCurrentHp / eDmg);

            if (turnsToKillPlayer <= turnsToKillEnemy) {
                ts.update(userRef, { currentHp: 0 });
                throw `Kekuatanmu belum cukup! Kamu dikalahkan oleh Penjaga Lantai ${floor} setelah bertarung selama ${turnsToKillPlayer} giliran. Tingkatkan statusmu!`;
            } else {
                let hpLost = turnsToKillEnemy * eDmg;
                let newHp = Math.max(1, pCurrentHp - hpLost);

                let rewardGold = Math.floor(floor * 120) + 200;
                let rewardExp = Math.floor(floor * 60) + 100;

                ts.update(userRef, {
                    currentHp: newHp,
                    gold: (d.gold || 0) + rewardGold,
                    exp: (d.exp || 0) + rewardExp,
                    towerFloor: floor + 1
                });

                window.rpgAlert(`🎉 MENANG! Anda mengalahkan Penjaga Lantai ${floor}.<br>HP Berkurang: <b>${hpLost}</b><br>Hadiah: <b>${rewardGold} Gold & ${rewardExp} EXP</b>`, "Lantai Selesai");
            }
        });
    } catch (err) {
        window.rpgAlert(err, "Hasil Pertarungan");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerText = "⚔️ TANTANG LANTAI INI";
        }
    }
};

export function renderTowerUI(userData) {
    const currentFloor = userData.towerFloor || 1;
    const elTowerFloor = document.getElementById('tower-current-floor');

    if (elTowerFloor) {
        elTowerFloor.innerText = currentFloor;
        const eName = document.getElementById('tower-enemy-name');
        const eHp = document.getElementById('tower-enemy-hp');
        const eAtk = document.getElementById('tower-enemy-atk');
        const eDef = document.getElementById('tower-enemy-def');

        if (eName) eName.innerText = "Penjaga Lantai " + currentFloor;
        if (eHp) eHp.innerText = (currentFloor * 450 + 800).toLocaleString();
        if (eAtk) eAtk.innerText = (currentFloor * 35 + 60).toLocaleString();
        if (eDef) eDef.innerText = (currentFloor * 15 + 20).toLocaleString();
    }
}