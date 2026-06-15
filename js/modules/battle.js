/* ===================================================
   MODUL BATTLE DUNGEON
   Versi Code: 2.1.0 (Manual Stat System)
   =================================================== */
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
            
            const currentStam = data.currentStamina !== undefined ? data.currentStamina : 100;
            const maxStam = data.maxStamina !== undefined ? data.maxStamina : 100;
            const currentHealth = data.currentHp !== undefined ? data.currentHp : (data.maxHp || 1000);

            if (currentHealth <= 0) throw "Anda sudah mati! Pulihkan HP Anda di Apotek sebelum bertarung.";
            if (currentStam < 10) throw "Stamina tidak cukup! Butuh 10 Stamina untuk bertarung.";

            const playerDmg = Math.max(1, playerStats.patk - monster.def);
            const monsterDmg = Math.max(1, monster.atk - playerStats.def);
            
            const turnsToKill = Math.ceil(monster.hp / playerDmg);
            const hpLost = turnsToKill * monsterDmg;

            let newHp = currentHealth - hpLost;
            let logMessage = "";

            if (newHp <= 0) {
                ts.update(userRef, { currentHp: 0, currentStamina: Math.max(0, currentStam - 10) });
                throw `💀 KEMATIAN! Anda terbunuh oleh ${monster.name} setelah bertarung sengit. Silakan isi HP.`;
            } else {
                let newExp = (data.exp || 0) + monster.rewardExp;
                let newGold = (data.gold || 0) + monster.rewardGold;
                let newLevel = data.level || 1;
                let maxExp = newLevel * 100;
                let inv = data.inventory || {};

                logMessage = `⚔️ MENANG! Membunuh ${monster.name}. Kehilangan ${hpLost} HP. Mendapat ${monster.rewardExp} EXP & ${monster.rewardGold} Gold.`;

                if (Math.random() <= monster.drop.chance) {
                    inv[monster.drop.item] = (inv[monster.drop.item] || 0) + 1;
                    logMessage += `\n🎁 DROP ITEM: Anda mendapatkan [${monster.drop.item}]!`;
                }

                if (newExp >= maxExp) {
                    newLevel += 1;
                    newExp = newExp - maxExp;
                    logMessage += `\n🌟 LEVEL UP! Anda sekarang Level ${newLevel}! Mendapat 5 Poin Stat.`;
                    
                    // PERBAIKAN: Memberikan 5 Poin Stat (Menghentikan penambahan otomatis)
                    ts.update(userRef, {
                        level: newLevel, 
                        exp: newExp, 
                        gold: newGold, 
                        inventory: inv,
                        currentHp: data.maxHp || 1000, 
                        currentStamina: maxStam,
                        statPoints: (data.statPoints || 0) + 5
                    });
                } else {
                    ts.update(userRef, {
                        exp: newExp, gold: newGold, inventory: inv,
                        currentHp: newHp, currentStamina: Math.max(0, currentStam - 10)
                    });
                }
                alert(logMessage);
            }
        });
    } catch (err) {
        alert(err);
    }
}