/* ===================================================
   MODUL KARAKTER & STARTER PACK
   =================================================== */
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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
            level: 1, 
            exp: 0, 
            gold: 2000,           // PERBAIKAN: Set ke 2,000 Gold untuk pemain baru
            coin: 0,              // PERBAIKAN: Set ke 0 Coin untuk pemain baru
            bankGold: 0, 
            inventory: { 
                "Tiket Ganti Nama": 1 // PERBAIKAN: Hadiah awal Tiket Ganti Nama wajib
            }, 
            equipment: { weapon: null, armor: null, accessory: null },
            ...stats, 
            maxHp: maxHp, 
            currentHp: maxHp, 
            maxMp: maxMp, 
            currentMp: maxMp, 
            maxStamina: maxStamina, 
            currentStamina: maxStamina, 
            lastAction: 0
        });
        callbackSuccess();
    } catch (err) { alert("Pendaftaran Gagal: " + err); }
}