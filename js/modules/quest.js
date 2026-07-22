/* ===================================================
   MODUL MISI HARIAN & BOUNTY HUNTER (SISTEM TIKET & LEVELING)
   =================================================== */
import { db } from '../firebase-config.js';
import { doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getVipStats } from './vip.js';

// 🔥 PENYESUAIAN: Misi Solo berdasarkan Level (Ekonomi Diperketat)
function getDailyQuestByLevel(level) {
    if (level < 10) return { id: "slime", title: "Kalahkan 10x Slime Hijau", target: 10, rGold: 500, rItem: "Ramuan HP" };
    if (level < 20) return { id: "goblin", title: "Kalahkan 12x Goblin Perampok", target: 12, rGold: 1000, rItem: "Ramuan MP" };
    if (level < 30) return { id: "orc", title: "Kalahkan 15x Orc Warrior", target: 15, rGold: 2000, rItem: "Mirage Stone" };
    if (level < 40) return { id: "skeleton", title: "Kalahkan 15x Skeleton Archer", target: 15, rGold: 3500, rItem: "Mirage Stone" };
    if (level < 50) return { id: "golem", title: "Kalahkan 20x Stone Golem", target: 20, rGold: 5000, rItem: "Mirage Stone" };
    if (level < 60) return { id: "darkelf", title: "Kalahkan 20x Dark Elf Assassin", target: 20, rGold: 7500, rItem: "Ramuan HP" };
    if (level < 70) return { id: "succubus", title: "Kalahkan 25x Succubus", target: 25, rGold: 10000, rItem: "Ramuan MP" };
    if (level < 80) return { id: "vampire", title: "Kalahkan 25x Vampire Lord", target: 25, rGold: 12500, rItem: "Mirage Stone" };
    if (level < 90) return { id: "dragon", title: "Kalahkan 30x Anak Naga", target: 30, rGold: 15000, rItem: "Mirage Stone" };
    return { id: "demon", title: "Kalahkan 30x Demon King", target: 30, rGold: 20000, rItem: "Mirage Stone" };
}

// 🔥 PENYESUAIAN: Bounty Fuben berdasarkan Level (Ekonomi Diperketat)
function getBountyQuestByLevel(level) {
    if (level < 20) return { id: "fb19", title: "Selesaikan FB19 (Party)", target: 1, rGold: 2500, rCoin: 0 };
    if (level < 30) return { id: "fb29", title: "Selesaikan FB29 (Party)", target: 1, rGold: 4000, rCoin: 0 };
    if (level < 40) return { id: "fb39", title: "Selesaikan FB39 (Party)", target: 1, rGold: 6000, rCoin: 0 };
    if (level < 50) return { id: "fb51", title: "Selesaikan FB51 (Party)", target: 1, rGold: 9000, rCoin: 0 };
    if (level < 60) return { id: "fb59", title: "Selesaikan FB59 (Party)", target: 1, rGold: 12000, rCoin: 0 };
    if (level < 70) return { id: "fb69", title: "Selesaikan FB69 (Party)", target: 1, rGold: 16000, rCoin: 0 };
    if (level < 80) return { id: "fb79", title: "Selesaikan FB79 (Party)", target: 1, rGold: 22000, rCoin: 0 };
    if (level < 90) return { id: "fb89", title: "Selesaikan FB89 (Party)", target: 1, rGold: 30000, rCoin: 0 };
    if (level < 100) return { id: "fb99", title: "Selesaikan FB99 (Party)", target: 1, rGold: 40000, rCoin: 0 };
    return { id: "fb100", title: "Selesaikan FB100 (Party)", target: 1, rGold: 50000, rCoin: 0 };
}

// FUNGSI HELPER: Mencatat Kematian Monster ke Misi
export function getUpdatedQuests(userData, questType, targetId, amount) {
    let q = userData.quests ? JSON.parse(JSON.stringify(userData.quests)) : null;
    if (q && q[questType] && !q[questType].isClaimed && q[questType].targetId === targetId) {
        q[questType].progress = Math.min(q[questType].target, q[questType].progress + amount);
    }
    return q || userData.quests;
}

