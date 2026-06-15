/* ===================================================
   MODUL BATTLE DUNGEON (Dengan Tracker Quest)
   =================================================== */
import { doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { MONSTER_DB } from '../data/monsters.js';
import { getUpdatedQuests } from './quest.js'; // IMPORT LOGIKA QUEST

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

            const mount = playerStats.equipment?.mount || null;
            const stamReq = Math.max(1, 10 - (mount?.stamDiscount || 0)); 
            const goldMult = 1 + (mount?.goldBonus || 0); 

            if (currentHealth <= 0) throw "Anda sudah mati! Pulihkan HP Anda di Apotek sebelum bertarung.";
            if (currentStam < stamReq) throw `Stamina tidak cukup! Butuh ${stamReq} Stamina (Efek Mount).`;

            const playerDmg = Math.max(1, playerStats.patk - monster.def);
            const monsterDmg = Math.max(1, monster.atk - playerStats.def);
            
            const turnsToKill = Math.ceil(monster.hp / playerDmg);
            const hpLost = turnsToKill * monsterDmg;

            let newHp = currentHealth - hpLost;
            let logMessage = "";

            if (newHp <= 0) {
                ts.update(userRef, { currentHp: 0, currentStamina: Math.max(0, currentStam - stamReq) });
                throw `💀 KEMATIAN! Anda terbunuh oleh ${monster.name} setelah bertarung sengit. Silakan isi HP.`;
            } else {
                let newExp = (data.exp || 0) + monster.rewardExp;
                let rewardGoldAkhir = Math.floor(monster.rewardGold * goldMult);
                let newGold = (data.gold || 0) + rewardGoldAkhir;
                
                let newLevel = data.level || 1;
                let maxExp = newLevel * 100;
                let inv = data.inventory || {};
                
                // --- PENGHITUNGAN PROGRESS MISI HARIAN (SOLO) ---
                let newQuests = getUpdatedQuests(data, 'daily', monsterKey, 1);

                logMessage = `⚔️ MENANG! Membunuh ${monster.name}. Kehilangan ${hpLost} HP. Mendapat ${monster.rewardExp} EXP & ${rewardGoldAkhir} Gold.`;
                if (mount) logMessage += `\n🐴 [Efek Mount] Stamina hemat ${mount.stamDiscount}, Bonus Gold +${(mount.goldBonus*100)}%!`;

                if (Math.random() <= monster.drop.chance) {
                    inv[monster.drop.item] = (inv[monster.drop.item] || 0) + 1;
                    logMessage += `\n🎁 DROP ITEM: Anda mendapatkan [${monster.drop.item}]!`;
                }

                if (newExp >= maxExp) {
                    newLevel += 1;
                    newExp = newExp - maxExp;
                    logMessage += `\n🌟 LEVEL UP! Anda sekarang Level ${newLevel}! Mendapat 5 Poin Stat.`;
                    
                    ts.update(userRef, {
                        level: newLevel, exp: newExp, gold: newGold, inventory: inv,
                        currentHp: data.maxHp || 1000, currentStamina: maxStam,
                        statPoints: (data.statPoints || 0) + 5,
                        quests: newQuests // Update Misi
                    });
                } else {
                    ts.update(userRef, {
                        exp: newExp, gold: newGold, inventory: inv,
                        currentHp: newHp, currentStamina: Math.max(0, currentStam - stamReq),
                        quests: newQuests // Update Misi
                    });
                }
                alert(logMessage);
            }
        });
    } catch (err) { alert(err); }
}