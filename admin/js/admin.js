// File: admin.js (Core Hub)
import { db, auth } from '../../js/firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { collection, doc, getDoc, getDocs, addDoc, serverTimestamp, query, where, orderBy, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Mengimpor semua modul fitur agar ikut berjalan
import './admin-mail.js';
import './admin-player.js';
import './admin-system.js';
import './admin-guild.js';
import './admin-market.js';
import './admin-tickets.js';
import './admin-monsters.js';
import './admin-items.js';
import './admin-boss.js';
import './admin-maintenance.js';

window.adminUid = null;

// ==========================================
// SISTEM NAVIGASI SIDEBAR
// ==========================================
window.openAdminTab = function (tabId, btnElement) {
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

window.listenToAdminLogs = function () {
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
// STATISTIK SERVER (DIPERBARUI FULL)
// ==========================================
async function loadServerStats() {
    try {
        // 1. Variabel Penampung
        const userSnapshot = await getDocs(collection(db, "users"));
        let totalPlayers = 0;
        let totalGold = 0;
        let totalCoin = 0;
        let totalBannedOrFrozen = 0;

        let totalLevel = 0;
        let active24h = 0;

        // Variabel Baru
        let totalWarrior = 0;
        let totalMage = 0;
        let playersInPK = 0;
        let totalTowerFloor = 0;

        const now = Date.now();
        const ONE_DAY_MS = 24 * 60 * 60 * 1000;

        // 2. Loop Data Pemain (Satu putaran untuk semua data, menghemat kuota pembacaan database)
        userSnapshot.forEach((docSnap) => {
            totalPlayers++;
            const data = docSnap.data();

            // Hitung Ekonomi
            totalGold += (data.gold || 0) + (data.bankGold || 0) + (data.auctionBalanceGold || 0);
            totalCoin += (data.coin || 0) + (data.auctionBalanceCoin || 0);

            // Hitung Keamanan
            if (data.banned || data.isFrozen) totalBannedOrFrozen++;

            // Hitung Level & Tower
            totalLevel += (data.level || 1);
            totalTowerFloor += (data.towerFloor || 1);

            // Hitung Class
            if (data.characterClass === 'Warrior') totalWarrior++;
            else if (data.characterClass === 'Mage') totalMage++;

            // Hitung Posisi PK
            if (data.inPkZone === true) playersInPK++;

            // Hitung Aktivitas
            if (data.lastActive && (now - data.lastActive) <= ONE_DAY_MS) {
                active24h++;
            }
        });

        const avgLevel = totalPlayers > 0 ? Math.floor(totalLevel / totalPlayers) : 0;
        const avgTower = totalPlayers > 0 ? Math.floor(totalTowerFloor / totalPlayers) : 0;

        // 3. Ambil data Eksternal (Guild, Tiket, Pasar) menggunakan .size untuk kecepatan
        const guildSnapshot = await getDocs(collection(db, "guilds"));
        const totalGuilds = guildSnapshot.size;

        const ticketSnapshot = await getDocs(query(collection(db, "supportTickets"), where("status", "==", "open")));
        const openTickets = ticketSnapshot.size;

        const marketSnapshot = await getDocs(collection(db, "market"));
        const auctionItems = marketSnapshot.size;

        // 4. Render ke Layar Dashboard
        document.getElementById('stat-total-players').innerText = totalPlayers.toLocaleString();
        document.getElementById('stat-total-gold').innerText = totalGold.toLocaleString();
        document.getElementById('stat-total-coin').innerText = totalCoin.toLocaleString();

        if (document.getElementById('stat-total-banned')) document.getElementById('stat-total-banned').innerText = totalBannedOrFrozen.toLocaleString();
        if (document.getElementById('stat-total-guilds')) document.getElementById('stat-total-guilds').innerText = totalGuilds.toLocaleString();
        if (document.getElementById('stat-active-players')) document.getElementById('stat-active-players').innerText = active24h.toLocaleString();
        if (document.getElementById('stat-avg-level')) document.getElementById('stat-avg-level').innerText = avgLevel.toLocaleString();
        if (document.getElementById('stat-open-tickets')) document.getElementById('stat-open-tickets').innerText = openTickets.toLocaleString();

        // Render Metrik Baru
        if (document.getElementById('stat-class-warrior')) document.getElementById('stat-class-warrior').innerText = totalWarrior.toLocaleString();
        if (document.getElementById('stat-class-mage')) document.getElementById('stat-class-mage').innerText = totalMage.toLocaleString();
        if (document.getElementById('stat-pk-players')) document.getElementById('stat-pk-players').innerText = playersInPK.toLocaleString();
        if (document.getElementById('stat-auction-items')) document.getElementById('stat-auction-items').innerText = auctionItems.toLocaleString();
        if (document.getElementById('stat-avg-tower')) document.getElementById('stat-avg-tower').innerText = avgTower.toLocaleString();

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
                if (window.listenToMaintenanceStatus) window.listenToMaintenanceStatus();
                if (window.listenToAdminLogs) window.listenToAdminLogs();
                if (window.populateItemDropdown) window.populateItemDropdown();
                if (window.listenToGlobalEvents) window.listenToGlobalEvents();
                if (window.listenToGiftCodes) window.listenToGiftCodes();
                if (window.listenToMarketStatus) window.listenToMarketStatus();
                if (window.listenToLiveMarket) window.listenToLiveMarket();
                if (window.populateTicketItemDropdown) window.populateTicketItemDropdown();
                if (window.listenToTickets) window.listenToTickets();
                if (window.populateMonsterItemDropdown) window.populateMonsterItemDropdown();
                if (window.listenToMonsters) window.listenToMonsters();
                if (window.listenToItemsDb) window.listenToItemsDb();
                if (window.populateWorldBossItemDropdowns) window.populateWorldBossItemDropdowns();
            } else {
                alert("Akses Ditolak!"); window.location.href = '../index.html';
            }
        } catch (err) { alert("Gagal memverifikasi status."); }
    } else { window.location.href = '../index.html'; }
});