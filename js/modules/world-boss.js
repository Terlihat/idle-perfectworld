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
        let finalRewards = {};
        let finalExtraDrops = []; // Pindahkan deklarasi ke sini agar bisa dibaca di luar transaksi

        // =======================================
        // BLOK TRANSAKSI DATABASE (KHUSUS DATA)
        // =======================================
        await runTransaction(db, async (ts) => {
            const bossSnap = await ts.get(bossRef);
            if (!bossSnap.exists()) throw "World Boss belum disiapkan oleh sistem!";

            let data = bossSnap.data();
            const now = Date.now();

            // 1. VALIDASI WAKTU JADWAL
            if (!data.isActive || data.currentHp <= 0) throw "World Boss sudah dikalahkan atau tidak aktif!";

            if (!data.isPermanent) {
                const startTimeMs = new Date(data.startTime).getTime();
                const endTimeMs = new Date(data.endTime).getTime();
                if (now < startTimeMs) throw "World Boss belum waktunya muncul (Masih bersiap)!";
                if (now > endTimeMs) throw "Waktu invasi World Boss telah berakhir!";
            }

            // 2. CEK BATASAN PEMAIN & RESET HARIAN
            let participants = data.participants || {};
            let myRecord = participants[window.currentUserUid] || { name: window.playerUsername, damage: 0, attackCount: 0, lastAttackTime: 0 };
            const ONE_HOUR = 60 * 60 * 1000;

            const todayStr = new Date(now).toLocaleDateString('id-ID');

            // Reset otomatis jika beda hari
            if (myRecord.lastAttackDate && myRecord.lastAttackDate !== todayStr) {
                myRecord.attackCount = 0;
            }

            if (myRecord.attackCount >= 5) {
                throw "❌ Anda sudah mencapai batas maksimal 5x serangan ke Boss ini untuk hari ini!";
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
            myRecord.lastAttackDate = todayStr;

            participants[window.currentUserUid] = myRecord;

            // 4. CEK JIKA BOSS MATI
            let isDead = false;
            if (newHp === 0 && !data.rewardsDistributed) {
                isDead = true;
                bossDiedJustNow = true;
                finalParticipants = participants;
                finalRewards = data.rewards;
                finalExtraDrops = data.extraDrops || [];
            }

            // 5. UPDATE DATABASE BOSS
            ts.update(bossRef, {
                currentHp: newHp,
                participants: participants,
                isActive: newHp > 0,
                rewardsDistributed: isDead ? true : (data.rewardsDistributed || false)
            }); // 🔥 PERBAIKAN: Kurung tutup ini sebelumnya hilang
        });
        // Akhir dari blok transaksi.

        // =======================================
        // BLOK EFEK VISUAL & PENGIRIMAN HADIAH
        // =======================================

        // Panggil efek getar dan angka melayang
        showDamageVisuals(finalDamage);

        window.rpgAlert(`💥 Serangan Sukses! Anda memberikan ${finalDamage} Damage.`, "Serangan WB");

        // 6. EKSEKUSI PEMBAGIAN HADIAH DINAMIS & GACHA
        if (bossDiedJustNow) {
            window.rpgAlert("🎉 ANDA MEMBERIKAN SERANGAN TERAKHIR! Boss telah mati. Mengirimkan hadiah ke seluruh peserta...", "WORLD BOSS MATI");
            // 🔥 PERBAIKAN: Mengirim 3 parameter, termasuk finalExtraDrops (Gacha)
            await distributeBossRewards(finalParticipants, finalRewards, finalExtraDrops);
        }

    } catch (err) {
        window.rpgAlert(err, "Peringatan");
    } finally {
        btn.disabled = false;
        btn.innerText = "⚔️ SERANG BOSS! ⚔️";
    }
};

