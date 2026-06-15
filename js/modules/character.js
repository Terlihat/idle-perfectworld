/* ===================================================
   MODUL KARAKTER, STAT, & STAMINA
   Versi Code: 2.1.1 (Modularisasi Penuh)
   =================================================== */
import { doc, setDoc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// 1. BUAT KARAKTER BARU (STARTER PACK)
export async function selectCharacterClass(db, uid, className, callbackSuccess) {
    if (!uid) return;
    const userRef = doc(db, "users", uid);
    let stats = { str: 0, con: 0, dex: 0, int: 0 };
    if (className === 'Warrior') { stats = { str: 15, con: 20, dex: 5, int: 2 }; } 
    else if (className === 'Mage') { stats = { str: 2, con: 8, dex: 10, int: 25 }; }

    const maxHp = 1000 + (stats.con * 50); 
    const maxMp = 200 + (stats.int * 30);
    const maxStamina = 100;

    try {
        await setDoc(userRef, {
            username: "Hero_" + uid.substring(0, 4), 
            characterClass: className,
            level: 1, exp: 0, gold: 2000, coin: 0, bankGold: 0, 
            inventory: { "Tiket Ganti Nama": 1 }, 
            equipment: { weapon: null, armor: null, accessory: null },
            ...stats, 
            statPoints: 0,         
            maxHp: maxHp, currentHp: maxHp, 
            maxMp: maxMp, currentMp: maxMp, 
            maxStamina: maxStamina, currentStamina: maxStamina, 
            lastAction: 0
        });
        callbackSuccess();
    } catch (err) { alert("Pendaftaran Gagal: " + err); }
}

// 2. PENAMBAHAN STAT MANUAL
export async function addCharacterStat(db, uid, statName) {
    if (!uid) return;
    const userRef = doc(db, "users", uid);
    try {
        await runTransaction(db, async (ts) => {
            const snap = await ts.get(userRef);
            if (!snap.exists()) return;
            const data = snap.data();
            
            if ((data.statPoints || 0) <= 0) throw "Tidak ada Poin Stat tersisa!";
            
            let updates = { statPoints: data.statPoints - 1 };
            updates[statName] = (data[statName] || 0) + 1;
            
            if (statName === 'con') {
                updates.maxHp = (data.maxHp || 1000) + 50;
                updates.currentHp = (data.currentHp || 1000) + 50;
            } else if (statName === 'int') {
                updates.maxMp = (data.maxMp || 200) + 30;
                updates.currentMp = (data.currentMp || 200) + 30;
            }
            
            ts.update(userRef, updates);
        });
    } catch(err) { alert(err); }
}

// 3. REGENERASI STAMINA OTOMATIS Latar Belakang
export function startStaminaRegeneration(db, uid) {
    return setInterval(async () => {
        if (!uid) return;
        const userRef = doc(db, "users", uid);
        try {
            await runTransaction(db, async (ts) => {
                const snap = await ts.get(userRef);
                if (!snap.exists()) return;
                const d = snap.data();
                if ((d.currentStamina || 0) < (d.maxStamina || 100)) {
                    ts.update(userRef, { currentStamina: (d.currentStamina || 0) + 1 });
                }
            });
        } catch (err) { console.error("Regen stamina error:", err); }
    }, 60000); // 1 Menit
}