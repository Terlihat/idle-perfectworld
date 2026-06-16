/* ===================================================
   MODUL OBROLAN / CHAT (Multi-Channel)
   =================================================== */
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export function listenToChat(db, channelType, channelId, callbackRender) {
    // Tentukan lokasi database berdasarkan channel
    let path = "chats"; 
    if (channelType === "guild" && channelId) path = `guilds/${channelId}/chats`;
    if (channelType === "party" && channelId) path = `parties/${channelId}/chats`;

    const q = query(collection(db, path), orderBy("timestamp", "asc"));
    return onSnapshot(q, (snapshot) => {
        let messages = [];
        snapshot.forEach((doc) => messages.push(doc.data()));
        callbackRender(messages);
    });
}

export async function sendChat(db, uid, username, text, channelType, channelId) {
    if (!text || !text.trim()) return;
    
    // Tentukan lokasi database berdasarkan channel
    let path = "chats";
    if (channelType === "guild" && channelId) path = `guilds/${channelId}/chats`;
    if (channelType === "party" && channelId) path = `parties/${channelId}/chats`;

    try {
        await addDoc(collection(db, path), {
            uid: uid,
            username: username,
            text: text,
            timestamp: serverTimestamp()
        });
    } catch (err) { console.error("Gagal mengirim pesan:", err); }
}