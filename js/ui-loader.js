// File: js/ui-loader.js

export async function loadUIComponents() {
    const components = [
        // --- Layar Utama ---
        { id: 'screen-auth', file: './components/auth.html' },
        { id: 'screen-char-select', file: './components/char-select.html' },

        // --- Header & Navigasi ---
        { id: 'component-navigation', file: './components/navigation.html' },

        // --- Kolom 1 (Kiri) ---
        { id: 'panel-profile', file: './components/player-profile.html' },
        { id: 'panel-inventory', file: './components/inventory.html' },
        { id: 'panel-crafting', file: './components/crafting.html' },

        // --- Kolom 2 (Tengah) ---
        { id: 'panel-world-boss', file: './components/world-boss.html' },
        { id: 'panel-tower', file: './components/tower.html' },
        { id: 'panel-afk', file: './components/expedition.html' },
        { id: 'panel-dungeon', file: './components/dungeon.html' },
        { id: 'panel-party', file: './components/party.html' },
        { id: 'panel-quest', file: './components/quest.html' },
        { id: 'panel-blacksmith', file: './components/blacksmith.html' },
        { id: 'panel-pk', file: './components/pk.html' },
        { id: 'panel-auction', file: './components/auction.html' },
        { id: 'panel-refine-transfer', file: './components/refine-transfer.html' },

        // --- Kolom 3 (Kanan) ---
        { id: 'panel-friends', file: './components/friends.html' },
        { id: 'panel-leaderboard', file: './components/leaderboard.html' },
        { id: 'panel-mall', file: './components/mall.html' },
        { id: 'panel-shop', file: './components/shop.html' },
        { id: 'panel-coin-market', file: './components/coin-market.html' },
        { id: 'panel-mailbox', file: './components/mailbox.html' },
        { id: 'panel-bank', file: './components/bank.html' },
        { id: 'panel-guild', file: './components/guild.html' },
        { id: 'panel-chat', file: './components/chat-box.html' },
        { id: 'panel-redeem-code', file: './components/redeem-code.html' },
        { id: 'panel-tickets', file: './components/tickets.html' },

        // --- Sistem Modal & Pop-up ---
        { id: 'component-modals', file: './components/modals.html' }
    ];

    for (let comp of components) {
        try {
            const response = await fetch(comp.file);
            if (response.ok) {
                const htmlContent = await response.text();
                const element = document.getElementById(comp.id);
                if (element) {
                    element.innerHTML = htmlContent;
                }
            } else {
                console.error(`Gagal memuat komponen: ${comp.file} (Status: ${response.status})`);
            }
        } catch (err) {
            console.error(`Error mengambil file ${comp.file}:`, err);
        }
    }

    if (typeof window.loadDungeonMonstersList === 'function') {
        window.loadDungeonMonstersList();
    }
}

// ==============================================================
// MANAJEMEN PANEL & RADAR LOKASI PEMAIN
// ==============================================================
window.togglePanel = function (panelId) {
    // 1. Daftar semua panel tengah dan kanan yang bisa diganti-ganti (Toggle)
    const toggleablePanels = [
        'panel-world-boss', 'panel-tower', 'panel-afk', 'panel-dungeon',
        'panel-party', 'panel-quest', 'panel-blacksmith', 'panel-pk',
        'panel-auction', 'panel-refine-transfer', 'panel-friends',
        'panel-leaderboard', 'panel-mall', 'panel-shop',
        'panel-coin-market', 'panel-mailbox', 'panel-bank',
        'panel-guild',
        'panel-redeem-code' // 🔥 Tambahkan panel redeem agar ikut logika toggle
    ];

    // 2. Sembunyikan semua panel tersebut
    toggleablePanels.forEach(id => {
        const p = document.getElementById(id);
        if (p) p.style.display = 'none';
    });

    // 3. Tampilkan hanya panel yang dituju
    const targetPanel = document.getElementById(panelId);
    if (targetPanel) {
        targetPanel.style.display = 'block';
    }

    // 4. --- SISTEM UPDATE LOKASI RADAR OTOMATIS ---
    if (typeof window.updateMyLocation === 'function') {
        if (panelId === 'panel-pk') {
            window.updateMyLocation("🌲 Dark Forest (Zona PK)");
        } else if (panelId === 'panel-afk') {
            window.updateMyLocation("⛺ Ekspedisi AFK");
        } else if (panelId === 'panel-world-boss') {
            window.updateMyLocation("👹 Melawan World Boss");
        } else if (panelId === 'panel-tower') {
            window.updateMyLocation("🗼 Menara Ilusi");
        } else if (panelId === 'panel-dungeon') {
            window.updateMyLocation("🏰 Menjelajah Dungeon");
        } else if (panelId === 'panel-party') {
            window.updateMyLocation("👥 Mencari Party Fuben");
        } else if (panelId === 'panel-auction') {
            window.updateMyLocation("⚖️ Rumah Lelang");
        } else if (panelId === 'panel-friends') {
            window.updateMyLocation("Kota Aman (Mengecek Teman)");
            if (typeof window.toggleFriendTab === 'function') {
                window.toggleFriendTab('list');
            }
        } else if (panelId === 'panel-redeem-code') {
            window.updateMyLocation("🎁 Menukarkan Kode Redeem");
        } else if (panelId === 'panel-tickets') {
            window.updateMyLocation("🎫 Meminta Bantuan Admin");
        } else {
            window.updateMyLocation("Kota Aman (Idle)");
        }
    }
};

window.bukaPanelKhusus = function (panelId) {
    const targetPanel = document.getElementById(panelId);
    if (targetPanel) targetPanel.style.display = 'block';
};