// 🔥 FUNGSI UTAMA: Menerapkan Sistem Tiket & Mencegah Reset Paksa
window.assignNewQuests = async function () {
    const uid = window.currentUserUid;
    if (!uid) return;
    const userRef = doc(db, "users", uid);
    const today = new Date().toLocaleDateString('id-ID');

    try {
        await runTransaction(db, async (ts) => {
            const snap = await ts.get(userRef);
            if (!snap.exists()) return;

            const data = snap.data();
            const playerLevel = data.level || 1;

            let q = data.quests || {};

            // Baca tiket yang dimiliki, jika pemain baru berikan 0
            let dChances = q.dailyChances !== undefined ? q.dailyChances : 0;
            let bChances = q.bountyChances !== undefined ? q.bountyChances : 0;

            // Jika hari berganti, berikan +1 tiket (Maksimal ditimbun 2)
            if (q.lastReset !== today) {
                dChances = Math.min(2, dChances + 1);
                bChances = Math.min(2, bChances + 1);
                q.lastReset = today;
            }

            let isUpdated = false;

            // Cek apakah Misi Solo masih berjalan
            const isDailyActive = q.daily && !q.daily.isClaimed;
            if (!isDailyActive && dChances > 0) {
                const dQ = getDailyQuestByLevel(playerLevel);
                q.daily = { targetId: dQ.id, title: dQ.title, progress: 0, target: dQ.target, rGold: dQ.rGold, rItem: dQ.rItem, isClaimed: false };
                dChances--; // Pakai 1 tiket
                isUpdated = true;
            }

            // Cek apakah Misi Bounty masih berjalan
            const isBountyActive = q.bounty && !q.bounty.isClaimed;
            if (!isBountyActive && bChances > 0) {
                const bQ = getBountyQuestByLevel(playerLevel);
                q.bounty = { targetId: bQ.id, title: bQ.title, progress: 0, target: bQ.target, rGold: bQ.rGold, rCoin: (bQ.rCoin || 0), rItem: (bQ.rItem || null), isClaimed: false };
                bChances--; // Pakai 1 tiket
                isUpdated = true;
            }

            // Simpan sisa tiket ke database
            q.dailyChances = dChances;
            q.bountyChances = bChances;

            if (isUpdated) {
                ts.update(userRef, { quests: q });
                window.rpgAlert(`📜 Misi baru ditugaskan!<br><br>Sisa Tiket Ditimbun:<br>Solo: ${dChances}/2 | Bounty: ${bChances}/2`, "Guild Petualang");
            } else if (isDailyActive || isBountyActive) {
                // Hanya update database untuk menyimpan tiket (lastReset) tanpa menimpa misi
                ts.update(userRef, { quests: q });
                window.rpgAlert(`⚠️ Selesaikan misi saat ini terlebih dahulu!<br><br>Sistem telah menyimpan tiket hari ini. Anda memiliki tiket tertimbun:<br>Solo: ${dChances}/2 | Bounty: ${bChances}/2<br><br><i>(Klaim misi ini, lalu tekan tombol kembali)</i>`, "Misi Berjalan");
            } else {
                window.rpgAlert("❌ Tiket misi Anda habis untuk hari ini. Silakan kembali besok!", "Info Sistem");
            }
        });
    } catch (e) { window.rpgAlert("Gagal menugaskan misi: " + e); }
};

// 🔥 FUNGSI KLAIM: Mengingatkan jika ada tiket yang tertimbun
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

            let msg = `🎉 KLAIM BERHASIL! Mendapat +${baseGold.toLocaleString()} Gold`;

            if (bonusGold > 0) {
                msg += ` (Bonus VIP 👑: +${bonusGold.toLocaleString()} Gold)`;
            }

            if (q[questType].rItem) {
                inv[q[questType].rItem] = (inv[q[questType].rItem] || 0) + 1;
                msg += `, +1 [${q[questType].rItem}]`;
            }
            if (q[questType].rCoin) { msg += `, +${q[questType].rCoin} COIN`; }

            // Pengingat cerdas
            const sisaTiket = q[`${questType}Chances`] || 0;
            if (sisaTiket > 0) {
                msg += `<br><br><i>(Anda masih punya ${sisaTiket} tiket tertimbun, klik "Tugaskan Misi" lagi!)</i>`;
            }

            ts.update(userRef, { quests: q, gold: newGold, coin: newCoin, inventory: inv });
            window.rpgAlert(msg, "Hadiah Diterima");
        });
    } catch (e) { window.rpgAlert("Klaim Gagal: " + e); }
};