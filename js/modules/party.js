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

export async function startFbBattle(db, leaderUid, partyId) {
    const partyRef = doc(db, "parties", partyId);
    try {
        // PERBAIKAN 1: Tambahkan 'const resultMsg =' untuk menampung hasil return
        const resultMsg = await runTransaction(db, async (ts) => {
            const partySnap = await ts.get(partyRef);
            if (!partySnap.exists()) throw "Party sudah tidak ada!";
            const party = partySnap.data(); // <--- Variabel bernama 'party'

            if (party.leaderId !== leaderUid) throw "Hanya Ketua yang bisa memulai FB!";
            if (party.members.length < 2) throw "Minimal butuh 2 orang untuk memulai Party FB!";

            const boss = FB_BOSSES[party.fbKey];
            const memberRefs = party.members.map(m => doc(db, "users", m.uid));
            const memberSnaps = await Promise.all(memberRefs.map(ref => ts.get(ref)));

            let totalPartyAtk = 0;
            let log = `⚔️ BATTLE LOG: Melawan ${boss.name}\n\n`;

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

            memberSnaps.forEach(snap => {
                const md = snap.data();
                const mRef = snap.ref;
                const partyData = party.members.find(m => m.uid === snap.id);
                
                const mount = md.equipment?.mount || null;
                const stamReq = Math.max(1, 20 - (mount?.stamDiscount || 0));
                const goldMult = 1 + (mount?.goldBonus || 0);

                if (md.currentHp <= 0 || md.currentStamina < stamReq) return;

                const effectiveDef = partyData ? partyData.def : 10;
                const dmgPerTurn = Math.max(1, boss.atk - effectiveDef);
                const totalDmgTaken = dmgPerTurn * turnsToKill;
                
                let newHp = md.currentHp - totalDmgTaken;
                let newStamina = Math.max(0, md.currentStamina - stamReq);

                if (newHp <= 0) {
                    ts.update(mRef, { currentHp: 0, currentStamina: newStamina });
                    log += `💀 [${md.username}] TERBUNUH! Menerima ${totalDmgTaken} DMG.\n`;
                } else {
                    survivors++;
                    
                    // --- VIP ENGINE PARTY ---
                    const vipStats = getVipStats(md.vipLevel || 0);
                    
                    let baseGold = Math.floor(boss.rewardGold * goldMult);
                    let baseExp = boss.rewardExp;
                    
                    let bonusGold = Math.floor(baseGold * (vipStats.goldBonusPct / 100));
                    let bonusExp = Math.floor(baseExp * (vipStats.expBonusPct / 100));
                    
                    let finalGold = baseGold + bonusGold;
                    let finalExp = baseExp + bonusExp;
                    
                    let newExp = (md.exp || 0) + finalExp;
                    let newGold = (md.gold || 0) + finalGold;
                    let inv = md.inventory || {};
                    let dropMsg = "";

                    let newQuests = getUpdatedQuests(md, 'bounty', party.fbKey, 1);

                    if (Math.random() <= boss.drop.chance) {
                        inv[boss.drop.item] = (inv[boss.drop.item] || 0) + 1;
                        dropMsg = ` | 🎁 Drop: ${boss.drop.item}`;
                    }

                    if (bonusGold > 0 || bonusExp > 0) {
                        dropMsg += ` ✨(VIP +${bonusGold}G / +${bonusExp}XP)`;
                    }

                    let newLevel = md.level || 1;
                    let statPointsGained = 0;
                    let leveledUp = false;
                    while (newExp >= newLevel * 100) {
                        newExp -= (newLevel * 100);
                        newLevel += 1;
                        statPointsGained += 5;
                        leveledUp = true;
                    }

                    if (leveledUp) {
                        ts.update(mRef, { 
                            level: newLevel, exp: newExp, gold: newGold, inventory: inv, 
                            currentHp: md.maxHp || 1000, currentStamina: newStamina,
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
            });

            if (survivors > 0) { log += `\n🎉 FB BERHASIL! ${survivors} orang selamat.`; } 
            else { log += `\n❌ PARTY WIPE OUT! Seluruh anggota Party terbunuh oleh Boss.`; }

            ts.delete(partyRef);
            
            // PERBAIKAN 2: Ubah pd.members menjadi party.members
            return { logResult: log, isWin: survivors > 0, partyMembers: party.members, bossName: boss.name };
            
        }); // Penutup transaksi

        if (resultMsg && resultMsg.logResult) {
            await sendPartyBattleReport(db, resultMsg.partyMembers, resultMsg.isWin, resultMsg.bossName, resultMsg.logResult);
            // alert("Pertarungan selesai! Cek Kotak Surat Anda."); // (Bisa dinyalakan jika ingin ada notif)
        }

    } catch (err) { 
        alert(err); 
    }
}