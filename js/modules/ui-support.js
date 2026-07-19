// ==========================================
// SISTEM UI & LOGIKA: TIKET BANTUAN (SUPPORT)
// ==========================================
import { addDoc, collection, serverTimestamp, query, where, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export function setupSupportUI(db, getUidCallback, getUsernameCallback) {
    let unsubMyTickets = null;

    // 1. Fungsi Kirim Tiket
    window.submitSupportTicket = async function () {
        const category = document.getElementById('ticket-category').value;
        const message = document.getElementById('ticket-message').value.trim();

        if (!message) return window.rpgAlert("Pesan laporan tidak boleh kosong!", "Peringatan");
        if (message.length < 10) return window.rpgAlert("Pesan terlalu singkat. Mohon jelaskan secara detail.", "Peringatan");

        const btn = document.querySelector('button[onclick="window.submitSupportTicket()"]');
        if (btn) { btn.disabled = true; btn.innerText = "⏳ Mengirim..."; }

        try {
            const currentUserUid = getUidCallback();
            const playerUsername = getUsernameCallback();

            await addDoc(collection(db, "supportTickets"), {
                senderUid: currentUserUid,
                senderName: playerUsername,
                category: category,
                message: message,
                status: "open",
                timestamp: serverTimestamp()
            });

            window.rpgAlert("✅ Tiket berhasil dikirim ke Meja Admin! Jika ada kompensasi, Admin akan mengirimkannya ke Kotak Surat Anda.", "Laporan Terkirim");
            document.getElementById('ticket-message').value = "";
        } catch (err) {
            window.rpgAlert("Gagal mengirim tiket: " + err.message, "Error");
        } finally {
            if (btn) { btn.disabled = false; btn.innerText = "✉️ Kirim Tiket"; }
        }
    };

    // 2. Fungsi Lihat Tiket Saya (Real-time listener)
    window.listenToMyTickets = function () {
        const listDiv = document.getElementById('my-ticket-list');
        const currentUserUid = getUidCallback();
        
        if (!listDiv || !currentUserUid) return;

        const q = query(collection(db, "supportTickets"), where("senderUid", "==", currentUserUid), orderBy("timestamp", "desc"));

        if (unsubMyTickets) unsubMyTickets();

        unsubMyTickets = onSnapshot(q, (snapshot) => {
            if (snapshot.empty) {
                listDiv.innerHTML = `<div style="text-align: center; color: #aaa; padding: 15px; font-size: 12px; background: #1a1a24; border-radius: 4px;">Anda belum pernah membuat laporan bantuan.</div>`;
                return;
            }

            listDiv.innerHTML = "";
            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                const time = data.timestamp ? data.timestamp.toDate().toLocaleString('id-ID') : 'Baru saja';

                const isOpen = data.status === "open";
                const statusHtml = isOpen
                    ? `<span style="background: #e67e22; color: #fff; font-size: 9px; padding: 2px 6px; border-radius: 3px; font-weight: bold;">⏳ Menunggu Admin</span>`
                    : `<span style="background: #28a745; color: #fff; font-size: 9px; padding: 2px 6px; border-radius: 3px; font-weight: bold;">✅ Selesai</span>`;

                let adminReplyHtml = "";
                if (!isOpen && data.adminReply) {
                    adminReplyHtml = `<div style="margin-top: 8px; padding: 8px; background: #121216; border-left: 3px solid #28a745; font-size: 11px; color: #a6e3a1; font-style: italic;">Admin: "${data.adminReply}"</div>`;
                }

                let catColor = "#00d2ff"; // Default: GENERAL/TANYA
                if (data.category === "BUG") catColor = "#dc3545"; // Merah
                if (data.category === "REPORT") catColor = "#ffca28"; // Kuning Emas

                listDiv.innerHTML += `
                    <div style="background: #1a1a24; padding: 10px; border-radius: 4px; border-left: 3px solid ${catColor}; border-bottom: 1px solid #333; margin-bottom: 8px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 5px; align-items: center;">
                            <span style="color: ${catColor}; font-size: 11px; font-weight: bold;">[${data.category}]</span>
                            ${statusHtml}
                        </div>
                        <div style="color: #ccc; font-size: 12px; margin-bottom: 5px;">"${data.message}"</div>
                        <div style="color: #777; font-size: 10px;">Dibuat: ${time}</div>
                        ${adminReplyHtml}
                    </div>
                `;
            });
        });
    };
}