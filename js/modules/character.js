import { doc, setDoc, getDoc, runTransaction, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getVipStats } from './vip.js';

let isUpdatingStat = false;

export async function selectCharacterClass(db, uid, charClass, callback) {
    try {
        const userRef = doc(db, "users", uid);

        let baseStats = charClass === 'Warrior'
            ? { str: 20, con: 15, dex: 5, int: 2, maxHp: 1500, maxMp: 200 }
            : { str: 2, con: 8, dex: 10, int: 25, maxHp: 800, maxMp: 1000 };

        await setDoc(userRef, {
            username: "Hero " + Math.floor(Math.random() * 1000),
            characterClass: charClass,
            level: 1,
            exp: 0,
            vipLevel: 0,
            vipExp: 0,
            gold: 0,
            coin: 0,
            bankGold: 0,
            str: baseStats.str,
            con: baseStats.con,
            dex: baseStats.dex,
            int: baseStats.int,
            currentHp: baseStats.maxHp,
            currentMp: baseStats.maxMp,
            maxHp: baseStats.maxHp,
            maxMp: baseStats.maxMp,
            currentStamina: 100,
            maxStamina: 100,
            lastStaminaUpdate: Date.now(),
            inventory: { "Pedang Besi": 1, "Ramuan HP": 5 },
            bankInventory: {},
            equipment: { weapon: null, armor: null, accessory: null },
            statPoints: 0,
            pkKills: 0,
            inPkZone: false,
            quests: null
        });

        if (callback) callback();
    } catch (err) { alert(err); }
}

export async function addCharacterStat(db, uid, statName) {
    if (isUpdatingStat) return;
    isUpdatingStat = true;

    try {
        const userRef = doc(db, "users", uid);
        await runTransaction(db, async (ts) => {
            const data = (await ts.get(userRef)).data();
            if ((data.statPoints || 0) <= 0) throw "Poin Stat tidak cukup!";

            let updates = { statPoints: data.statPoints - 1 };
            updates[statName] = (data[statName] || 0) + 1;
            ts.update(userRef, updates);
        });
    } catch (err) {
        window.rpgAlert(err, "Gagal");
    } finally {
        setTimeout(() => { isUpdatingStat = false; }, 300);
    }
}

export function startStaminaRegeneration(db, uid) {
    if (!uid) return;
    const userRef = doc(db, "users", uid);

    const syncStamina = async () => {
        try {
            const snap = await getDoc(userRef);
            if (snap.exists()) {
                const data = snap.data();

                const vipStats = getVipStats(data.vipLevel || 0);
                const maxStam = (data.maxStamina || 100) + (vipStats.extraMaxStamina || 0);
                let currentStam = data.currentStamina !== undefined ? data.currentStamina : maxStam;

                if (currentStam >= maxStam) {
                    return;
                }

                const now = Date.now();
                let lastUpdate = data.lastStaminaUpdate;

                if (!lastUpdate) {
                    lastUpdate = now;
                    await updateDoc(userRef, { lastStaminaUpdate: now });
                    return;
                }

                const diffMs = now - lastUpdate;

                if (diffMs < 0) {
                    await updateDoc(userRef, { lastStaminaUpdate: now });
                    return;
                }

                const diffMinutes = Math.floor(diffMs / 60000); // 1 Stamina = 1 Menit

                if (diffMinutes > 0) {
                    const newStam = Math.min(maxStam, currentStam + diffMinutes);
                    const newUpdateTime = lastUpdate + (diffMinutes * 60000);

                    await updateDoc(userRef, { currentStamina: newStam, lastStaminaUpdate: newUpdateTime });
                }
            }
        } catch (err) { console.error("Gagal sinkronisasi stamina:", err); }
    };

    syncStamina();
    return setInterval(syncStamina, 60000);
}

// FITUR BARU: Minum Ramuan (DENGAN PROTEKSI ITEM)
export async function consumePotion(db, uid, itemName, playerMaxHp, playerMaxMp) {
    const consumableItems = ["Ramuan HP", "Ramuan MP"];

    if (!consumableItems.includes(itemName)) {
        window.rpgAlert(`[${itemName}] tidak bisa digunakan secara langsung dari tas.`, "Info Item");
        return false;
    }

    const userRef = doc(db, "users", uid);
    try {
        await runTransaction(db, async (ts) => {
            const data = (await ts.get(userRef)).data();
            let inv = data.inventory || {};

            if (!inv[itemName] || inv[itemName] < 1) throw `Anda tidak memiliki ${itemName} di tas.`;

            let currentHp = data.currentHp || 0;
            let currentMp = data.currentMp || 0;
            let maxHp = playerMaxHp || data.maxHp || 1000;
            let maxMp = playerMaxMp || data.maxMp || 200;

            if (itemName === "Ramuan HP") {
                if (currentHp >= maxHp) throw "HP Anda masih penuh!";
                currentHp = maxHp;
            } else if (itemName === "Ramuan MP") {
                if (currentMp >= maxMp) throw "MP Anda masih penuh!";
                currentMp = maxMp;
            }

            inv[itemName] -= 1;
            if (inv[itemName] <= 0) delete inv[itemName];

            ts.update(userRef, { inventory: inv, currentHp: currentHp, currentMp: currentMp });
        });
        return true;
    } catch (err) {
        window.rpgAlert(err, "Inventaris");
        return false;
    }
}