/* ===================================================
   MODUL MANAJEMEN KOTAK SURAT (MAILBOX)
   =================================================== */
import { collection, doc, query, onSnapshot, runTransaction, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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

            let inv = user.inventory || {};
            const itemName = mail.attachments.itemName || mail.attachments.name;
            const qty = mail.attachments.qty || 1;

            inv[itemName] = (inv[itemName] || 0) + qty;

            ts.update(mailRef, { isClaimed: true });
            ts.update(userRef, { inventory: inv });
        });
        alert("🎁 Hadiah surat berhasil diklaim ke Tas Anda!");
    } catch (e) { alert(e); }
}

export async function deleteMail(db, uid, mailId) {
    if (!uid || !mailId) return;
    const mailRef = doc(db, "users", uid, "mailbox", mailId);
    try {
        await deleteDoc(mailRef);
        alert("🗑️ Surat berhasil dihapus secara manual!");
    } catch (e) { alert(e); }
}