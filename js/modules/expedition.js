// File: js/modules/expedition.js
import { db } from '../firebase-config.js';
import { doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

let afkTimerInterval = null;

// FITUR: Memulai Ekspedisi
window.startExpedition = async function () {
    const hours = parseInt(document.getElementById('afk-duration').value);
    const btn = document.getElementById('btn-start-afk');
    btn.disabled = true;
    btn.innerText = "Memulai...";

    try {
        const userRef = doc(db, "users", window.currentUserUid);
        await runTransaction(db, async (ts) => {
            const userSnap = await ts.get(userRef);
            const d = userSnap.data();

            if (d.expedition && d.expedition.status === 'running') {
                throw "Anda sudah memiliki ekspedisi yang sedang berjalan!";
            }

            const startTime = Date.now();
            const durationMs = hours * 60 * 60 * 1000;

            ts.update(userRef, {
                expedition: {
                    startTime: startTime,
                    durationMs: durationMs,
                    status: 'running',
                    hours: hours
                }
            });
        });
        window.rpgAlert(`Misi Ekspedisi selama ${hours} Jam telah dimulai. Sampai jumpa!`, "Berangkat");
    } catch (err) {
        window.rpgAlert(err, "Gagal Memulai");
        btn.disabled = false;
        btn.innerText = "🚀 BERANGKAT EKSPEDISI";
    }
};

// FITUR: Mengklaim Hadiah
window.claimExpedition = async function () {
    const btn = document.getElementById('btn-claim-afk');
    btn.disabled = true;
    btn.innerText = "Mengklaim...";

    try {
        const userRef = doc(db, "users", window.currentUserUid);
        await runTransaction(db, async (ts) => {
            const userSnap = await ts.get(userRef);
            const d = userSnap.data();

            if (!d.expedition || d.expedition.status !== 'running') throw "Tidak ada ekspedisi yang bisa diklaim.";

            const now = Date.now();
            const endTime = d.expedition.startTime + d.expedition.durationMs;

            if (now < endTime) throw "Jangan curang! Ekspedisi belum selesai.";

            // --- KALKULASI HADIAH DINAMIS ---
            const h = d.expedition.hours;
            const pLevel = d.level || 1;

            const maxExpNeeded = pLevel * 100;
            const rewardExp = Math.floor(maxExpNeeded * 0.05 * h);
            const rewardGold = Math.floor((h * 100) + (h * 25 * pLevel));

            let currentInv = d.inventory || {};
            let extraMsg = "";

            // 50% Kesempatan dapat Universal Stone
            if (Math.random() > 0.5) {
                const stoneQty = h * 5;
                currentInv['Universal Stone'] = (currentInv['Universal Stone'] || 0) + stoneQty;
                extraMsg = `<br>💎 <b>${stoneQty} Universal Stone</b>`;
            }

            ts.update(userRef, {
                gold: (d.gold || 0) + rewardGold,
                exp: (d.exp || 0) + rewardExp,
                inventory: currentInv,
                expedition: null // Reset ekspedisi
            });

            window.rpgAlert(`🎉 Ekspedisi Selesai!<br>Anda mendapatkan:<br>💰 <b>${rewardGold} Gold</b><br>✨ <b>${rewardExp} EXP</b>${extraMsg}`, "Hadiah AFK");
        });
    } catch (err) {
        window.rpgAlert(err, "Gagal Klaim");
        btn.disabled = false;
        btn.innerText = "🎁 KLAIM HADIAH";
    }
};

// FITUR: Render UI & Hitung Mundur Live Timer
export function renderExpeditionUI(userData) {
    const selectionDiv = document.getElementById('afk-selection');
    const claimDiv = document.getElementById('afk-claim-area');
    const timerDiv = document.getElementById('afk-timer');
    const statusText = document.getElementById('afk-status-text');

    if (!selectionDiv || !claimDiv || !timerDiv || !statusText) return;

    if (afkTimerInterval) {
        clearInterval(afkTimerInterval);
        afkTimerInterval = null;
    }

    const expData = userData.expedition;

    if (!expData || expData.status !== 'running') {
        selectionDiv.style.display = 'block';
        claimDiv.style.display = 'none';
        timerDiv.style.display = 'none';
        statusText.innerText = "Pilih Durasi Ekspedisi";
        statusText.style.color = "#ffca28";

        const btnStart = document.getElementById('btn-start-afk');
        if (btnStart) { btnStart.disabled = false; btnStart.innerText = "🚀 BERANGKAT EKSPEDISI"; }
    } else {
        selectionDiv.style.display = 'none';
        timerDiv.style.display = 'block';

        const updateTimer = () => {
            const now = Date.now();
            const endTime = expData.startTime + expData.durationMs;
            const sisaMs = endTime - now;

            if (sisaMs <= 0) {
                clearInterval(afkTimerInterval);
                timerDiv.style.display = 'none';
                claimDiv.style.display = 'block';
                statusText.innerText = "Ekspedisi Selesai!";
                statusText.style.color = "#28a745";

                const btnClaim = document.getElementById('btn-claim-afk');
                if (btnClaim) { btnClaim.disabled = false; btnClaim.innerText = "🎁 KLAIM HADIAH"; }
            } else {
                claimDiv.style.display = 'none';
                statusText.innerText = "Karakter Sedang Dalam Perjalanan...";
                statusText.style.color = "#4ae3ff";

                let sisaDetik = Math.floor(sisaMs / 1000);
                let jam = Math.floor(sisaDetik / 3600);
                let menit = Math.floor((sisaDetik % 3600) / 60);
                let detik = sisaDetik % 60;

                timerDiv.innerText = `${jam.toString().padStart(2, '0')}:${menit.toString().padStart(2, '0')}:${detik.toString().padStart(2, '0')}`;
            }
        };

        updateTimer();
        afkTimerInterval = setInterval(updateTimer, 1000);
    }
}