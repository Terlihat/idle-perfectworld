/* ===================================================
   MODUL MANAJEMEN KOTAK SURAT (MAILBOX)
   =================================================== */
import { collection, doc, query, onSnapshot, runTransaction, deleteDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export function listenToMailbox(db, uid, callbackRender) {
    if (!uid) return;
    const q = query(collection(db, "users", uid, "mailbox"));
    return onSnapshot(q, (snapshot) => {
        let mails = [];
        snapshot.forEach((docSnap) => {
            mails.push({ id: docSnap.id, ...docSnap.data() });
        });
        callbackRender(mails);
    });
}

export async function claimMailReward(db, uid, mailId) {
    if (!uid || !mailId) return;
    const mailRef = doc(db, "users", uid, "mailbox", mailId);
    const userRef = doc(db, "users", uid);

    try {
        await runTransaction(db, async (ts) => {
            const mSnap = await ts.get(mailRef);
            const uSnap = await ts.get(userRef);
            if (!mSnap.exists() || !uSnap.exists()) throw "Data tidak ditemukan.";

            const mail = mSnap.data();
            const user = uSnap.data();

            if (mail.isClaimed) throw "Hadiah sudah diklaim!";
            if (!mail.attachments) throw "Surat tidak memiliki hadiah.";

            let updates = {};

            const itemName = mail.attachments.itemName || mail.attachments.name;
            if (itemName) {
                let inv = user.inventory || {};
                const qty = mail.attachments.qty || 1;
                inv[itemName] = (inv[itemName] || 0) + qty;
                updates.inventory = inv;
            }

            const addGold = mail.attachments.gold || 0;
            if (addGold > 0) updates.gold = (user.gold || 0) + addGold;

            const addCoin = mail.attachments.coin || 0;
            if (addCoin > 0) updates.coin = (user.coin || 0) + addCoin;

            ts.update(mailRef, { isClaimed: true });
            ts.update(userRef, updates);
        });
        alert("🎁 Hadiah surat berhasil diklaim!");
    } catch (e) { alert(e); }
}

export async function deleteMail(db, uid, mailId) {
    if (!uid || !mailId) return;
    const mailRef = doc(db, "users", uid, "mailbox", mailId);
    try {
        await deleteDoc(mailRef);
    } catch (e) { alert("Gagal menghapus: " + e); }
}

// --- FUNGSI BARU: PENGIRIM BATTLE REPORT PARTY ---
export async function sendPartyBattleReport(db, partyMembers, isWin, bossName, logContent) {
    const timestamp = new Date().toLocaleString('id-ID');
    const promises = partyMembers.map(member => {
        const mailRef = doc(collection(db, "users", member.uid, "mailbox"));
        return setDoc(mailRef, {
            title: isWin ? `🏆 Kemenangan FB: ${bossName}` : `💀 Kekalahan FB: ${bossName}`,
            content: logContent,
            date: timestamp,
            isRead: false,
            isClaimed: true // Ditandai 'true' karena surat ini murni teks, tidak ada attachment hadiah yg perlu di-klaim
        }).catch(err => console.log("Gagal kirim surat", err));
    });
    await Promise.all(promises);
}

// --- FUNGSI BARU: PENGIRIM BATTLE REPORT SOLO ---
export async function sendSoloBattleReport(db, uid, isWin, monsterName, logContent) {
    const timestamp = new Date().toLocaleString('id-ID');
    const mailRef = doc(collection(db, "users", uid, "mailbox"));
    await setDoc(mailRef, {
        title: isWin ? `⚔️ Menang Solo: ${monsterName}` : `☠️ Kalah Solo: ${monsterName}`,
        content: logContent,
        date: timestamp,
        isRead: false,
        isClaimed: true
    });
}