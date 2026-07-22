/* ===================================================
   MODUL OBROLAN / CHAT (Multi-Channel + Keamanan)
   =================================================== */
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

let currentChatUnsubscribe = null;
let lastChatTime = 0;
const CHAT_COOLDOWN = 25000; // 25.000 ms = 25 detik

export function listenToChat(db, channelType, channelId, callbackRender) {
    // 🔥 PERBAIKAN F5: Hentikan listener lama jika ada, agar tidak bertumpuk saat login/ganti channel
    if (currentChatUnsubscribe) {
        currentChatUnsubscribe();
    }

    let path = "chats";
    if (channelType === "guild" && channelId) path = `guilds/${channelId}/chats`;
    if (channelType === "party" && channelId) path = `parties/${channelId}/chats`;

    const q = query(collection(db, path), orderBy("timestamp", "asc"));

    currentChatUnsubscribe = onSnapshot(q, (snapshot) => {
        let messages = [];
        snapshot.forEach((doc) => messages.push(doc.data()));
        callbackRender(messages);
    });

    return currentChatUnsubscribe;
}

export async function sendChat(db, uid, username, text, channelType, channelId) {
    if (!text || !text.trim()) return;

    const now = Date.now();

    // 🔥 FITUR ADMIN: Tentukan siapa saja yang menjadi GM
    const adminList = ["Thecakepz"]; // Anda bisa menambahkan nama admin lain di sini
    const isAdmin = adminList.includes(username);

    // 🔥 FITUR ANTI-SPAM (25 Detik) - GM bebas dari cooldown
    if (!isAdmin && now - lastChatTime < CHAT_COOLDOWN) {
        const timeLeft = Math.ceil((CHAT_COOLDOWN - (now - lastChatTime)) / 1000);
        if (window.rpgAlert) {
            window.rpgAlert(`⏳ Jangan spam! Tunggu ${timeLeft} detik lagi sebelum mengirim pesan.`, "Anti-Spam");
        } else {
            alert(`Tunggu ${timeLeft} detik lagi.`);
        }
        return;
    }

    // Catat waktu pesan terakhir jika lolos
    lastChatTime = now;

    // Tentukan lokasi database
    let path = "chats";
    if (channelType === "guild" && channelId) path = `guilds/${channelId}/chats`;
    if (channelType === "party" && channelId) path = `parties/${channelId}/chats`;

    try {
        await addDoc(collection(db, path), {
            uid: uid,
            username: username, // Nama asli tetap disimpan
            isAdmin: isAdmin,   // Status GM ditandai di database
            text: text,
            timestamp: serverTimestamp()
        });
    } catch (err) {
        console.error("Gagal mengirim pesan:", err);
    }
}