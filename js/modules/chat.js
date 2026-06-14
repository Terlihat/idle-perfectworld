import { collection, addDoc, query, orderBy, limit, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export function listenToChat(db, callbackRender) {
    const q = query(collection(db, "chats"), orderBy("timestamp", "desc"), limit(30));
    return onSnapshot(q, (snapshot) => {
        let messages = [];
        snapshot.forEach((doc) => {
            messages.push(doc.data({ serverTimestamps: 'estimate' }));
        });
        callbackRender(messages.reverse());
    });
}

export async function sendChat(db, uid, username, messageText) {
    if (!uid || !messageText.trim()) return;
    try {
        await addDoc(collection(db, "chats"), {
            uid: uid,
            username: username || "Hero Anonim",
            text: messageText.trim(),
            timestamp: serverTimestamp()
        });
    } catch (err) {
        console.error("Gagal mengirim obrolan:", err);
    }
}