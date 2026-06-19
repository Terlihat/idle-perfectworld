/* ===================================================
   MODUL BATTLE DUNGEON (Fix Death Rollback + VIP Engine)
   =================================================== */
import { doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { MONSTER_DB } from '../data/monsters.js';
import { getUpdatedQuests } from './quest.js'; 
import { getVipStats } from './vip.js';
import { sendSoloBattleReport } from './mailbox.js';

export async function attackMonster(db, uid, monsterKey, playerStats) {
    if (!uid) return;
    const monster = MONSTER_DB[monsterKey];
    if (!monster) return alert("Monster tidak ditemukan!");

    if ((playerStats.level || 1) < monster.levelReq) {
        return alert(`Level Anda belum cukup! Butuh Level ${monster.levelReq} untuk melawan ${monster.name}.`);
    }

    const userRef = doc(db, "users", uid);

    try {
        const resultMsg = await runTransaction(db, async (ts) => {
            const data = (await ts.get(userRef)).data();
            
            // --- VIP ENGINE: Kalkulasi Stamina ---
            const vipStats = getVipStats(data.vipLevel || 0);
            
            const currentStam = data.currentStamina !== undefined ? data.currentStamina : 100;
            const maxStam = (data.maxStamina !== undefined ? data.maxStamina : 100) + (vipStats.extraMaxStamina || 0);
            const currentHealth = data.currentHp !== undefined ? data.currentHp : playerStats.maxHp;

            const mount = playerStats.equipment?.mount || null;
            const stamReq = Math.max(1, 10 - (mount?.stamDiscount || 0)); 
            const goldMult = 1 + (mount?.goldBonus || 0); 

            if (currentHealth <= 0) return "Anda sudah mati! Pulihkan HP Anda di Apotek sebelum bertarung.";
            if (currentStam < stamReq) return `Stamina tidak cukup! Butuh ${stamReq} Stamina (Efek Mount).`;

            const playerDmg = Math.max(1, playerStats.patk - monster.def);
            const monsterDmg = Math.max(1, monster.atk - playerStats.def);
            
            const turnsToKill = Math.ceil(monster.hp / playerDmg);
            const hpLost = turnsToKill * monsterDmg;

            let newHp = currentHealth - hpLost;
            let logMessage = "";

            if (newHp <= 0) {
                ts.update(userRef, { currentHp: 0, currentStamina: Math.max(0, currentStam - stamReq) });
                return `☠️ KEMATIAN! Anda terbunuh oleh ${monster.name} setelah bertarung sengit. Silakan isi HP.`;
            } else {
                // --- VIP ENGINE: Kalkulasi Hadiah ---
                let baseExp = monster.rewardExp;
                let baseGold = Math.floor(monster.rewardGold * goldMult);
                
                let bonusExp = Math.floor(baseExp * (vipStats.expBonusPct / 100));
                let bonusGold = Math.floor(baseGold * (vipStats.goldBonusPct / 100));
                
                let finalExp = baseExp + bonusExp;
                let finalGold = baseGold + bonusGold;
                
                let newExp = (data.exp || 0) + finalExp;
                let newGold = (data.gold || 0) + finalGold;
                
                let newLevel = data.level || 1;
                let inv = data.inventory || {};
                
                let newQuests = getUpdatedQuests(data, 'daily', monsterKey, 1);

                logMessage = `⚔️ MENANG! Membunuh ${monster.name}.\nKehilangan ${hpLost} HP. Mendapat ${finalExp} EXP & ${finalGold} Gold.`;
                
                if (mount) logMessage += `\n🐎 [Efek Mount] Stamina hemat ${mount.stamDiscount}, Bonus Gold +${(mount.goldBonus*100)}%!`;
                if (bonusExp > 0 || bonusGold > 0) logMessage += `\n✨ [SULTAN VIP] Bonus +${bonusExp} EXP & +${bonusGold} Gold!`;

                if (Math.random() <= monster.drop.chance) {
                    inv[monster.drop.item] = (inv[monster.drop.item] || 0) + 1;
                    logMessage += `\n🎁 DROP ITEM: Anda mendapatkan [${monster.drop.item}]!`;
                }

                let statPointsGained = 0;
                let leveledUp = false;
                while (newExp >= newLevel * 100) {
                    newExp -= (newLevel * 100);
                    newLevel += 1;
                    statPointsGained += 5;
                    leveledUp = true;
                }

                let updateData = {
                    exp: newExp, 
                    gold: newGold, 
                    inventory: inv
                };

                if (leveledUp) {
                    logMessage += `\n🌟 LEVEL UP MULTIPLE! Anda sekarang Level ${newLevel}! Mendapat ${statPointsGained} Poin Stat.`;
                    updateData.level = newLevel;
                    updateData.currentHp = playerStats.maxHp;
                    updateData.currentStamina = maxStam; // Stamina terisi max berdasarkan VIP!
                    updateData.statPoints = (data.statPoints || 0) + statPointsGained;
                } else {
                    updateData.currentHp = newHp;
                    updateData.currentStamina = Math.max(0, currentStam - stamReq);
                }

                if (newQuests !== undefined && newQuests !== null) {
                    updateData.quests = newQuests;
                } else if (data.quests !== undefined) {
                    updateData.quests = data.quests; 
                }

                ts.update(userRef, updateData);
                return logMessage;
            }
        });
        
        if (resultMsg) {
            const isWin = !resultMsg.includes("terbunuh oleh"); 
            await sendSoloBattleReport(db, uid, isWin, monster.name, resultMsg);
            // alert(resultMsg); // <-- Matikan alert agar log hanya muncul di Mailbox
        }

    } catch (err) { alert(err); }
}