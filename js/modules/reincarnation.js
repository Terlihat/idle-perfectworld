// File: js/modules/reincarnation.js
import { doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export async function processReincarnation(db, auth) {
    // Pastikan pemain sudah login
    if (!auth.currentUser) return;

    const uid = auth.currentUser.uid;
    const userRef = doc(db, "users", uid);

    // Konfirmasi sebelum melakukan reset level
    if (!confirm("Peringatan: Level Anda akan dikembalikan ke 1. Apakah Anda yakin ingin melakukan Reinkarnasi?")) return;

    try {
        await runTransaction(db, async (ts) => {
            // ==========================================
            // FASE 1: BACA SEMUA DATA (GET) LEBIH DULU
            // ==========================================
            const snap = await ts.get(userRef);
            if (!snap.exists()) throw "Data karakter tidak ditemukan!";
            const data = snap.data();

            let guildRef = null;
            let gSnap = null;
            // Baca data Guild JIKA pemain memiliki Guild
            if (data.guildId) {
                guildRef = doc(db, "guilds", data.guildId);
                gSnap = await ts.get(guildRef);
            }

            // ==========================================
            // FASE 2: VALIDASI & KALKULASI LOGIKA
            // ==========================================
            const level = data.level || 1;
            const inv = data.inventory || {};
            const rebirthCount = data.rebirth || 0;

            if (rebirthCount >= 4) {
                throw "Anda sudah mencapai batas kekuatan fana! (Maksimal RW IV)";
            }

            let reqItem = "Item Renkarnasi";
            if (rebirthCount === 1) reqItem = "Item Renkarnasi 2";
            if (rebirthCount === 2) reqItem = "Item Renkarnasi 3";
            if (rebirthCount === 3) reqItem = "Item Renkarnasi 4";

            if (level < 100) throw "Level Anda belum mencapai 100!";
            if (!inv[reqItem] || inv[reqItem] < 1) {
                throw `Gagal! Anda membutuhkan 1x [${reqItem}] di dalam tas untuk tingkat Reinkarnasi ini.`;
            }

            // Potong Item
            inv[reqItem] -= 1;
            if (inv[reqItem] <= 0) delete inv[reqItem];

            // Kalkulasi Keuntungan
            const newRebirth = rebirthCount + 1;
            let currentExpMult = data.expMultiplier || 1.0;
            if (currentExpMult < 1.5) {
                currentExpMult = Math.min(1.5, currentExpMult + 0.1);
            }
            const bonusStat = 50;
            const currentStatPoints = data.statPoints || 0;

            // ==========================================
            // FASE 3: TULIS SEMUA DATA (UPDATE)
            // ==========================================

            // 4. Update Database Karakter
            ts.update(userRef, {
                level: 1,
                exp: 0,
                rebirth: newRebirth,
                expMultiplier: currentExpMult,
                statPoints: currentStatPoints + bonusStat,
                inventory: inv
            });

            // 5. Update Data di dalam Guild
            if (gSnap && gSnap.exists()) {
                const gData = gSnap.data();
                const updatedMembers = gData.members.map(m => {
                    if (m.uid === uid) {
                        return { ...m, level: 1, rebirth: newRebirth };
                    }
                    return m;
                });
                ts.update(guildRef, { members: updatedMembers });
            }
        });

        alert("🎉 SELAMAT! Anda telah berhasil bereinkarnasi. Kekuatan besar kini mengalir di tubuh baru Anda!");

        if (typeof window.togglePanel === 'function') {
            window.togglePanel('panel-profile');
        }

        window.location.reload();

    } catch (err) {
        alert("❌ Reinkarnasi Gagal: " + err);
    }
}