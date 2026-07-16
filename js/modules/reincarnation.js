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
            const snap = await ts.get(userRef);
            if (!snap.exists()) throw "Data karakter tidak ditemukan!";
            const data = snap.data();

            const level = data.level || 1;
            const inv = data.inventory || {};
            const rebirthCount = data.rebirth || 0; // Hitungan rebirth saat ini

            // 1. Cek Persyaratan
            if (level < 100) throw "Level Anda belum mencapai 100!";
            if (!inv["Item Renkarnasi"] || inv["Item Renkarnasi"] < 1) {
                throw "Anda tidak memiliki [Item Renkarnasi] di dalam tas!";
            }

            // 2. Potong Item Renkarnasi
            inv["Item Renkarnasi"] -= 1;
            if (inv["Item Renkarnasi"] <= 0) delete inv["Item Renkarnasi"];

            // 3. Kalkulasi Keuntungan
            const newRebirth = rebirthCount + 1;

            // Pengali EXP (Mulai dari 1.0, tambah 0.1 tiap rebirth, mentok di 1.5)
            let currentExpMult = data.expMultiplier || 1.0;
            if (currentExpMult < 1.5) {
                currentExpMult = Math.min(1.5, currentExpMult + 0.1);
            }

            // Bonus Stat (Misal: 50 poin stat untuk didistribusikan)
            const bonusStat = 50;
            const currentStatPoints = data.statPoints || 0;

            // 4. Update Database (Reset Level ke 1)
            ts.update(userRef, {
                level: 1,
                exp: 0,
                rebirth: newRebirth,
                expMultiplier: currentExpMult,
                statPoints: currentStatPoints + bonusStat,
                inventory: inv
            });
        });

        alert("🎉 SELAMAT! Anda telah berhasil bereinkarnasi. Kekuatan besar kini mengalir di tubuh baru Anda!");

        // Tutup panel dan arahkan pemain kembali ke profil
        if (typeof window.togglePanel === 'function') {
            window.togglePanel('panel-profile');
        }

        window.location.reload();

    } catch (err) {
        alert("❌ Reinkarnasi Gagal: " + err);
    }
}