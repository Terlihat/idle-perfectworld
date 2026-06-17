import { doc, setDoc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export async function selectCharacterClass(db, uid, charClass, callback) {
    try {
        const userRef = doc(db, "users", uid);
        
        let baseStats = charClass === 'Warrior' 
            ? { str: 20, con: 15, dex: 5, int: 2, maxHp: 1500, maxMp: 200 }
            : { str: 2, con: 8, dex: 10, int: 25, maxHp: 800, maxMp: 1000 };

        await setDoc(userRef, {
            username: "Hero " + Math.floor(Math.random() * 1000), // Nama default
            characterClass: charClass,
            level: 1,
            exp: 0,
            gold: 500, // Uang saku awal
            coin: 0,
            bankGold: 0,
            currentHp: baseStats.maxHp,
            currentMp: baseStats.maxMp,
            maxHp: baseStats.maxHp,
            maxMp: baseStats.maxMp,
            currentStamina: 100,
            maxStamina: 100,
            str: baseStats.str,
            con: baseStats.con,
            dex: baseStats.dex,
            int: baseStats.int,
            statPoints: 0,
            inventory: {},
            equipment: {},
            quests: { lastReset: "" },
            role: "player"
        }, { merge: true });

        alert(`Berhasil memilih class ${charClass}!`);
        if (callback) callback();
        
    } catch (err) {
        console.error("Gagal membuat karakter:", err);
        alert("Gagal membuat karakter: " + err.message);
    }
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