// File: admin-guild.js
import { db } from '../../js/firebase-config.js';
import { collection, doc, getDoc, getDocs, updateDoc, deleteDoc, query, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

let currentEditingGuildId = null;

document.getElementById('btn-search-guild')?.addEventListener('click', async () => {
    const searchValue = document.getElementById('admin-search-guild').value.trim();
    if (!searchValue) return alert("Masukkan Nama Guild!");
    try {
        const q = query(collection(db, "guilds"), where("name", "==", searchValue));
        const querySnapshot = await getDocs(q);
        
        let targetDoc = !querySnapshot.empty ? querySnapshot.docs[0] : null;
        if (!targetDoc) {
            const fallbackSnap = await getDoc(doc(db, "guilds", searchValue));
            if(fallbackSnap.exists()) targetDoc = fallbackSnap;
        }

        if (targetDoc) {
            currentEditingGuildId = targetDoc.id; const data = targetDoc.data();
            document.getElementById('admin-guild-name').innerText = data.name || targetDoc.id;
            document.getElementById('admin-guild-level').innerText = data.level || 1;
            document.getElementById('admin-guild-gold').innerText = (data.vaultGold || 0).toLocaleString();
            document.getElementById('admin-guild-leader').value = data.leaderId || "";
            document.getElementById('admin-guild-results').style.display = "block";
        } else {
            alert("❌ Guild tidak ditemukan!"); document.getElementById('admin-guild-results').style.display = "none";
        }
    } catch (err) { alert("Gagal mencari Guild: " + err.message); }
});

document.getElementById('btn-change-leader')?.addEventListener('click', async () => {
    if (!currentEditingGuildId) return;
    const newLeaderId = document.getElementById('admin-guild-leader').value.trim();
    if (!newLeaderId || !confirm(`Ganti ketua menjadi UID: ${newLeaderId}?`)) return;
    try {
        await updateDoc(doc(db, "guilds", currentEditingGuildId), { leaderId: newLeaderId });
        if(window.logAdminAction) window.logAdminAction("SYSTEM", `Mengganti Ketua Guild [${currentEditingGuildId}] ke UID: ${newLeaderId}`);
        alert("✅ Ketua Guild berhasil diganti!");
    } catch (err) { alert("Gagal mengganti ketua: " + err.message); }
});

document.getElementById('btn-disband-guild')?.addEventListener('click', async () => {
    if (!currentEditingGuildId || !confirm(`⚠️ BUBARKAN GUILD SECARA PAKSA?`)) return;
    try {
        await deleteDoc(doc(db, "guilds", currentEditingGuildId));
        if(window.logAdminAction) window.logAdminAction("SYSTEM", `Membubarkan paksa Guild: [${currentEditingGuildId}]`);
        document.getElementById('admin-guild-results').style.display = "none";
		document.getElementById('admin-search-guild').value = "";
        alert("💥 Guild berhasil dibubarkan!");
    } catch (err) { alert("Gagal membubarkan Guild: " + err.message); }
});