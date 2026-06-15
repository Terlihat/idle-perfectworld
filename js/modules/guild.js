/* ===================================================
   MODUL MANAJEMEN GUILD / KLAN
   =================================================== */
import { collection, doc, runTransaction, query, onSnapshot, serverTimestamp, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const GUILD_UPGRADES = {
    1: { maxMembers: 10, cost: 0, buff: { atk: 10, hp: 0, def: 0 } },
    2: { maxMembers: 15, cost: 250000, buff: { atk: 25, hp: 100, def: 0 } },
    3: { maxMembers: 20, cost: 500000, buff: { atk: 50, hp: 250, def: 0 } },
    4: { maxMembers: 25, cost: 1000000, buff: { atk: 100, hp: 500, def: 50 } },
    5: { maxMembers: 30, cost: 2500000, buff: { atk: 150, hp: 1000, def: 100 } }
};

export function listenToGuilds(db, callbackRender) {
    const q = query(collection(db, "guilds"));
    return onSnapshot(q, (snapshot) => {
        let guilds = {};
        snapshot.forEach((docSnap) => { guilds[docSnap.id] = { id: docSnap.id, ...docSnap.data() }; });
        callbackRender(guilds, GUILD_UPGRADES);
    });
}

export async function createGuild(db, uid, playerStats, guildName) {
    if (!uid || !guildName) return;
    if (playerStats.level < 20) return alert("Syarat membuat Guild: Minimal Level 20!");
    if (guildName.length < 3 || guildName.length > 15) return alert("Nama Guild harus 3-15 karakter!");

    const userRef = doc(db, "users", uid);
    const newGuildRef = doc(collection(db, "guilds"));

    try {
        await runTransaction(db, async (ts) => {
            const userSnap = await ts.get(userRef);
            if (!userSnap.exists()) throw "User tidak ditemukan.";
            const uData = userSnap.data();

            if (uData.guildId) throw "Anda sudah berada di dalam Guild!";
            if ((uData.gold || 0) < 100000) throw "Gold Anda tidak cukup! Butuh 100.000 Gold.";

            // Buat Data Guild
            ts.set(newGuildRef, {
                name: guildName,
                level: 1,
                leaderId: uid,
                leaderName: uData.username,
                vaultGold: 0,
                announcement: "Selamat datang di klan kami!",
                members: [{ uid: uid, name: uData.username, level: uData.level, contribution: 0 }],
                createdAt: serverTimestamp()
            });

            // Potong Gold Pemain
            ts.update(userRef, { gold: uData.gold - 100000, guildId: newGuildRef.id, guildName: guildName });
        });
        alert(`🛡️ Guild [${guildName}] berhasil didirikan!`);
    } catch (err) { alert(err); }
}

export async function joinGuild(db, uid, playerStats, guildId) {
    if (!uid || !guildId) return;
    const userRef = doc(db, "users", uid);
    const guildRef = doc(db, "guilds", guildId);

    try {
        await runTransaction(db, async (ts) => {
            const uSnap = await ts.get(userRef);
            const gSnap = await ts.get(guildRef);
            
            if (!uSnap.exists() || !gSnap.exists()) throw "Data tidak valid.";
            const uData = uSnap.data();
            const gData = gSnap.data();

            if (uData.guildId) throw "Anda sudah berada di dalam Guild!";
            const maxM = GUILD_UPGRADES[gData.level].maxMembers;
            if (gData.members.length >= maxM) throw "Guild sudah penuh!";

            let newMembers = [...gData.members, { uid: uid, name: uData.username, level: uData.level, contribution: 0 }];
            
            ts.update(guildRef, { members: newMembers });
            ts.update(userRef, { guildId: guildId, guildName: gData.name });
        });
        alert("🛡️ Berhasil bergabung dengan Guild!");
    } catch (err) { alert(err); }
}

export async function leaveGuild(db, uid, guildId) {
    if (!uid || !guildId) return;
    const userRef = doc(db, "users", uid);
    const guildRef = doc(db, "guilds", guildId);

    try {
        await runTransaction(db, async (ts) => {
            const uSnap = await ts.get(userRef);
            const gSnap = await ts.get(guildRef);
            if (!uSnap.exists() || !gSnap.exists()) return;
            
            const gData = gSnap.data();
            if (gData.leaderId === uid) throw "Ketua tidak bisa keluar! Bubarkan Guild atau pindahkan jabatan (segera hadir).";

            let newMembers = gData.members.filter(m => m.uid !== uid);
            ts.update(guildRef, { members: newMembers });
            ts.update(userRef, { guildId: null, guildName: null });
        });
        alert("Anda telah keluar dari Guild.");
    } catch (err) { alert(err); }
}

export async function donateGold(db, uid, guildId, amount) {
    if (!uid || !guildId || amount <= 0) return;
    const userRef = doc(db, "users", uid);
    const guildRef = doc(db, "guilds", guildId);

    try {
        await runTransaction(db, async (ts) => {
            const uSnap = await ts.get(userRef);
            const gSnap = await ts.get(guildRef);
            if (!uSnap.exists() || !gSnap.exists()) throw "Error data.";
            const uData = uSnap.data();
            const gData = gSnap.data();

            if ((uData.gold || 0) < amount) throw "Gold tidak cukup!";

            let newMembers = gData.members.map(m => {
                if (m.uid === uid) m.contribution += amount;
                return m;
            });

            ts.update(userRef, { gold: uData.gold - amount });
            ts.update(guildRef, { vaultGold: gData.vaultGold + amount, members: newMembers });
        });
        alert(`Berhasil mendonasikan ${amount} Gold ke kas Guild!`);
    } catch (err) { alert(err); }
}

export async function upgradeGuild(db, leaderUid, guildId) {
    const guildRef = doc(db, "guilds", guildId);
    try {
        await runTransaction(db, async (ts) => {
            const gSnap = await ts.get(guildRef);
            if (!gSnap.exists()) throw "Guild tidak ditemukan.";
            const gData = gSnap.data();

            if (gData.leaderId !== leaderUid) throw "Hanya Ketua yang bisa melakukan upgrade!";
            if (gData.level >= 5) throw "Guild sudah mencapai Level Maksimal!";

            const reqGold = GUILD_UPGRADES[gData.level + 1].cost;
            if (gData.vaultGold < reqGold) throw `Kas tidak cukup! Butuh ${reqGold} Gold.`;

            ts.update(guildRef, { level: gData.level + 1, vaultGold: gData.vaultGold - reqGold });
        });
        alert("🎉 GUILD LEVEL UP!");
    } catch (err) { alert(err); }
}

export async function updateMotd(db, leaderUid, guildId, newText) {
    const guildRef = doc(db, "guilds", guildId);
    try {
        await runTransaction(db, async (ts) => {
            const gSnap = await ts.get(guildRef);
            if (!gSnap.exists() || gSnap.data().leaderId !== leaderUid) throw "Ditolak.";
            ts.update(guildRef, { announcement: newText });
        });
    } catch (err) {}
}

export async function kickMember(db, leaderUid, guildId, targetUid) {
    if (leaderUid === targetUid) return;
    const guildRef = doc(db, "guilds", guildId);
    const targetRef = doc(db, "users", targetUid);
    try {
        await runTransaction(db, async (ts) => {
            const gSnap = await ts.get(guildRef);
            if (!gSnap.exists() || gSnap.data().leaderId !== leaderUid) throw "Akses ditolak!";
            let newMembers = gSnap.data().members.filter(m => m.uid !== targetUid);
            ts.update(guildRef, { members: newMembers });
            ts.update(targetRef, { guildId: null, guildName: null });
        });
        alert("Anggota berhasil dikeluarkan.");
    } catch (err) { alert(err); }
}

export async function disbandGuild(db, leaderUid, guildId) {
    const guildRef = doc(db, "guilds", guildId);
    try {
        await runTransaction(db, async (ts) => {
            const gSnap = await ts.get(guildRef);
            if (!gSnap.exists() || gSnap.data().leaderId !== leaderUid) throw "Ditolak.";
            
            // Hapus guildId dari semua anggota (Idealnya memanggil backend Cloud Functions untuk array besar, tapi kita looping aman karena limit max 30)
            const members = gSnap.data().members;
            for (let m of members) { ts.update(doc(db, "users", m.uid), { guildId: null, guildName: null }); }
            
            ts.delete(guildRef);
        });
        alert("Guild berhasil dibubarkan.");
    } catch (err) { alert(err); }
}