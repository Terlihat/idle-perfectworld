/* ===================================================
   MODUL KARAKTER (Class, Stats, & Auto Stamina)
   =================================================== */
import { doc, getDoc, updateDoc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export async function selectCharacterClass(db, uid, className, callback) {
    if (!uid) return;
    const userRef = doc(db, "users", uid);
    try {
        let stats = { characterClass: className, level: 1, exp: 0, gold: 1000, coin: 0, statPoints: 0 };
        if (className === 'Warrior') { stats.str = 15; stats.con = 20; stats.dex = 5; stats.int = 2; }
        else if (className === 'Mage') { stats.str = 2; stats.con = 8; stats.dex = 10; stats.int = 25; }
        
        stats.maxHp = 1000; stats.currentHp = 1000;
        stats.maxMp = 200; stats.currentMp = 200;
        stats.maxStamina = 100; stats.currentStamina = 100;
        
        // Catat waktu awal pembuatan karakter
        stats.lastStaminaUpdate = Date.now();
        
        await updateDoc(userRef, stats);
        if(callback) callback();
    } catch (err) { alert(err); }
}

export async function addCharacterStat(db, uid, statName) {
    const userRef = doc(db, "users", uid);
    try {
        await runTransaction(db, async (ts) => {
            const d = (await ts.get(userRef)).data();
            if (d.statPoints > 0) {
                let updates = { statPoints: d.statPoints - 1 };
                updates[statName] = (d[statName] || 0) + 1;
                ts.update(userRef, updates);
            }
        });
    } catch (err) { console.error(err); }
}

// ===================================================
// SISTEM REGENERASI STAMINA ABSOLUT (OFFLINE & ONLINE)
// ===================================================
export function startStaminaRegeneration(db, uid) {
    if (!uid) return null;
    const userRef = doc(db, "users", uid);

    // 1. KALKULASI OFFLINE (Berjalan instan saat pemain baru login)
    getDoc(userRef).then((snap) => {
        if (snap.exists()) {
            const data = snap.data();
            const maxStam = data.maxStamina || 100;
            let currentStam = data.currentStamina !== undefined ? data.currentStamina : 100;
            const now = Date.now();

            if (data.lastStaminaUpdate) {
                const diffMs = now - data.lastStaminaUpdate;
                const diffMinutes = Math.floor(diffMs / 60000); // 1 Stamina = 1 Menit (60,000 ms)

                if (diffMinutes > 0 && currentStam < maxStam) {
                    currentStam = Math.min(maxStam, currentStam + diffMinutes);
                    // Simpan sisa milidetik agar perhitungan online selanjutnya tidak "terpotong"
                    const newUpdateTime = data.lastStaminaUpdate + (diffMinutes * 60000);
                    updateDoc(userRef, { currentStamina: currentStam, lastStaminaUpdate: newUpdateTime });
                }
            } else {
                // Jika player belum punya data waktu, buat baru
                updateDoc(userRef, { lastStaminaUpdate: now });
            }
        }
    });

    // 2. KALKULASI ONLINE (Berjalan konstan di background tiap menit)
    return setInterval(async () => {
        try {
            const snap = await getDoc(userRef);
            if (snap.exists()) {
                const data = snap.data();
                const maxStam = data.maxStamina || 100;
                let currentStam = data.currentStamina !== undefined ? data.currentStamina : 100;
                const now = Date.now();
                
                if (currentStam < maxStam) {
                    // Gunakan perhitungan selisih agar kebal terhadap lag atau tab browser yang "tertidur"
                    const lastUpdate = data.lastStaminaUpdate || now;
                    const diffMs = now - lastUpdate;
                    const diffMinutes = Math.floor(diffMs / 60000);

                    if (diffMinutes > 0) {
                        const newStam = Math.min(maxStam, currentStam + diffMinutes);
                        const newUpdateTime = lastUpdate + (diffMinutes * 60000);
                        await updateDoc(userRef, { currentStamina: newStam, lastStaminaUpdate: newUpdateTime });
                    }
                } else {
                    // Jika stamina sudah penuh, tarik "lastUpdate" ke waktu sekarang 
                    // agar tidak terjadi ledakan stamina ganda saat nanti terpakai
                    await updateDoc(userRef, { lastStaminaUpdate: now });
                }
            }
        } catch (err) { console.error("Gagal sinkronisasi stamina:", err); }
    }, 60000); // Interval 60 detik
}