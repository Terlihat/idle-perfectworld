/* ===================================================
   MODUL PARTY DUNGEON (Fix Level Up Check & VIP Engine)
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
    if (!boss) return alert("Dungeon tidak valid!");
    if (playerStats.level < boss.levelReq) return alert(`Level Anda belum cukup! Butuh Level ${boss.levelReq}.`);
    
    const mount = playerStats.equipment?.mount || null;
    const stamReq = Math.max(1, 20 - (mount?.stamDiscount || 0));
    if (playerStats.currentStamina < stamReq) return alert(`Butuh minimal ${stamReq} Stamina (Efek Mount) untuk masuk FB!`);

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
            alert("🏕️ Berhasil bergabung ke Party Fuben!");
        } else {
            const newPartyRef = doc(partiesRef);
            await runTransaction(db, async (ts) => {
                ts.set(newPartyRef, { 
                    fbKey: fbKey, fbName: boss.name, leaderId: playerStats.uid, leaderName: playerStats.username, status: 'waiting', timestamp: serverTimestamp(),
                    members: [{ uid: playerStats.uid, username: playerStats.username, level: playerStats.level, patk: playerStats.patk, matk: playerStats.matk, def: playerStats.def }] 
                });
            });
            alert("🏕️ Berhasil membuat Ruang Tunggu Party Baru!");
        }
    } catch (err) { alert(err); }
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

export async function startFbBattle(db, partyId) {
    if (!partyId) return;
    const partyRef = doc(db, "parties", partyId);

    try {
        const resultMsg = await runTransaction(db, async (ts) => {
            const pSnap = await ts.get(partyRef);
            if (!pSnap.exists()) throw "Party tidak ditemukan.";
            const party = pSnap.data();

            if (party.status === "in_battle") throw "Party sedang bertarung!";
            const boss = FB_BOSSES[party.fbKey];
            if (!boss) throw "Dungeon tidak valid.";

            // Kalkulasi damage party
            let totalPartyAtk = 0;
            party.members.forEach(m => {
                totalPartyAtk += (m.patk || 10) + (m.matk || 10);
            });

            // Kalkulasi total hit
            let dmgToBoss = Math.max(1, totalPartyAtk - (boss.def || 0));
            let totalHit = Math.ceil(boss.hp / dmgToBoss);

            // Damage boss ke party
            let bossAtk = boss.atk || 100;
            let log = `⚔️ REKAP PERTARUNGAN [${boss.name}]:\n\n`;
            let survivors = 0;

            // 1. --- SISTEM GACHA DROP ACAK ---
            let memberDrops = {}; 
            let dropLogMsg = "\n\n🎁 HASIL LOOT ACAK:\n";
            let adaDrop = false;

            let dropsArray = [];
            if (boss.drop) dropsArray.push(boss.drop);
            if (boss.drops) dropsArray = dropsArray.concat(boss.drops);

            if (dropsArray.length > 0) {
                dropsArray.forEach(d => {
                    // Cek Hoki: Apakah barang ini jatuh?
                    if (Math.random() <= d.chance) {
                        adaDrop = true;
                        // Pilih Anggota Party secara acak untuk menerima barang
                        const luckyMember = party.members[Math.floor(Math.random() * party.members.length)];
                        
                        if (!memberDrops[luckyMember.uid]) memberDrops[luckyMember.uid] = [];
                        memberDrops[luckyMember.uid].push(d.item);
                        
                        dropLogMsg += `> 💎 [${d.item}] jatuh ke dalam tas ${luckyMember.username}!\n`;
                    }
                });
            }
            if (!adaDrop) dropLogMsg += "> Tidak ada barang langka yang jatuh pada perburuan kali ini.\n";
            // ---------------------------------

            // 2. --- LOOP UNTUK UPDATE DATA TIAP ANGGOTA ---
            for (let i = 0; i < party.members.length; i++) {
                let member = party.members[i];
                let mRef = doc(db, "users", member.uid);
                let mSnap = await ts.get(mRef);
                if (!mSnap.exists()) continue;

                let md = mSnap.data();
                let dmgToMember = Math.max(1, bossAtk - (md.def || 0));
                let totalDmgTaken = dmgToMember * totalHit;

                let currentHp = md.currentHp || member.maxHp || 1000;
                let newHp = Math.max(0, currentHp - totalDmgTaken);
                
                const vipStats = getVipStats(md.vipLevel || 0);
                const currentStamina = md.currentStamina !== undefined ? md.currentStamina : 100;
                const stamReq = Math.max(1, 20 - (member.mountBonus?.stamDiscount || 0));
                let newStamina = Math.max(0, currentStamina - stamReq);
                
                let expGain = boss.rewardExp || 1000;
                let goldGain = boss.rewardGold || 500;
                let finalGold = goldGain + Math.floor(goldGain * (member.mountBonus?.goldBonus || 0));

                let newExpDeath = Math.max(0, (md.exp || 0) - Math.floor(expGain * 0.5));
                let newExp = (md.exp || 0) + expGain;
                let newGold = (md.gold || 0) + finalGold;
                
                const newQuests = getUpdatedQuests(md.quests, boss.name);

                // PENYISIPAN BARANG GACHA KE DALAM TAS ANGGOTA
                let inv = md.inventory || {};
                let dropsGot = memberDrops[member.uid] || [];
                let extraDropText = "";

                if (dropsGot.length > 0) {
                    dropsGot.forEach(item => { inv[item] = (inv[item] || 0) + 1; });
                    extraDropText = `\n   💎 (Loot Hoki): Dapat ${dropsGot.join(", ")}`;
                }

                if (newHp <= 0) {
                    // MEMBER TEWAS
                    ts.update(mRef, { currentHp: 0, exp: newExpDeath, inventory: inv, currentStamina: newStamina });
                    log += `💀 [${md.username}] TEWAS!${extraDropText}\n`;
                } else {
                    // MEMBER SELAMAT (Bertahan hidup)
                    survivors++;
                    let newLevel = md.level || 1;
                    let reqExp = newLevel * 1000;
                    let leveledUp = false;
                    let statPointsGained = 0;

                    while (newExp >= reqExp) {
                        newExp -= reqExp;
                        newLevel++;
                        statPointsGained += 5;
                        reqExp = newLevel * 1000;
                        leveledUp = true;
                    }

                    let dropMsg = extraDropText;

                    if (leveledUp) {
                        ts.update(mRef, { 
                            exp: newExp, gold: newGold, inventory: inv, 
                            level: newLevel, currentHp: member.maxHp, 
                            currentStamina: md.maxStamina || 100, 
                            statPoints: (md.statPoints || 0) + statPointsGained,
                            quests: newQuests 
                        });
                        dropMsg += ` (🌟 LEVEL UP TO ${newLevel}!)`;
                    } else {
                        ts.update(mRef, { 
                            exp: newExp, gold: newGold, inventory: inv, 
                            currentHp: newHp, currentStamina: newStamina,
                            quests: newQuests 
                        });
                    }
                    
                    log += `🛡️ [${md.username}] BERTAHAN! Sisa HP: ${newHp} | +${finalGold} Gold${dropMsg}\n`;
                }
            } // -- AKHIR LOOP --

            // 3. TENTUKAN HASIL AKHIR & GABUNGKAN LOG LOOT
            if (survivors > 0) { 
                log += `\n🎉 FB BERHASIL! ${survivors} orang selamat.`; 
                log += dropLogMsg; // Tambahkan info siapa saja yang hoki dapat barang!
            } 
            else { 
                log += `\n❌ PARTY WIPE OUT! Seluruh anggota Party terbunuh oleh Boss.`; 
            }

            // Hapus Party karena sudah selesai bertarung
            ts.delete(partyRef);
            
            return { logResult: log, isWin: survivors > 0, partyMembers: party.members, bossName: boss.name };
            
        }); 

        if (resultMsg && resultMsg.logResult) {
            await sendPartyBattleReport(db, resultMsg.partyMembers, resultMsg.isWin, resultMsg.bossName, resultMsg.logResult);
        }

    } catch (err) { 
        alert(err); 
    }
}