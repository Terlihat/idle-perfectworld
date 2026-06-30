// File: admin-system.js
import { db } from '../../js/firebase-config.js';
import { collection, doc, getDoc, updateDoc, setDoc, onSnapshot, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// -- WORLD BOSS --
document.getElementById('btn-admin-spawn-wb')?.addEventListener('click', async () => {
    const bossName = document.getElementById('wb-admin-name').value || "Boss";
    const bossHp = parseInt(document.getElementById('wb-admin-hp').value) || 5000000;
    if (!confirm(`Munculkan Boss ${bossName}?`)) return;
    try {
        await setDoc(doc(db, "events", "worldBoss"), { name: bossName, maxHp: bossHp, currentHp: bossHp, isActive: true, participants: {} });
        if(window.logAdminAction) window.logAdminAction("SYSTEM", `Memunculkan Boss: ${bossName}`);
        alert("✅ Boss Dimunculkan!");
    } catch (err) { alert("Gagal: " + err.message); }
});

document.getElementById('btn-admin-kill-wb')?.addEventListener('click', async () => {
    if (!confirm("Hentikan Boss secara paksa?")) return;
    try {
        await updateDoc(doc(db, "events", "worldBoss"), { isActive: false, currentHp: 0 });
        if(window.logAdminAction) window.logAdminAction("SYSTEM", `Menghentikan World Boss paksa.`);
        alert("✅ Boss Dihentikan!");
    } catch (err) { alert("Gagal: " + err.message); }
});

// -- SERVER BUFF EVENTS --
let isDoubleExpActive = false; let isDoubleDropActive = false;
window.listenToGlobalEvents = function() {
    onSnapshot(doc(db, "events", "serverBuffs"), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            isDoubleExpActive = !!data.doubleExp; isDoubleDropActive = !!data.doubleDrop;
            
            const expStatus = document.getElementById('status-exp-event'); const btnExp = document.getElementById('btn-toggle-exp');
            expStatus.innerText = isDoubleExpActive ? "[ ON ]" : "[ OFF ]";
            btnExp.innerText = isDoubleExpActive ? "Matikan Event" : "🚀 Aktifkan Event";
            
            const dropStatus = document.getElementById('status-drop-event'); const btnDrop = document.getElementById('btn-toggle-drop');
            dropStatus.innerText = isDoubleDropActive ? "[ ON ]" : "[ OFF ]";
            btnDrop.innerText = isDoubleDropActive ? "Matikan Event" : "🚀 Aktifkan Event";
        } else { setDoc(doc(db, "events", "serverBuffs"), { doubleExp: false, doubleDrop: false }); }
    });
};
document.getElementById('btn-toggle-exp')?.addEventListener('click', () => updateDoc(doc(db, "events", "serverBuffs"), { doubleExp: !isDoubleExpActive }));
document.getElementById('btn-toggle-drop')?.addEventListener('click', () => updateDoc(doc(db, "events", "serverBuffs"), { doubleDrop: !isDoubleDropActive }));

// -- REDEEM CODES --
window.listenToGiftCodes = function() {
    const listDiv = document.getElementById('active-giftcodes-list');
    if (!listDiv) return;
    onSnapshot(collection(db, "giftCodes"), (snapshot) => {
        listDiv.innerHTML = snapshot.empty ? `<div style="text-align: center; color: #aaa; padding: 10px;">Belum ada kode aktif.</div>` : "";
        snapshot.forEach((docSnap) => {
            const data = docSnap.data(); const code = docSnap.id;
            let rewardText = [];
            if (data.gold) rewardText.push(`💰 ${data.gold}`); if (data.coin) rewardText.push(`🪙 ${data.coin}`); if (data.itemName) rewardText.push(`📦 ${data.itemName}`);
            
            listDiv.innerHTML += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid #333; background: #1a1a24; margin-bottom: 5px;">
                    <div>
                        <div style="color: #00d2ff; font-weight: bold; font-size: 16px;">${code}</div>
                        <div style="color: #aaa; font-size: 11px;">Hadiah: ${rewardText.join(' | ')}</div>
                    </div>
                    <button class="btn-delete-code" data-code="${code}" style="background: #dc3545; color: white; padding: 6px; border: none; cursor: pointer;">Hapus</button>
                </div>`;
        });
        document.querySelectorAll('.btn-delete-code').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                if (confirm(`Hapus kode?`)) await deleteDoc(doc(db, "giftCodes", e.target.getAttribute('data-code')));
            });
        });
    });
};

document.getElementById('btn-create-giftcode')?.addEventListener('click', async () => {
    let codeName = document.getElementById('gift-code-name').value.trim().toUpperCase().replace(/\s+/g, '');
    const limit = parseInt(document.getElementById('gift-code-limit').value) || 100;
    const gold = parseInt(document.getElementById('gift-code-gold').value) || 0;
    const coin = parseInt(document.getElementById('gift-code-coin').value) || 0;
    const itemName = document.getElementById('gift-code-item-name').value;
    const itemQty = parseInt(document.getElementById('gift-code-item-qty').value) || 1;

    if (!codeName || codeName.length < 4) return alert("Kode minimal 4 huruf!");
    try {
        const codeRef = doc(db, "giftCodes", codeName);
        if ((await getDoc(codeRef)).exists()) return alert("Kode sudah ada!");
        
        await setDoc(codeRef, { limit, gold, coin, itemName: itemName || null, itemQty: itemName ? itemQty : 0, claimedBy: [], createdAt: serverTimestamp() });
        if(window.logAdminAction) window.logAdminAction("SYSTEM", `Membuat Kode Redeem [${codeName}] limit ${limit}`);
        alert(`✅ Kode Redeem dibuat.`);
    } catch (err) { alert("Gagal: " + err.message); }
});