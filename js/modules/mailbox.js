import { collection, query, where, orderBy, onSnapshot, doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export function listenToMailbox(db, uid, callbackRender) {
    if (!uid) return;
    const q = query(
        collection(db, "mailboxes"), 
        where("receiverUid", "==", uid),
        orderBy("timestamp", "desc")
    );

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
    const userRef = doc(db, "users", uid);
    const mailRef = doc(db, "mailboxes", mailId);

    try {
        await runTransaction(db, async (ts) => {
            const mailSnap = await ts.get(mailRef);
            if (!mailSnap.exists()) throw "Surat tidak ditemukan!";
            const mailData = mailSnap.data();

            if (mailData.isClaimed) throw "Hadiah dari surat ini sudah diklaim!";
            if (mailData.receiverUid !== uid) throw "Ini bukan surat Anda!";

            const userSnap = await ts.get(userRef);
            if (!userSnap.exists()) throw "Data pemain tidak ditemukan!";
            const userData = userSnap.data();

            // Kalkulasi penambahan hadiah
            let newGold = (userData.gold || 0) + (mailData.attachments?.gold || 0);
            let newCoin = (userData.coin || 0) + (mailData.attachments?.coin || 0);
            let inv = userData.inventory || {};

            if (mailData.attachments?.item && mailData.attachments.item.name) {
                const itemName = mailData.attachments.item.name;
                const itemQty = mailData.attachments.item.qty || 1;
                inv[itemName] = (inv[itemName] || 0) + itemQty;
            }

            // Update database pemain dan status surat
            ts.update(userRef, { gold: newGold, coin: newCoin, inventory: inv });
            ts.update(mailRef, { isClaimed: true });
        });
        alert("🎁 Hadiah berhasil ditarik ke dalam Tas!");
    } catch (err) {
        alert(err);
    }
}