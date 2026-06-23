import { db } from '../firebase-config.js';
import { doc, runTransaction, onSnapshot, setDoc, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// FITUR: Menyerang Boss
window.attackWorldBoss = async function () {
    const btn = document.getElementById('wb-btn-attack');
    if (btn && btn.disabled) return;

    const stats = window.currentPlayerStats;
    if (!stats) return;

    // Kalkulasi Damage (Dibuat jauh lebih besar karena serangan dibatasi 5x)
    let baseAtk = (stats.patk || 10) + (stats.matk || 10);
    let randomMultiplier = (Math.random() * 0.4) + 0.8;
    let finalDamage = Math.floor(baseAtk * randomMultiplier * 100); // Dikali 100 agar terasa sakit

    btn.disabled = true;
    btn.innerText = "⏳ Menyerang...";

    try {
        const bossRef = doc(db, "events", "worldBoss");
        let bossDiedJustNow = false;
        let finalParticipants = {};

        await runTransaction(db, async (ts) => {
            const bossSnap = await ts.get(bossRef);
            if (!bossSnap.exists()) throw "World Boss belum muncul!";

            let data = bossSnap.data();
            if (!data.isActive || data.currentHp <= 0) throw "World Boss sudah dikalahkan!";

            // 1. CEK BATASAN PEMAIN
            let participants = data.participants || {};
            let myRecord = participants[window.currentUserUid] || { name: window.playerUsername, damage: 0, attackCount: 0, lastAttackTime: 0 };

            const now = Date.now();
            const ONE_HOUR = 60 * 60 * 1000; // 1 Jam dalam milidetik

            // Cek apakah sudah 5x
            if (myRecord.attackCount >= 5) {
                throw "❌ Anda sudah mencapai batas maksimal 5x serangan ke Boss ini!";
            }

            // Cek apakah Cooldown 1 Jam sudah lewat
            if (myRecord.attackCount > 0 && (now - myRecord.lastAttackTime < ONE_HOUR)) {
                let sisaWaktu = ONE_HOUR - (now - myRecord.lastAttackTime);
                let menit = Math.ceil(sisaWaktu / 60000);
                throw `⏳ Senjata masih panas! Tunggu ${menit} menit lagi untuk serangan ke-${myRecord.attackCount + 1}.`;
            }

            // 2. TERAPKAN DAMAGE
            let newHp = data.currentHp - finalDamage;
            if (newHp < 0) newHp = 0;

            myRecord.damage += finalDamage;
            myRecord.name = window.playerUsername;
            myRecord.attackCount += 1;
            myRecord.lastAttackTime = now;

            participants[window.currentUserUid] = myRecord;

            // 3. CEK JIKA BOSS MATI OLEH SERANGAN INI
            let isDead = false;
            if (newHp === 0 && !data.rewardsDistributed) {
                isDead = true;
                bossDiedJustNow = true;
                finalParticipants = participants; // Simpan data untuk dikirim hadiah
            }

            // 4. UPDATE DATABASE BOSS
            ts.update(bossRef, {
                currentHp: newHp,
                participants: participants,
                isActive: newHp > 0,
                rewardsDistributed: isDead ? true : (data.rewardsDistributed || false)
            });
        });

        window.rpgAlert(`💥 Serangan Sukses! Anda memberikan ${finalDamage} Damage.`, "Serangan WB");

        // 5. EKSEKUSI PEMBAGIAN HADIAH JIKA BOSS MATI
        if (bossDiedJustNow) {
            window.rpgAlert("🎉 ANDA MEMBERIKAN SERANGAN TERAKHIR! Boss telah mati. Mengirimkan hadiah ke seluruh peserta...", "WORLD BOSS MATI");
            await distributeBossRewards(finalParticipants);
        }

    } catch (err) {
        window.rpgAlert(err, "Peringatan");
    } finally {
        btn.disabled = false;
    }
};

// FITUR: Distribusi Hadiah Otomatis via Mailbox
async function distributeBossRewards(participantsObj) {
    // Ubah Object ke Array dan urutkan berdasarkan damage terbesar
    let players = Object.entries(participantsObj).map(([uid, data]) => ({
        uid: uid,
        name: data.name,
        damage: data.damage
    })).sort((a, b) => b.damage - a.damage);

    let sendPromises = [];

    // Looping pengiriman hadiah berdasarkan peringkat
    players.forEach((p, index) => {
        let rank = index + 1;
        let title = `🏆 Hadiah World Boss - Peringkat #${rank}`;
        let message = `Terima kasih telah berpartisipasi mengalahkan World Boss! Total Damage Anda: ${p.damage}. Berikut hadiah Anda.`;

        let rewardGold = 0;
        let rewardStone = 0;

        // ATURAN HADIAH BISA ANDA UBAH DI SINI:
        if (rank === 1) { rewardGold = 100000; rewardStone = 3000; }
        else if (rank >= 2 && rank <= 3) { rewardGold = 50000; rewardStone = 1500; }
        else if (rank >= 4 && rank <= 10) { rewardGold = 25000; rewardStone = 500; }
        else { rewardGold = 10000; rewardStone = 100; } // Hadiah partisipasi > Rank 10

        const mailData = {
            senderId: "SYSTEM",
            senderName: "Event Master",
            title: title,
            message: message,
            attachments: {
                gold: rewardGold,
                itemName: "Universal Stone",
                qty: rewardStone
            },
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