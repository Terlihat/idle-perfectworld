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

            // 🔥 LOGIKA BARU: Penentuan Syarat Item berdasarkan tingkat Rebirth saat ini
            if (rebirthCount >= 4) {
                throw "Anda sudah mencapai batas kekuatan fana! (Maksimal RW IV)";
            }

            // Tentukan nama item yang dicari oleh sistem
            let reqItem = "Item Renkarnasi"; // Default untuk masuk ke RW 1
            if (rebirthCount === 1) reqItem = "Item Renkarnasi 2"; // Untuk masuk ke RW 2
            if (rebirthCount === 2) reqItem = "Item Renkarnasi 3"; // Untuk masuk ke RW 3
            if (rebirthCount === 3) reqItem = "Item Renkarnasi 4"; // Untuk masuk ke RW 4

            // 1. Cek Persyaratan
            if (level < 100) throw "Level Anda belum mencapai 100!";
            if (!inv[reqItem] || inv[reqItem] < 1) {
                // Pesan error sekarang dinamis memberi tahu item spesifik yang kurang
                throw `Gagal! Anda membutuhkan 1x [${reqItem}] di dalam tas untuk tingkat Reinkarnasi ini.`;
            }

            // 2. Potong Item Renkarnasi yang sesuai
            inv[reqItem] -= 1;
            if (inv[reqItem] <= 0) delete inv[reqItem];

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