import { db } from '../firebase-config.js';
import { doc, runTransaction, onSnapshot, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// FITUR: Menyerang Boss
window.attackWorldBoss = async function () {
    const btn = document.getElementById('wb-btn-attack');
    if (btn && btn.disabled) return;

    const stats = window.currentPlayerStats;
    if (!stats) return;

    let baseAtk = (stats.patk || 10) + (stats.matk || 10);
    let randomMultiplier = (Math.random() * 0.4) + 0.8;
    let finalDamage = Math.floor(baseAtk * randomMultiplier * 100);

    btn.disabled = true;
    btn.innerText = "⏳ Menyerang...";

    try {
        const bossRef = doc(db, "events", "worldBoss");
        let bossDiedJustNow = false;
        let finalParticipants = {};
        let finalRewards = {}; // Menyimpan template hadiah untuk dikirim nanti

        await runTransaction(db, async (ts) => {
            const bossSnap = await ts.get(bossRef);
            if (!bossSnap.exists()) throw "World Boss belum disiapkan oleh sistem!";

            let data = bossSnap.data();
            const now = Date.now();

            // 1. VALIDASI WAKTU JADWAL (Real-time check)
            if (!data.isActive || data.currentHp <= 0) throw "World Boss sudah dikalahkan atau tidak aktif!";

            if (!data.isPermanent) {
                const startTimeMs = new Date(data.startTime).getTime();
                const endTimeMs = new Date(data.endTime).getTime();
                if (now < startTimeMs) throw "World Boss belum waktunya muncul (Masih bersiap)!";
                if (now > endTimeMs) throw "Waktu invasi World Boss telah berakhir!";
            }

            // 2. CEK BATASAN PEMAIN (5x & Cooldown 1 Jam)
            let participants = data.participants || {};
            let myRecord = participants[window.currentUserUid] || { name: window.playerUsername, damage: 0, attackCount: 0, lastAttackTime: 0 };
            const ONE_HOUR = 60 * 60 * 1000;

            if (myRecord.attackCount >= 5) {
                throw "❌ Anda sudah mencapai batas maksimal 5x serangan ke Boss ini!";
            }
            if (myRecord.attackCount > 0 && (now - myRecord.lastAttackTime < ONE_HOUR)) {
                let sisaWaktu = ONE_HOUR - (now - myRecord.lastAttackTime);
                let menit = Math.ceil(sisaWaktu / 60000);
                throw `⏳ Senjata masih panas! Tunggu ${menit} menit lagi untuk serangan ke-${myRecord.attackCount + 1}.`;
            }

            // 3. TERAPKAN DAMAGE
            let newHp = data.currentHp - finalDamage;
            if (newHp < 0) newHp = 0;

            myRecord.damage += finalDamage;
            myRecord.name = window.playerUsername;
            myRecord.attackCount += 1;
            myRecord.lastAttackTime = now;

            participants[window.currentUserUid] = myRecord;

            // 4. CEK JIKA BOSS MATI
            let isDead = false;
            if (newHp === 0 && !data.rewardsDistributed) {
                isDead = true;
                bossDiedJustNow = true;
                finalParticipants = participants;
                finalRewards = data.rewards; // Ambil data hadiah dari Admin
            }

            // 5. UPDATE DATABASE BOSS
            ts.update(bossRef, {
                currentHp: newHp,
                participants: participants,
                isActive: newHp > 0,
                rewardsDistributed: isDead ? true : (data.rewardsDistributed || false)
            });
        });

        window.rpgAlert(`💥 Serangan Sukses! Anda memberikan ${finalDamage} Damage.`, "Serangan WB");

        // 6. EKSEKUSI PEMBAGIAN HADIAH DINAMIS JIKA BOSS MATI
        if (bossDiedJustNow) {
            window.rpgAlert("🎉 ANDA MEMBERIKAN SERANGAN TERAKHIR! Boss telah mati. Mengirimkan hadiah ke seluruh peserta...", "WORLD BOSS MATI");
            await distributeBossRewards(finalParticipants, finalRewards);
        }

    } catch (err) {
        window.rpgAlert(err, "Peringatan");
    } finally {
        btn.disabled = false;
        btn.innerText = "⚔️ SERANG BOSS! ⚔️";
    }
};

// FITUR: Distribusi Hadiah Berdasarkan Konfigurasi Admin
async function distributeBossRewards(participantsObj, rewardsConfig) {
    let players = Object.entries(participantsObj).map(([uid, data]) => ({
        uid: uid,
        name: data.name,
        damage: data.damage
    })).sort((a, b) => b.damage - a.damage);

    let sendPromises = [];

    players.forEach((p, index) => {
        let rank = index + 1;
        let title = `🏆 Hadiah World Boss - Peringkat #${rank}`;
        let message = `Terima kasih telah berpartisipasi mengalahkan World Boss! Total Damage Anda: ${p.damage}. Berikut hadiah Anda.`;

        // Tentukan template hadiah berdasarkan peringkat
        let reward = {};
        if (rank === 1) reward = rewardsConfig.rank1;
        else if (rank >= 2 && rank <= 3) reward = rewardsConfig.rank2_3;
        else reward = rewardsConfig.rank4_plus;

        // Susun lampiran surat
        let attachments = {};
        if (reward.gold > 0) attachments.gold = reward.gold;
        if (reward.coin > 0) attachments.coin = reward.coin; // Tambahan support coin
        if (reward.item && reward.item !== "") {
            attachments.itemName = reward.item;
            attachments.qty = reward.qty || 1;
        }

        const mailData = {
            senderId: "SYSTEM",
            senderName: "Event Master",
            title: title,
            message: message,
            attachments: attachments,
            isClaimed: false,
            timestamp: serverTimestamp()
        };

        const mailboxRef = collection(db, "users", p.uid, "mailbox");
        sendPromises.push(addDoc(mailboxRef, mailData));
    });

    try {
        await Promise.all(sendPromises);
        console.log(`Berhasil mengirimkan hadiah World Boss ke ${players.length} pemain!`);
    } catch (err) {
        console.error("Gagal mendistribusikan hadiah: ", err);
    }
}

// FITUR: Listener Real-Time UI Boss
export function listenToWorldBoss(renderCallback) {
    const bossRef = doc(db, "events", "worldBoss");
    return onSnapshot(bossRef, (docSnap) => {
        if (!docSnap.exists()) {
            renderCallback(null);
            return;
        }

        let data = docSnap.data();

        // Sembunyikan UI jika boss memiliki jadwal tetapi belum waktunya muncul atau sudah lewat
        if (!data.isPermanent && data.isActive && data.currentHp > 0) {
            const now = Date.now();
            const startTime = new Date(data.startTime).getTime();
            const endTime = new Date(data.endTime).getTime();

            // Jika belum waktunya, atau sudah kadaluarsa (hilang otomatis), kirim null ke UI (Sembunyikan)
            if (now < startTime || now > endTime) {
                renderCallback(null);
                return;
            }
        }

        // Tampilkan boss jika waktunya tepat, permanen, atau jika boss sudah mati (untuk memunculkan leaderboard terakhir)
        renderCallback(data);
    });
}