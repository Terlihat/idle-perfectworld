// File: admin-mail.js
import { db } from '../../js/firebase-config.js';
import { collection, addDoc, getDocs, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { ITEM_DB } from '../../js/data/items.js';

window.populateItemDropdown = function() {
    const selectBox = document.getElementById('mail-item-name');
    const injectBox = document.getElementById('inject-item-name');
    const giftBox = document.getElementById('gift-code-item-name');

    if (selectBox) selectBox.innerHTML = '<option value="">-- Tidak Kirim Item --</option>';
    if (injectBox) injectBox.innerHTML = '<option value="">-- Pilih Item untuk Disuntikkan --</option>';
    if (giftBox) giftBox.innerHTML = '<option value="">-- Tidak Ada Item --</option>';

    Object.keys(ITEM_DB).forEach(itemName => {
        if (selectBox) selectBox.innerHTML += `<option value="${itemName}">${itemName}</option>`;
        if (injectBox) injectBox.innerHTML += `<option value="${itemName}">${itemName}</option>`;
        if (giftBox) giftBox.innerHTML += `<option value="${itemName}">${itemName}</option>`;
    });
};

document.getElementById('btn-send-mail')?.addEventListener('click', async () => {
    const targetUid = document.getElementById('mail-target-uid').value.trim();
    const title = document.getElementById('mail-title').value.trim();
    const message = document.getElementById('mail-message').value.trim();
    const gold = parseInt(document.getElementById('mail-gold').value) || 0;
    const coin = parseInt(document.getElementById('mail-coin').value) || 0;
    const itemName = document.getElementById('mail-item-name').value;
    const itemQty = parseInt(document.getElementById('mail-item-qty')?.value) || 1;

    if (!title) return alert("Judul Surat wajib diisi!");

    const btnSend = document.getElementById('btn-send-mail');
    btnSend.disabled = true; btnSend.innerText = "Menyiapkan Surat...";

    try {
        let attachmentsData = null;
        if (itemName) attachmentsData = { itemName, qty: itemQty, gold, coin };
        else if (gold > 0 || coin > 0) attachmentsData = { gold, coin };

        const mailData = { senderId: "SYSTEM", senderName: "Administrator", title, message, attachments: attachmentsData, isClaimed: false, timestamp: serverTimestamp() };

        if (targetUid) {
            await addDoc(collection(db, "users", targetUid, "mailbox"), mailData);
            if(window.logAdminAction) window.logAdminAction("MAIL", `Mengirim surat "${title}" ke UID: ${targetUid}. Lampiran: ${gold}G, ${coin}C, Item: ${itemName}`);
            alert(`✅ Surat berhasil dikirim ke UID: ${targetUid}`);
        } else {
            if (!confirm("⚠️ Lakukan Broadcast ke SELURUH PEMAIN?")) return;
            btnSend.innerText = "Mengambil data...";
            const userSnapshot = await getDocs(collection(db, "users"));
            let sendPromises = [];
            userSnapshot.forEach((userDoc) => { sendPromises.push(addDoc(collection(db, "users", userDoc.id, "mailbox"), mailData)); });
            
            btnSend.innerText = `Mengirim ke ${sendPromises.length} pemain...`;
            await Promise.all(sendPromises);
            
            if(window.logAdminAction) window.logAdminAction("MAIL", `BROADCAST surat "${title}" ke ${sendPromises.length} pemain. Lampiran: ${gold}G, ${coin}C, Item: ${itemName}`);
            alert(`📢 BROADCAST SUKSES ke ${sendPromises.length} pemain.`);
        }
		
		document.getElementById('mail-title').value = "";
        document.getElementById('mail-message').value = "";
        document.getElementById('mail-gold').value = "0";
        document.getElementById('mail-coin').value = "0";
        document.getElementById('mail-item-name').value = "";
        if (document.getElementById('mail-item-qty')) document.getElementById('mail-item-qty').value = "1";
		
    } catch (err) { alert("Gagal mengirim surat: " + err.message);
    } finally { btnSend.disabled = false; btnSend.innerText = "Kirim Surat Sekarang"; }
});