// FITUR: Distribusi Hadiah Berdasarkan Konfigurasi Admin
async function distributeBossRewards(participantsObj, rewardsConfig, extraDrops) {
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

        // =========================================================
        // PERUBAHAN 2: TAMBAHAN LOGIKA GACHA MULTI-DROP DI SINI
        // =========================================================
        if (extraDrops && extraDrops.length > 0) {
            extraDrops.forEach(drop => {
                // Kocok angka acak dari 0.00 sampai 100.00
                const roll = Math.random() * 100;

                // Jika hasil dadu masuk ke dalam persentase, kirim item gacha!
                if (roll <= drop.chance) {
                    const gachaMail = {
                        senderId: "SYSTEM",
                        senderName: "Loot System",
                        title: `🎲 Extra Drop Boss: ${drop.item}`,
                        message: `Selamat! Anda sangat beruntung, Boss menjatuhkan item extra saat dikalahkan.`,
                        attachments: {
                            itemName: drop.item,
                            qty: 1
                        },
                        isClaimed: false,
                        timestamp: serverTimestamp()
                    };
                    // Kirim surat gacha sebagai surat terpisah (tambahan)
                    sendPromises.push(addDoc(mailboxRef, gachaMail));
                }
            });
        }
        // =========================================================
    });

    try {
        await Promise.all(sendPromises);
        console.log(`Berhasil mengirimkan hadiah World Boss & Gacha ke ${players.length} pemain!`);
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

// ==========================================
// FITUR VISUAL: EFEK SERANGAN & FLOATING TEXT
// ==========================================

// 1. Suntikkan CSS Animasi secara dinamis agar Anda tidak perlu mengedit file CSS
const style = document.createElement('style');
style.innerHTML = `
    /* Animasi Angka Damage Melayang */
    @keyframes floatDamage {
        0% { transform: translate(-50%, 0) scale(0.5); opacity: 0; color: #fff; }
        20% { transform: translate(-50%, -20px) scale(1.5); opacity: 1; color: #ff4c4c; }
        80% { transform: translate(-50%, -60px) scale(1.2); opacity: 1; color: #ffcc00; }
        100% { transform: translate(-50%, -80px) scale(1); opacity: 0; color: #ffcc00; }
    }
    
    /* Animasi Layar Bergetar saat Boss Dipukul */
    @keyframes bossHitShake {
        0% { transform: translateX(0); filter: brightness(1); }
        25% { transform: translateX(-8px) rotate(-2deg); filter: brightness(1.5) hue-rotate(-20deg); }
        50% { transform: translateX(8px) rotate(2deg); filter: brightness(1); }
        75% { transform: translateX(-8px) rotate(-2deg); }
        100% { transform: translateX(0); filter: brightness(1); }
    }

    .damage-bubble {
        position: absolute;
        font-size: 36px;
        font-weight: 900;
        text-shadow: 2px 2px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 4px 4px 10px rgba(255,0,0,0.8);
        pointer-events: none;
        animation: floatDamage 1.2s cubic-bezier(0.25, 1, 0.5, 1) forwards;
        z-index: 9999;
        left: 50%;
        top: 30%;
    }

    .boss-taking-damage {
        animation: bossHitShake 0.4s ease-in-out;
    }
`;
document.head.appendChild(style);

// 2. Fungsi untuk memunculkan efek
function showDamageVisuals(damageAmount) {
    const btn = document.getElementById('wb-btn-attack');
    if (!btn) return;

    // Ambil kotak utama bos (parent dari tombol)
    const bossContainer = btn.parentElement;

    // A. Efek Layar Bergetar (Reset animasi lalu mainkan lagi)
    bossContainer.classList.remove('boss-taking-damage');
    void bossContainer.offsetWidth; // Trik ajaib JS untuk me-restart animasi CSS
    bossContainer.classList.add('boss-taking-damage');

    // B. Buat Elemen Teks Damage
    const bubble = document.createElement('div');
    bubble.innerText = `-${damageAmount.toLocaleString()}`;
    bubble.className = 'damage-bubble';

    // Beri sedikit posisi acak (random) agar teks tidak selalu numpuk di tengah persis
    const randomX = Math.floor(Math.random() * 60) - 30; // Geser -30px hingga 30px
    const randomY = Math.floor(Math.random() * 20) - 10;

    bubble.style.marginLeft = `${randomX}px`;
    bubble.style.marginTop = `${randomY}px`;

    // Masukkan teks ke dalam kotak boss
    bossContainer.appendChild(bubble);

    // Hapus elemen dari memori setelah animasi selesai (1.2 detik)
    setTimeout(() => {
        bubble.remove();
    }, 1200);
}