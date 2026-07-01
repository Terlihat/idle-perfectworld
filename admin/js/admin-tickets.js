// File: admin-tickets.js
import { db } from '../../js/firebase-config.js';
import { collection, doc, updateDoc, addDoc, onSnapshot, query, where, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { ITEM_DB } from '../../js/data/items.js';

// ==========================================
// 1. POPULASI DROPDOWN ITEM KOMPENSASI
// ==========================================
window.populateTicketItemDropdown = function() {
    const selectBox = document.getElementById('ticket-reply-item');
    if (!selectBox) return;
    
    selectBox.innerHTML = '<option value="">-- Tidak Kirim Item --</option>';
    if (typeof ITEM_DB !== 'undefined') {
        Object.keys(ITEM_DB).forEach(itemName => {
            selectBox.innerHTML += `<option value="${itemName}">${itemName}</option>`;
        });
    }
};

// ==========================================
// 2. LIVE LISTENER UNTUK TIKET BARU
// ==========================================
window.listenToTickets = function() {
    const listDiv = document.getElementById('admin-ticket-list');
    if (!listDiv) return;

    // Mengambil tiket yang statusnya masih 'open' (Belum dijawab)
    const q = query(collection(db, "supportTickets"), where("status", "==", "open"), orderBy("timestamp", "asc"));
    
    onSnapshot(q, (snapshot) => {
        listDiv.innerHTML = "";
        
        if (snapshot.empty) {
            listDiv.innerHTML = `<div style="text-align: center; color: #aaa; padding: 30px; font-size: 13px;">🎉 Bersih! Tidak ada tiket atau keluhan yang belum dijawab.</div>`;
            return;
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const ticketId = docSnap.id;
            const time = data.timestamp ? data.timestamp.toDate().toLocaleString('id-ID') : 'Baru saja';
            
            // Format teks pendek untuk preview
            const shortMsg = data.message && data.message.length > 50 ? data.message.substring(0, 50) + '...' : data.message;
            
            let catColor = "#00d2ff";
            if (data.category === "BUG") catColor = "#dc3545";
            if (data.category === "REPORT") catColor = "#ff9800";

            listDiv.innerHTML += `
                <div style="padding: 12px; border-bottom: 1px solid #333; background: #1a1a24; margin-bottom: 8px; border-radius: 4px; border-left: 3px solid ${catColor};">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span style="color: #ffca28; font-weight: bold; font-size: 14px;">${data.senderName} <span style="color: #777; font-size: 10px; font-weight: normal;">(${data.senderUid})</span></span>
                        <span style="background: ${catColor}; color: #000; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: bold;">${data.category || 'UMUM'}</span>
                    </div>
                    <div style="color: #ddd; font-size: 12px; margin-bottom: 8px;">"${shortMsg}"</div>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="color: #777; font-size: 10px;">🕒 ${time}</span>
                        <button class="btn-open-ticket" data-id="${ticketId}" data-uid="${data.senderUid}" data-name="${data.senderName}" data-msg="${encodeURIComponent(data.message)}" style="background: #0366d6; color: white; padding: 5px 12px; font-size: 11px; font-weight: bold; border: none; border-radius: 4px; cursor: pointer;">Buka & Balas</button>
                    </div>
                </div>`;
        });

        // Event Listener untuk tombol Buka & Balas
        document.querySelectorAll('.btn-open-ticket').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.target;
                document.getElementById('ticket-active-id').value = target.getAttribute('data-id');
                document.getElementById('ticket-active-uid').value = target.getAttribute('data-uid');
                document.getElementById('ticket-reply-target').innerText = target.getAttribute('data-name');
                document.getElementById('ticket-reply-message').innerText = decodeURIComponent(target.getAttribute('data-msg'));
                
                // Aktifkan panel balasan
                const replyPanel = document.getElementById('ticket-reply-panel');
                replyPanel.style.opacity = "1";
                replyPanel.style.pointerEvents = "auto";
                document.getElementById('ticket-reply-text').focus();
            });
        });
    });
};

// ==========================================
// 3. KIRIM BALASAN & TUTUP TIKET
// ==========================================
document.getElementById('btn-submit-ticket-reply')?.addEventListener('click', async () => {
    const ticketId = document.getElementById('ticket-active-id').value;
    const targetUid = document.getElementById('ticket-active-uid').value;
    const replyText = document.getElementById('ticket-reply-text').value.trim();
    
    const gold = parseInt(document.getElementById('ticket-reply-gold').value) || 0;
    const coin = parseInt(document.getElementById('ticket-reply-coin').value) || 0;
    const itemName = document.getElementById('ticket-reply-item').value;
    const itemQty = parseInt(document.getElementById('ticket-reply-qty').value) || 1;

    if (!ticketId || !targetUid) return alert("Pilih tiket terlebih dahulu!");
    if (!replyText) return alert("Pesan balasan tidak boleh kosong!");

    const btnSubmit = document.getElementById('btn-submit-ticket-reply');
    btnSubmit.disabled = true; btnSubmit.innerText = "Mengirim...";

    try {
        // 1. Susun lampiran jika ada kompensasi
        let attachmentsData = null;
        if (itemName) attachmentsData = { itemName, qty: itemQty, gold, coin };
        else if (gold > 0 || coin > 0) attachmentsData = { gold, coin };

        // 2. Kirim balasan ke Kotak Surat (Mailbox) pemain
        const mailData = { 
            senderId: "SYSTEM", 
            senderName: "Customer Support 🛡️", 
            title: "Balasan Tiket Bantuan", 
            message: replyText, 
            attachments: attachmentsData, 
            isClaimed: false, 
            timestamp: serverTimestamp() 
        };
        await addDoc(collection(db, "users", targetUid, "mailbox"), mailData);

        // 3. Ubah status tiket menjadi "closed" (Ditutup)
        await updateDoc(doc(db, "supportTickets", ticketId), { 
            status: "closed",
            resolvedAt: serverTimestamp(),
            adminReply: replyText
        });

        // 4. Catat ke Log Audit
        if(window.logAdminAction) {
            window.logAdminAction("SYSTEM", `Menutup tiket [${ticketId}] dari UID: ${targetUid}. Kompensasi: ${gold}G, ${coin}C, Item: ${itemName}`);
        }

        alert("✅ Balasan dan kompensasi berhasil dikirim ke kotak surat pemain!");
        
        // 5. Reset Formulir dan matikan panel
        document.getElementById('ticket-reply-text').value = "";
        document.getElementById('ticket-reply-gold').value = "0";
        document.getElementById('ticket-reply-coin').value = "0";
        document.getElementById('ticket-reply-item').value = "";
        
        const replyPanel = document.getElementById('ticket-reply-panel');
        replyPanel.style.opacity = "0.5";
        replyPanel.style.pointerEvents = "none";
        document.getElementById('ticket-reply-target').innerText = "-";
        document.getElementById('ticket-reply-message').innerText = "...";

    } catch (err) {
        alert("Gagal memproses tiket: " + err.message);
    } finally {
        btnSubmit.disabled = false; btnSubmit.innerText = "Kirim Balasan & Tutup Tiket";
    }
});