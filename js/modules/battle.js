import { doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { MONSTER_DB } from '../data/monsters.js';

export async function attackMonster(db, uid, monsterKey, playerStats) {
    if (!uid) return;
    const monster = MONSTER_DB[monsterKey];
    if (!monster) return alert("Monster tidak ditemukan!");

    if ((playerStats.level || 1) < monster.levelReq) {
        return alert(`Level Anda belum cukup! Butuh Level ${monster.levelReq} untuk melawan ${monster.name}.`);
    }

    const userRef = doc(db, "users", uid);

    try {
        await runTransaction(db, async (ts) => {
            const data = (await ts.get(userRef)).data();
            
            if (data.currentHp <= 0) throw "Anda sudah mati! Pulihkan HP Anda di Apotek sebelum bertarung.";
            if ((data.currentStamina || 0) < 10) throw "Stamina tidak cukup! Butuh 10 Stamina untuk bertarung.";

            // Kalkulasi Pertarungan Instan
            const playerDmg = Math.max(1, playerStats.patk - monster.def); // Bisa diubah ke logic (patk/matk)
            const monsterDmg = Math.max(1, monster.atk - playerStats.def);
            
            const turnsToKill = Math.ceil(monster.hp / playerDmg);
            const hpLost = turnsToKill * monsterDmg;

            let newHp = data.currentHp - hpLost;
            let logMessage = "";

            if (newHp <= 0) {
                // Pemain Kalah
                ts.update(userRef, { currentHp: 0, currentStamina: data.currentStamina - 10 });
                throw `💀 KEMATIAN! Anda terbunuh oleh ${monster.name} setelah bertarung sengit. Silakan isi HP.`;
            } else {
                // Pemain Menang
                let newExp = (data.exp || 0) + monster.rewardExp;
                let newGold = (data.gold || 0) + monster.rewardGold;
                let newLevel = data.level || 1;
                let maxExp = newLevel * 100;
                let inv = data.inventory || {};

                logMessage = `⚔️ MENANG! Membunuh ${monster.name}. Kehilangan ${hpLost} HP. Mendapat ${monster.rewardExp} EXP & ${monster.rewardGold} Gold.`;

                // Cek Drop Item
                if (Math.random() <= monster.drop.chance) {
                    inv[monster.drop.item] = (inv[monster.drop.item] || 0) + 1;
                    logMessage += `\n🎁 DROP ITEM: Anda mendapatkan [${monster.drop.item}]!`;
                }

                // Cek Level Up
                if (newExp >= maxExp) {
                    newLevel += 1;
                    newExp = newExp - maxExp;
                    logMessage += `\n🌟 LEVEL UP! Anda sekarang Level ${newLevel}!`;
                    // Bonus Level Up
                    ts.update(userRef, {
                        level: newLevel, exp: newExp, gold: newGold, inventory: inv,
                        currentHp: data.maxHp, currentStamina: data.maxStamina, // Full restore
                        str: data.str + 2, con: data.con + 2, dex: data.dex + 2, int: data.int + 2 // Bonus stat
                    });
                } else {
                    ts.update(userRef, {
                        exp: newExp, gold: newGold, inventory: inv,
                        currentHp: newHp, currentStamina: data.currentStamina - 10
                    });
                }
                alert(logMessage);
            }
        });
    } catch (err) {
        alert(err);
    }
}