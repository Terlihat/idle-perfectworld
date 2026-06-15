/* ===================================================
   MODUL PARTY DUNGEON (FUBEN)
   =================================================== */
import { collection, doc, runTransaction, query, onSnapshot, serverTimestamp, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { FB_BOSSES } from '../data/monsters.js';

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
    if (playerStats.currentStamina < 20) return alert("Butuh minimal 20 Stamina untuk masuk FB!");

    const partyRef = doc(collection(db, "parties"));
    const activePartiesQuery = query(collection(db, "parties"));

    try {
        await runTransaction(db, async (ts) => {
            const partiesSnap = await ts.get(activePartiesQuery);
            let joined = false;

            // Cari Party yang sedang menunggu di FB yang sama
            for (let docSnap of partiesSnap.docs) {
                let pData = docSnap.data();
                if (pData.fbKey === fbKey && pData.members.length < 4 && pData.status === 'waiting') {
                    // Cek apakah pemain sudah ada di dalam party ini
                    if (pData.members.find(m => m.uid === playerStats.uid)) throw "Anda sudah berada di dalam Party ini!";
                    
                    let newMembers = [...pData.members, playerStats];
                    ts.update(docSnap.ref, { members: newMembers });
                    joined = true;
                    break;
                }
            }

            // Jika tidak ada party yang tersedia, buat Party baru (Menjadi Leader)
            if (!joined) {
                ts.set(partyRef, {
                    fbKey: fbKey,
                    fbName: boss.name,
                    leaderId: playerStats.uid,
                    leaderName: playerStats.username,
                    members: [playerStats],
                    status: 'waiting',
                    timestamp: serverTimestamp()
                });
            }
        });
        alert("🏕️ Berhasil masuk ke Ruang Tunggu Party!");
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
            else if (data.leaderId === uid) {
                // Pindah kepemimpinan ke anggota berikutnya
                ts.update(partyRef, { members: newMembers, leaderId: newMembers[0].uid, leaderName: newMembers[0].username });
            } else {
                ts.update(partyRef, { members: newMembers });
            }
        });
    } catch (err) { console.error(err); }
}

// LOGIKA PERTARUNGAN GABUNGAN (PARTY BATTLE)
export async function startFbBattle(db, leaderUid, partyId) {
    const partyRef = doc(db, "parties", partyId);

    try {
        await runTransaction(db, async (ts) => {
            const partySnap = await ts.get(partyRef);
            if (!partySnap.exists()) throw "Party sudah tidak ada!";
            const party = partySnap.data();

            if (party.leaderId !== leaderUid) throw "Hanya Ketua (Leader) yang bisa memulai FB!";
            if (party.members.length < 2) throw "Minimal butuh 2 orang untuk memulai Party FB!";

            const boss = FB_BOSSES[party.fbKey];
            
            // Ambil data terbaru semua anggota langsung dari database (bukan data cache di party)
            const memberRefs = party.members.map(m => doc(db, "users", m.uid));
            const memberSnaps = await Promise.all(memberRefs.map(ref => ts.get(ref)));

            let totalPartyAtk = 0;
            let log = `⚔️ BATTLE LOG: Melawan ${boss.name}\n\n`;

            // Hitung Total Damage (DPS Party)
            memberSnaps.forEach(snap => {
                const md = snap.data();
                if (md.currentHp > 0 && md.currentStamina >= 20) {
                    const wepBonus = 1 + (md.equipment?.weapon?.refine || 0) * 0.15;
                    const pAtk = 50 + (md.str * 10) + Math.floor((md.equipment?.weapon?.patk || 0) * wepBonus);
                    const mAtk = 50 + (md.int * 10) + Math.floor((md.equipment?.weapon?.matk || 0) * wepBonus);
                    totalPartyAtk += Math.max(1, (pAtk + mAtk) - boss.def);
                }
            });

            if (totalPartyAtk <= 0) throw "Semua anggota kekurangan HP/Stamina! Pertarungan dibatalkan.";

            const turnsToKill = Math.ceil(boss.hp / totalPartyAtk);
            log += `[!] Party Total DPS: ${totalPartyAtk} | Boss HP: ${boss.hp} | Dibunuh dalam ${turnsToKill} Putaran.\n\n`;

            let survivors = 0;

            // Hitung AoE Damage yang diterima setiap anggota & Eksekusi Hadiah
            memberSnaps.forEach(snap => {
                const md = snap.data();
                const mRef = snap.ref;
                
                if (md.currentHp <= 0 || md.currentStamina < 20) return; // Skip pemain yang mati / stamina kurang

                const armBonus = 1 + (md.equipment?.armor?.refine || 0) * 0.15;
                const def = 10 + (md.con * 5) + Math.floor((md.equipment?.armor?.def || 0) * armBonus);
                
                // Serangan Boss (AoE) kurangi DEF pemain
                const dmgPerTurn = Math.max(1, boss.atk - def);
                const totalDmgTaken = dmgPerTurn * turnsToKill;
                
                let newHp = md.currentHp - totalDmgTaken;
                let newStamina = Math.max(0, md.currentStamina - 20); // Tiket masuk 20 Stamina

                if (newHp <= 0) {
                    // Pemain Mati (Tidak dapat hadiah)
                    ts.update(mRef, { currentHp: 0, currentStamina: newStamina });
                    log += `💀 [${md.username}] TERBUNUH! Menerima ${totalDmgTaken} DMG.\n`;
                } else {
                    // Pemain Bertahan (Dapat Hadiah)
                    survivors++;
                    let newExp = (md.exp || 0) + boss.rewardExp;
                    let newGold = (md.gold || 0) + boss.rewardGold;
                    let inv = md.inventory || {};
                    let dropMsg = "";

                    if (Math.random() <= boss.drop.chance) {
                        inv[boss.drop.item] = (inv[boss.drop.item] || 0) + 1;
                        dropMsg = ` | 🎁 Drop: ${boss.drop.item}`;
                    }

                    ts.update(mRef, {
                        exp: newExp, gold: newGold, inventory: inv,
                        currentHp: newHp, currentStamina: newStamina
                    });

                    log += `🛡️ [${md.username}] BERTAHAN! Sisa HP: ${newHp} | +${boss.rewardExp} EXP${dropMsg}\n`;
                }
            });

            if (survivors > 0) {
                log += `\n🎉 FB BERHASIL! ${survivors} orang selamat dari pertarungan.`;
            } else {
                log += `\n❌ PARTY WIPE OUT! Seluruh anggota Party terbunuh oleh Boss.`;
            }

            // Hapus ruang lobby party setelah selesai
            ts.delete(partyRef);
            
            // Simpan log pertarungan ke memori global (Opsional, agar bisa diambil oleh klien jika perlu)
            alert(log); 
        });
    } catch (err) { alert(err); }
}