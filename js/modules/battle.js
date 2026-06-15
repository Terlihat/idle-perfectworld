/* ===================================================
   MODUL BATTLE DUNGEON
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
            
            // PERBAIKAN: Menambahkan fallback nilai untuk akun lama yang belum punya stat stamina/HP
            const currentStam = data.currentStamina !== undefined ? data.currentStamina : 100;
            const maxStam = data.maxStamina !== undefined ? data.maxStamina : 100;
            const currentHealth = data.currentHp !== undefined ? data.currentHp : (data.maxHp || 1000);

            if (currentHealth <= 0) throw "Anda sudah mati! Pulihkan HP Anda di Apotek sebelum bertarung.";
            if (currentStam < 10) throw "Stamina tidak cukup! Butuh 10 Stamina untuk bertarung.";

            // Kalkulasi Pertarungan Instan
            const playerDmg = Math.max(1, playerStats.patk - monster.def);
            const monsterDmg = Math.max(1, monster.atk - playerStats.def);
            
            const turnsToKill = Math.ceil(monster.hp / playerDmg);
            const hpLost = turnsToKill * monsterDmg;

            let newHp = currentHealth - hpLost;
            let logMessage = "";

            if (newHp <= 0) {
                // Pemain Kalah (Minus HP & Stamina)
                ts.update(userRef, { currentHp: 0, currentStamina: Math.max(0, currentStam - 10) });
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
                    
                    // Bonus Level Up & Restore
                    ts.update(userRef, {
                        level: newLevel, exp: newExp, gold: newGold, inventory: inv,
                        currentHp: data.maxHp || 1000, currentStamina: maxStam,
                        str: (data.str || 0) + 2, con: (data.con || 0) + 2, dex: (data.dex || 0) + 2, int: (data.int || 0) + 2 
                    });
                } else {
                    // Update biasa saat menang tanpa naik level
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