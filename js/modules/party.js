/* ===================================================
   MODUL PARTY DUNGEON (Fix Level Up Check, VIP Engine, & Gacha Drop)
   =================================================== */
import { collection, doc, runTransaction, query, where, getDocs, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { FB_BOSSES } from '../data/monsters.js';
import { getUpdatedQuests } from './quest.js'; 
import { getVipStats } from './vip.js';
import { sendPartyBattleReport } from './mailbox.js';

export function listenToParties(db, callbackRender) {
    const q = query(collection(db, "parties"));
    return onSnapshot(q, (snapshot) => {
        let parties = [];
        snapshot.forEach((docSnap) => parties.push({ id: docSnap.id, ...docSnap.data() }));
        callbackRender(parties);
    });
}

export async function createOrJoinParty(db, fbKey, playerStats) {
    if (!playerStats.uid) return;
    const boss = FB_BOSSES[fbKey];
    if (!boss) return console.error("Dungeon tidak valid!");
    if (playerStats.level < boss.levelReq) return console.error(`Level Anda belum cukup! Butuh Level ${boss.levelReq}.`);
    
    const mount = playerStats.equipment?.mount || null;
    const stamReq = Math.max(1, 20 - (mount?.stamDiscount || 0));
    if (playerStats.currentStamina < stamReq) return console.error(`Butuh minimal ${stamReq} Stamina (Efek Mount) untuk masuk FB!`);

    const partiesRef = collection(db, "parties");
    const q = query(partiesRef, where("fbKey", "==", fbKey), where("status", "==", "waiting"));

    try {
        const snap = await getDocs(q);
        let targetPartyId = null;
        
        for (let d of snap.docs) {
            if (d.data().members.length < 4) {
                targetPartyId = d.id;
                break;
            }
        }

        if (targetPartyId) {
            const pRef = doc(db, "parties", targetPartyId);
            await runTransaction(db, async (ts) => {
                const pSnap = await ts.get(pRef);
                if (!pSnap.exists()) throw "Party sudah dibubarkan.";
                let pData = pSnap.data();
                
                if (pData.members.find(m => m.uid === playerStats.uid)) throw "Anda sudah berada di dalam Party ini!";
                if (pData.members.length >= 4) throw "Party sudah penuh!";
                
                let newMembers = [...pData.members, { uid: playerStats.uid, username: playerStats.username, level: playerStats.level, patk: playerStats.patk, matk: playerStats.matk, def: playerStats.def }];
                ts.update(pRef, { members: newMembers });
            });
        } else {
            const newPartyRef = doc(partiesRef);
            await runTransaction(db, async (ts) => {
                ts.set(newPartyRef, { 
                    fbKey: fbKey, fbName: boss.name, leaderId: playerStats.uid, leaderName: playerStats.username, status: 'waiting', timestamp: serverTimestamp(),
                    members: [{ uid: playerStats.uid, username: playerStats.username, level: playerStats.level, patk: playerStats.patk, matk: playerStats.matk, def: playerStats.def }] 
                });
            });
        }
    } catch (err) { console.error(err); }
}

export async function leaveParty(db, partyId, uid) {
    const partyRef = doc(db, "parties", partyId);
    try {
        await runTransaction(db, async (ts) => {
            const snap = await ts.get(partyRef);
            if (!snap.exists()) return;
            const data = snap.data();
            const newMembers = data.members.filter(m => m.uid !== uid);
            
            if (newMembers.length === 0) { ts.delete(partyRef); } 
            else if (data.leaderId === uid) { ts.update(partyRef, { members: newMembers, leaderId: newMembers[0].uid, leaderName: newMembers[0].username }); } 
            else { ts.update(partyRef, { members: newMembers }); }
        });
    } catch (err) { console.error(err); }
}

export async function startFbBattle(db, leaderUid, partyId) {
    if (!partyId) return;
    const partyRef = doc(db, "parties", partyId);

    try {
        const resultMsg = await runTransaction(db, async (ts) => {
            const pSnap = await ts.get(partyRef);
            if (!pSnap.exists()) throw "Party tidak ditemukan.";
            const party = pSnap.data();

            if (party.leaderId !== leaderUid) throw "Hanya Ketua yang bisa memulai FB!";
            if (party.members.length < 2) throw "Minimal butuh 2 orang untuk memulai Party FB!";

            const boss = FB_BOSSES[party.fbKey];
            if (!boss) throw "Dungeon tidak valid.";

            // 1. --- KALKULASI DAMAGE PARTY VS BOSS ---
            const memberRefs = party.members.map(m => doc(db, "users", m.uid));
            const memberSnaps = await Promise.all(memberRefs.map(ref => ts.get(ref)));

            let totalPartyAtk = 0;
            let log = `⚔️ REKAP PERTARUNGAN MELAWAN [${boss.name}]:\n\n`;

            memberSnaps.forEach(snap => {
                const md = snap.data();
                const partyData = party.members.find(m => m.uid === snap.id);
                const mount = md.equipment?.mount || null;
                const stamReq = Math.max(1, 20 - (mount?.stamDiscount || 0));

                if (md.currentHp > 0 && md.currentStamina >= stamReq) {
                    const effectivePAtk = partyData ? partyData.patk : 50;
                    const effectiveMAtk = partyData ? partyData.matk : 50;
                    totalPartyAtk += Math.max(1, (effectivePAtk + effectiveMAtk) - boss.def);
                }
            });

            if (totalPartyAtk <= 0) throw "Semua anggota kekurangan HP/Stamina! Pertarungan dibatalkan.";
            const turnsToKill = Math.ceil(boss.hp / totalPartyAtk);
            log += `[!] Party Total DPS: ${totalPartyAtk} | Boss HP: ${boss.hp} | Dibunuh dalam ${turnsToKill} Putaran.\n\n`;

            let survivors = 0;
            let battleResults = []; // Tempat menyimpan hasil ramalan nyawa

            // 2. --- PRA-KALKULASI HASIL NYAWA TIAP ANGGOTA ---
            memberSnaps.forEach(snap => {
                const md = snap.data();
                const mRef = snap.ref;
                const partyData = party.members.find(m => m.uid === snap.id);
                
                const mount = md.equipment?.mount || null;
                const stamReq = Math.max(1, 20 - (mount?.stamDiscount || 0));
                const goldMult = 1 + (mount?.goldBonus || 0);

                if (md.currentHp <= 0 || md.currentStamina < stamReq) return; // Abaikan yang sudah mati dari awal

                const effectiveDef = partyData ? partyData.def : 10;
                const dmgPerTurn = Math.max(1, boss.atk - effectiveDef);
                const totalDmgTaken = dmgPerTurn * turnsToKill;
                
                let newHp = md.currentHp - totalDmgTaken;
                let newStamina = Math.max(0, md.currentStamina - stamReq);
                let isDead = newHp <= 0;

                if (!isDead) survivors++;

                // Simpan hasil untuk dieksekusi nanti
                battleResults.push({
                    snap, md, mRef, goldMult, newHp, newStamina, isDead, totalDmgTaken
                });
            });

            // 3. --- SISTEM GACHA DROP ACAK (HANYA JIKA ADA YANG HIDUP) ---
            let memberDrops = {}; 
            let dropLogMsg = "\n\n🎁 HASIL LOOT ACAK:\n";
            let adaDrop = false;

            // Jika ada minimal 1 orang yang selamat, Bos menjatuhkan hartanya!
            if (survivors > 0) {
                let dropsArray = [];
                if (boss.drop) dropsArray.push(boss.drop);
                if (boss.drops) dropsArray = dropsArray.concat(boss.drops);

                if (dropsArray.length > 0) {
                    dropsArray.forEach(d => {
                        if (Math.random() <= d.chance) {
                            adaDrop = true;
                            const luckyMember = party.members[Math.floor(Math.random() * party.members.length)];
                            
                            if (!memberDrops[luckyMember.uid]) memberDrops[luckyMember.uid] = [];
                            memberDrops[luckyMember.uid].push(d.item);
                            
                            dropLogMsg += `> 💎 [${d.item}] didapatkan oleh ${luckyMember.username}!\n`;
                        }
                    });
                }
                if (!adaDrop) dropLogMsg += "> Sayang sekali, tidak ada barang langka yang jatuh kali ini.\n";
            } else {
                // Jika semua mati (Wipe Out), hadiah hangus!
                dropLogMsg = "\n\n❌ LOOT GAGAL: Karena seluruh tim terbunuh, Bos kembali ke sarangnya dan membawa pergi semua hartanya.\n";
            }

            // 4. --- EKSEKUSI UPDATE DATABASE KE SEMUA ANGGOTA ---
            battleResults.forEach(res => {
                const { snap, md, mRef, goldMult, newHp, newStamina, isDead, totalDmgTaken } = res;

                // PENYISIPAN BARANG GACHA KE DALAM TAS
                let inv = md.inventory || {};
                let dropsGot = memberDrops[snap.id] || [];
                let extraDropText = "";

                if (dropsGot.length > 0) {
                    dropsGot.forEach(item => { inv[item] = (inv[item] || 0) + 1; });
                    extraDropText = `\n   💎 (Loot Acak): Dapat ${dropsGot.join(", ")}`;
                }

                // KALKULASI REWARD DASAR (VIP)
                const vipStats = getVipStats(md.vipLevel || 0);
                let baseGold = Math.floor(boss.rewardGold * goldMult);
                let baseExp = boss.rewardExp;
                let bonusGold = Math.floor(baseGold * (vipStats.goldBonusPct / 100));
                let bonusExp = Math.floor(baseExp * (vipStats.expBonusPct / 100));
                
                let finalExpGain = baseExp + bonusExp;
                let finalGoldGain = baseGold + bonusGold;

                // KOMPENSASI MATI
                if (isDead) {
                    finalExpGain = Math.floor(finalExpGain * 0.3); // Hanya dapat 30%
                    finalGoldGain = Math.floor(finalGoldGain * 0.3); // Hanya dapat 30%
                }

                let newExp = (md.exp || 0) + finalExpGain;
                let newGold = (md.gold || 0) + finalGoldGain;
                let newQuests = getUpdatedQuests(md, 'bounty', party.fbKey, 1);
                
                let dropMsg = extraDropText;
                if (!isDead && (bonusGold > 0 || bonusExp > 0)) {
                    dropMsg += ` ✨(VIP +${bonusGold}G / +${bonusExp}XP)`;
                } else if (isDead) {
                    dropMsg += ` 📉(Penalti Kematian: Hadiah 30%)`;
                }

                // LOGIKA LEVEL UP
                let newLevel = md.level || 1;
                let statPointsGained = 0;
                let leveledUp = false;
                while (newExp >= newLevel * 100) {
                    newExp -= (newLevel * 100);
                    newLevel += 1;
                    statPointsGained += 5;
                    leveledUp = true;
                }

                // UPDATE DATABASE
                let updateData = {
                    exp: newExp, 
                    gold: newGold, 
                    inventory: inv, 
                    quests: newQuests,
                    currentStamina: newStamina
                };

                if (leveledUp) {
                    updateData.level = newLevel;
                    updateData.statPoints = (md.statPoints || 0) + statPointsGained;
                    updateData.currentStamina = (md.maxStamina || 100) + (vipStats.extraMaxStamina || 0);
                    updateData.currentHp = isDead ? 0 : (md.maxHp || 1000); 
                    dropMsg += ` (🌟 LEVEL UP TO ${newLevel}!)`;
                } else {
                    updateData.currentHp = isDead ? 0 : newHp;
                }

                ts.update(mRef, updateData);

                if (isDead) {
                    log += `💀 [${md.username}] TERBUNUH! Menerima ${totalDmgTaken} DMG. (+${finalGoldGain} Gold)${dropMsg}\n`;
                } else {
                    log += `🛡️ [${md.username}] BERTAHAN! Sisa HP: ${newHp} | +${finalGoldGain} Gold${dropMsg}\n`;
                }
            });

            // 5. PENUTUP SURAT
            if (survivors > 0) { 
                log += `\n🎉 FB BERHASIL! ${survivors} orang selamat.`; 
            } else { 
                log += `\n❌ PARTY WIPE OUT! Seluruh anggota Party terbunuh oleh Boss.`; 
            }
            log += dropLogMsg; // Cetak pesan gagal loot atau berhasil loot

            ts.delete(partyRef);
            
            return { logResult: log, isWin: survivors > 0, partyMembers: party.members, bossName: boss.name };
        }); 

        // 6. --- KIRIM SURAT ---
        if (resultMsg && resultMsg.logResult) {
            await sendPartyBattleReport(db, resultMsg.partyMembers, resultMsg.isWin, resultMsg.bossName, resultMsg.logResult);
        }

    } catch (err) { 
        console.error("Battle Error:", err); 
    }
}