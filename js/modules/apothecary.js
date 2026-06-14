import { doc, runTransaction, collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export async function buyPotion(db, uid, type) {
    if (!uid) return;
    const cost = 500;
    const userRef = doc(db, "users", uid);

    try {
        await runTransaction(db, async (ts) => {
            const data = (await ts.get(userRef)).data();
            if (data.gold < cost) throw "Gold tidak cukup!";

            let inv = data.inventory || {};
            const potionName = type === 'HP' ? "Ramuan HP" : "Ramuan MP";
            inv[potionName] = (inv[potionName] || 0) + 1;

            ts.update(userRef, {
                gold: data.gold - cost,
                inventory: inv
            });
        });
        alert(`🧪 Berhasil membeli 1x Ramuan ${type}!`);
    } catch (err) {
        alert(err);
    }
}

export function listenToMailbox(db, uid, callbackRender) {
    if (!uid) return;
    const q = query(collection(db, "mailboxes"), where("receiverUid", "==", uid));
    return onSnapshot(q, (snapshot) => {
        let mails = [];
        snapshot.forEach((doc) => {
            mails.push({ id: doc.id, ...doc.data() });
        });
        callbackRender(mails);
    });
}