import { doc, getDoc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getUpdatedQuests } from './quest.js';
import { getVipStats } from './vip.js';
import { sendSoloBattleReport } from './mailbox.js';

export async function attackMonster(db, uid, monsterKey, playerStats) {
    if (!uid) return;

    // 🔥 LOGIKA BARU 1: Tarik Data Monster Langsung dari Database Server
    const monsterRef = doc(db, "monsters", monsterKey);
    const monsterSnap = await getDoc(monsterRef);

    if (!monsterSnap.exists()) {
        return alert(`Data Monster [${monsterKey}] tidak ditemukan di Server! Pastikan Admin sudah membuat atau melakukan Sync monster ini.`);
    }

    const monster = monsterSnap.data();

    // Pengecekan Level (Sifatnya opsional, pastikan di Admin Panel Anda menambahkan field levelReq jika perlu)
    if ((playerStats.level || 1) < (monster.levelReq || 1)) {
        return alert(`Level Anda belum cukup! Butuh Level ${monster.levelReq || 1} untuk melawan ${monster.name}.`);
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

            // Pertahanan nilai EXP dari NaN
            const expGain = monster.expReward || monster.exp || 50;
            const goldGain = monster.goldReward || monster.gold || 100;

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
                let logMessage = `⚔️ BERHASIL! Anda mengalahkan ${monster.name}.\nSisa HP: ${newHp}/${playerStats.maxHp}\n🌟 Dapat: ${expGain} EXP & ${goldGain} Gold`;

                let inv = data.inventory || {};

                // 🔥 LOGIKA BARU 2: Sistem RNG Drop Multi-Item Berdasarkan Persentase Admin
                let obtainedDrops = [];
                if (monster.drops && monster.drops.length > 0) {
                    monster.drops.forEach(drop => {
                        const roll = Math.random() * 100; // Kocok dadu 0.00 - 100.00
                        if (roll <= drop.chance) {
                            obtainedDrops.push(drop.item);
                        }
                    });
                }

                // Masukkan item ke tas jika ada yang didapat
                if (obtainedDrops.length > 0) {
                    obtainedDrops.forEach(item => {
                        inv[item] = (inv[item] || 0) + 1;
                    });
                    logMessage += `\n🎁 DROP RARE: Mendapatkan [${obtainedDrops.join(', ')}]!`;
                }

                // Kalkulasi Quest
                const newQuests = getUpdatedQuests(data, 'daily', monsterKey, 1);

                // Kalkulasi EXP Anti-Stuck & Auto-Heal Level Up
                let newExp = (data.exp || 0) + expGain;
                if (isNaN(newExp)) newExp = expGain;

                let newGold = (data.gold || 0) + goldGain;
                let newLevel = data.level || 1;
                let leveledUp = false;
                let statPointsGained = 0;
                let expNeeded = newLevel * 100;

                // Proses Level Up
                while (newExp >= expNeeded) {
                    newExp -= expNeeded;
                    newLevel += 1;
                    statPointsGained += 5;
                    leveledUp = true;

                    expNeeded = newLevel * 100;
                }

                let updateData = {
                    exp: newExp,
                    gold: newGold,
                    inventory: inv
                };

                if (leveledUp) {
                    logMessage += `\n🎉 LEVEL UP! Anda sekarang Level ${newLevel}! Mendapat ${statPointsGained} Poin Stat.`;
                    updateData.level = newLevel;
                    updateData.currentHp = playerStats.maxHp || 1000;
                    updateData.currentMp = playerStats.maxMp || 200;
                    updateData.currentStamina = maxStam;
                    updateData.statPoints = (data.statPoints || 0) + statPointsGained;
                } else {
                    updateData.currentHp = newHp;
                    updateData.currentStamina = Math.max(0, currentStam - stamReq);

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
    } catch (err) {
        alert(err);
    }
}