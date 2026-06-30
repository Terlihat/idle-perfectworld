// File: admin.js (Core Hub)
import { db, auth } from '../../js/firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { collection, doc, getDoc, getDocs, addDoc, serverTimestamp, query, orderBy, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Mengimpor semua modul fitur agar ikut berjalan
import './admin-mail.js';
import './admin-player.js';
import './admin-system.js';
import './admin-guild.js';

window.adminUid = null;

// ==========================================
// SISTEM NAVIGASI SIDEBAR
// ==========================================
window.openAdminTab = function(tabId, btnElement) {
    const tabs = document.querySelectorAll('.admin-tab-section');
    tabs.forEach(tab => tab.style.display = 'none');
    const activeTab = document.getElementById(tabId);
    if (activeTab) activeTab.style.display = 'block';
    const buttons = document.querySelectorAll('.admin-sidebar .tab-link');
    buttons.forEach(btn => btn.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');
};

document.getElementById('btn-home')?.addEventListener('click', () => { window.location.href = '../index.html'; });

// ==========================================
// SISTEM AUDIT LOG
// ==========================================
window.logAdminAction = async function (actionType, details) {
    try {
        await addDoc(collection(db, "adminLogs"), {
            adminUid: window.adminUid || "UNKNOWN",
            actionType: actionType,
            details: details,
            timestamp: serverTimestamp()
        });
    } catch (err) { console.error("Gagal mencatat log:", err); }
};

window.listenToAdminLogs = function() {
    const listDiv = document.getElementById('admin-log-list');
    if (!listDiv) return;
    const q = query(collection(db, "adminLogs"), orderBy("timestamp", "desc"), limit(50));
    onSnapshot(q, (snapshot) => {
        listDiv.innerHTML = "";
        if (snapshot.empty) return listDiv.innerHTML = `<div style="text-align: center; color: #aaa; padding: 10px; font-size: 13px;">Belum ada catatan log.</div>`;
        
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const time = data.timestamp ? data.timestamp.toDate().toLocaleString('id-ID') : 'Baru saja...';
            let typeColor = "#fff"; let typeBg = "#333";
            
            if (data.actionType === "BANNED") { typeBg = "#dc3545"; }
            else if (data.actionType === "INJECT") { typeBg = "#28a745"; }
            else if (data.actionType === "ECONOMY") { typeColor = "#000"; typeBg = "#ffca28"; }
            else if (data.actionType === "SYSTEM") { typeColor = "#000"; typeBg = "#00d2ff"; }
            else if (data.actionType === "MAIL") { typeBg = "#6f42c1"; }

            listDiv.innerHTML += `
                <div style="padding: 10px; border-bottom: 1px solid #333; background: #1a1a24; margin-bottom: 5px; border-radius: 4px;">
                    <div style="font-size: 11px; margin-bottom: 5px; color: #aaa;">
                        <span style="background: ${typeBg}; color: ${typeColor}; padding: 2px 6px; border-radius: 3px; font-weight: bold; margin-right: 8px;">${data.actionType}</span> 🕰️ ${time}
                    </div>
                    <div style="color: #fff; font-size: 13px; line-height: 1.4;">${data.details}</div>
                </div>`;
        });
    });
};

// ==========================================
// STATISTIK SERVER
// ==========================================
async function loadServerStats() {
    try {
        // 1. Ambil dan hitung data pemain
        const userSnapshot = await getDocs(collection(db, "users"));
        let totalPlayers = 0; 
        let totalGold = 0; 
        let totalCoin = 0;
        let totalBannedOrFrozen = 0;

        userSnapshot.forEach((doc) => {
            totalPlayers++; 
            const data = doc.data();
            totalGold += (data.gold || 0) + (data.bankGold || 0);
            totalCoin += (data.coin || 0);
            
            // Cek integritas akun (Apakah di-ban atau dibekukan?)
            if (data.banned || data.isFrozen) {
                totalBannedOrFrozen++;
            }
        });

        // 2. Ambil dan hitung data Guild
        const guildSnapshot = await getDocs(collection(db, "guilds"));
        const totalGuilds = guildSnapshot.size; // .size langsung mengembalikan jumlah dokumen

        // 3. Render angka ke layar Dashboard
        document.getElementById('stat-total-players').innerText = totalPlayers.toLocaleString();
        document.getElementById('stat-total-gold').innerText = totalGold.toLocaleString();
        document.getElementById('stat-total-coin').innerText = totalCoin.toLocaleString();
        
        // Render UI metrik baru (gunakan if untuk mencegah error jika elemen belum termuat)
        const statBanned = document.getElementById('stat-total-banned');
        if (statBanned) statBanned.innerText = totalBannedOrFrozen.toLocaleString();
        
        const statGuilds = document.getElementById('stat-total-guilds');
        if (statGuilds) statGuilds.innerText = totalGuilds.toLocaleString();

    } catch (err) { 
        console.error("Gagal memuat statistik server:", err); 
    }
}

// ==========================================
// VERIFIKASI AKSES ADMIN (INIT)
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        window.adminUid = user.uid;
        try {
            const docSnap = await getDoc(doc(db, "users", window.adminUid));
            if (docSnap.exists() && docSnap.data().role === 'admin') {
                document.getElementById('loading-screen').style.display = 'none';
                document.getElementById('admin-content').style.display = 'block';

                // Panggil semua fungsi inisialisasi modul
                loadServerStats();
                if(window.listenToAdminLogs) window.listenToAdminLogs();
                if(window.populateItemDropdown) window.populateItemDropdown();
                if(window.listenToGlobalEvents) window.listenToGlobalEvents();
                if(window.listenToGiftCodes) window.listenToGiftCodes();
            } else {
                alert("Akses Ditolak!"); window.location.href = '../index.html';
            }
        } catch (err) { alert("Gagal memverifikasi status."); }
    } else { window.location.href = '../index.html'; }
});