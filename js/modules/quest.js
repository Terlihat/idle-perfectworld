/* ===================================================
   MODUL MISI HARIAN & BOUNTY HUNTER
   =================================================== */
import { db } from '../firebase-config.js'; // PASTIKAN MENGIMPOR DB
import { doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getVipStats } from './vip.js';

const DAILY_QUESTS = [
    { id: "slime", title: "Kalahkan 10x Slime Hijau", target: 10, rGold: 3000, rItem: "Ramuan HP" },
    { id: "goblin", title: "Kalahkan 8x Goblin Perampok", target: 8, rGold: 5000, rItem: "Ramuan MP" },
    { id: "orc", title: "Kalahkan 5x Orc Warrior", target: 5, rGold: 8000, rItem: "Mirage Stone" },
    { id: "dragon", title: "Kalahkan 3x Anak Naga", target: 3, rGold: 12000, rItem: "Mirage Stone" }
];

const BOUNTY_QUESTS = [
    { id: "fb19", title: "Selesaikan FB19 (Party)", target: 1, rGold: 15000, rCoin: 0 },
    { id: "fb29", title: "Selesaikan FB29 (Party)", target: 1, rGold: 25000, rCoin: 0 },
    { id: "fb39", title: "Selesaikan FB39 (Party)", target: 1, rGold: 40000, rCoin: 0 },
    { id: "fb51", title: "Selesaikan FB51 (Party)", target: 1, rGold: 80000, rCoin: 0 }
];

// FUNGSI HELPER
export function getUpdatedQuests(userData, questType, targetId, amount) {
    let q = userData.quests ? JSON.parse(JSON.stringify(userData.quests)) : null;
    if (q && q[questType] && !q[questType].isClaimed && q[questType].targetId === targetId) {
        q[questType].progress = Math.min(q[questType].target, q[questType].progress + amount);
    }
    return q || userData.quests;
}

// UBAH JADI WINDOW AGAR TERHUBUNG KE HTML
window.assignNewQuests = async function () {
    const uid = window.currentUserUid;
    if (!uid) return;
    const userRef = doc(db, "users", uid);
    const today = new Date().toLocaleDateString('id-ID');

    const dQ = DAILY_QUESTS[Math.floor(Math.random() * DAILY_QUESTS.length)];
    const bQ = BOUNTY_QUESTS[Math.floor(Math.random() * BOUNTY_QUESTS.length)];

    try {
        await runTransaction(db, async (ts) => {
            const snap = await ts.get(userRef);
            if (!snap.exists()) return;

            ts.update(userRef, {
                quests: {
                    lastReset: today,
                    daily: { targetId: dQ.id, title: dQ.title, progress: 0, target: dQ.target, rGold: dQ.rGold, rItem: dQ.rItem, isClaimed: false },
                    bounty: { targetId: bQ.id, title: bQ.title, progress: 0, target: bQ.target, rGold: bQ.rGold, rCoin: (bQ.rCoin || 0), rItem: (bQ.rItem || null), isClaimed: false }
                }
            });
        });
        alert("📜 Misi berhasil diperbarui! Silakan cek panel misi Anda.");
    } catch (e) { alert("Gagal mengambil misi: " + e); }
};

// UBAH JADI WINDOW AGAR TERHUBUNG KE HTML
window.claimQuest = async function (questType) {
    const uid = window.currentUserUid;
    if (!uid) return;
    const userRef = doc(db, "users", uid);

    try {
        await runTransaction(db, async (ts) => {
            const snap = await ts.get(userRef);
            if (!snap.exists()) throw "User tidak ditemukan";
            const data = snap.data();
            let q = data.quests || {};

            if (!q[questType]) throw "Misi tidak valid!";
            if (q[questType].isClaimed) throw "Hadiah sudah diklaim sebelumnya!";
            if (q[questType].progress < q[questType].target) throw "Misi belum selesai!";

            q[questType].isClaimed = true;

            const vipLevel = data.vipLevel || 0;
            const vipStats = getVipStats(vipLevel);

            const baseGold = q[questType].rGold || 0;
            const bonusGold = Math.floor(baseGold * (vipStats.goldBonusPct / 100));
            const finalGold = baseGold + bonusGold;

            let newGold = (data.gold || 0) + finalGold;
            let newCoin = (data.coin || 0) + (q[questType].rCoin || 0);
            let inv = data.inventory || {};

            let msg = `🎉 KLAIM BERHASIL! Mendapat +${baseGold} Gold`;

            if (bonusGold > 0) {
                msg += ` (Bonus VIP 👑: +${bonusGold} Gold)`;
            }

            if (q[questType].rItem) {
                inv[q[questType].rItem] = (inv[q[questType].rItem] || 0) + 1;
                msg += `, +1 [${q[questType].rItem}]`;
            }
            if (q[questType].rCoin) { msg += `, +${q[questType].rCoin} COIN`; }

            ts.update(userRef, { quests: q, gold: newGold, coin: newCoin, inventory: inv });
            alert(msg);
        });
    } catch (e) { alert("Klaim Gagal: " + e); }
};