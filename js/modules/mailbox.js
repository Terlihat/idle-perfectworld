import { collection, query, where, orderBy, onSnapshot, doc, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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