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

            const vipStats = getVipStats(data.vipLevel || 0);
            const currentStam = data.currentStamina !== undefined ? data.currentStamina : 100;
            const maxStam = (data.maxStamina !== undefined ? data.maxStamina : 100) + (vipStats.extraMaxStamina || 0);

            let stamReq = monster.staminaReq || 5;
            if (playerStats.mountBonus && playerStats.mountBonus.stamDiscount) {
                stamReq = Math.max(1, stamReq - playerStats.mountBonus.stamDiscount);
            }
            if (currentStam < stamReq) throw `Stamina tidak cukup! Butuh ${stamReq} Stamina.`;

            const currentHp = data.currentHp !== undefined ? data.currentHp : playerStats.maxHp;
            if (currentHp <= 0) throw "Anda sudah mati! Minum Ramuan HP terlebih dahulu.";

            let pAtk = playerStats.patk || 10;
            let pMatk = playerStats.matk || 10;
            let pDef = playerStats.def || 5;

            // Damage player vs monster
            let dmgToMonster = Math.max(1, (pAtk + pMatk) - (monster.def || 0));
            let totalHit = Math.ceil(monster.hp / dmgToMonster);

            // Damage monster vs player
            let mAtk = monster.atk || 5;
            let dmgToPlayer = Math.max(1, mAtk - pDef);
            let totalDmgTaken = dmgToPlayer * totalHit;

            // Perhitungan Drop Rate (RNG)
            let isItemDrop = Math.random() <= (monster.dropRate || 0.1);
            let logMessage = "";

            // FIX: Pertahanan nilai EXP dari NaN
            const expGain = monster.exp || 50;
            const goldGain = monster.gold || 100;

            let newHp = Math.max(0, currentHp - totalDmgTaken);

            if (newHp <= 0) {
                // PEMAIN MATI
                const expPenalty = Math.floor(expGain * 0.5);
                let newExpDeath = Math.max(0, (data.exp || 0) - expPenalty);

                ts.update(userRef, {
                    currentHp: 0,
                    exp: newExpDeath,
                    currentStamina: Math.max(0, currentStam - stamReq)
                });
                return `💀 TRAGEDI! Anda terbunuh oleh ${monster.name}!\nKehilangan ${expPenalty} EXP.`;
            } else {
                // PEMAIN MENANG
                logMessage = `⚔️ BERHASIL! Anda mengalahkan ${monster.name}.\nSisa HP: ${newHp}/${playerStats.maxHp}\n🎁 Dapat: ${expGain} EXP & ${goldGain} Gold`;

                let inv = data.inventory || {};
                if (isItemDrop && monster.drops) {
                    let droppedItem = monster.drops[Math.floor(Math.random() * monster.drops.length)];
                    inv[droppedItem] = (inv[droppedItem] || 0) + 1;
                    logMessage += `\n💎 DROP RARE: Mendapatkan [${droppedItem}]!`;
                }

                // Kalkulasi Quest
                const newQuests = getUpdatedQuests(data, 'daily', monsterKey, 1);

                // FIX: Kalkulasi EXP Anti-Stuck & Auto-Heal Level Up
                let newExp = (data.exp || 0) + expGain;
                if (isNaN(newExp)) newExp = expGain; // Bypass jika data sebelumnya rusak/NaN

                let newGold = (data.gold || 0) + goldGain;
                let newLevel = data.level || 1;
                let leveledUp = false;
                let statPointsGained = 0;
                let expNeeded = newLevel * 100; // Rumus: Butuh (Level x 100) EXP untuk naik

                // Proses Level Up
                while (newExp >= expNeeded) {
                    newExp -= expNeeded;      // Kurangi EXP untuk level up (sisanya disimpan)
                    newLevel += 1;            // Naikkan 1 level
                    statPointsGained += 5;    // Tambah 5 poin status
                    leveledUp = true;         // Tandai bahwa pemain berhasil naik level

                    expNeeded = newLevel * 100; // Update target EXP untuk level selanjutnya
                }

                // Masukkan data dasar yang pasti di-update
                let updateData = {
                    exp: newExp,
                    gold: newGold,
                    inventory: inv
                };

                if (leveledUp) {
                    logMessage += `\n🌟 LEVEL UP! Anda sekarang Level ${newLevel}! Mendapat ${statPointsGained} Poin Stat.`;
                    updateData.level = newLevel;
                    updateData.currentHp = playerStats.maxHp || 1000; // FULL HEAL!
                    updateData.currentMp = playerStats.maxMp || 200;
                    updateData.currentStamina = maxStam;
                    updateData.statPoints = (data.statPoints || 0) + statPointsGained;
                } else {
                    updateData.currentHp = newHp;
                    updateData.currentStamina = Math.max(0, currentStam - stamReq);

                    // FIX: Jika sebelumnya stamina penuh, paksa mulai waktu perhitungan mundur
                    if (currentStam >= maxStam) {
                        updateData.lastStaminaUpdate = Date.now();
                    }
                }

                if (newQuests !== undefined && newQuests !== null) updateData.quests = newQuests;
                else if (data.quests !== undefined) updateData.quests = data.quests;

                ts.update(userRef, updateData);
                return logMessage;
            }
        });

        if (resultMsg) {
            const isWin = !resultMsg.includes("terbunuh oleh");
            await sendSoloBattleReport(db, uid, isWin, monster.name, resultMsg);
        }
    } catch (err) { alert(err); }
}