// File: js/ui-loader.js

export async function loadUIComponents() {
    const components = [
        // --- Layar Utama ---
        { id: 'screen-auth', file: './components/auth.html' },
        { id: 'screen-char-select', file: './components/char-select.html' },

        // --- Header & Navigasi (Komponen Baru) ---
        { id: 'component-navigation', file: './components/navigation.html' },

        // --- Kolom 1 (Kiri) ---
        { id: 'panel-profile', file: './components/player-profile.html' },
        { id: 'panel-inventory', file: './components/inventory.html' },
        { id: 'panel-crafting', file: './components/crafting.html' },

        // --- Kolom 2 (Tengah) ---
        { id: 'panel-world-boss', file: './components/world-boss.html' },
        { id: 'panel-tower', file: './components/tower.html' },
        { id: 'panel-dungeon', file: './components/dungeon.html' },
        { id: 'panel-party', file: './components/party.html' },
        { id: 'panel-quest', file: './components/quest.html' },
        { id: 'panel-blacksmith', file: './components/blacksmith.html' },
        { id: 'panel-pk', file: './components/pk.html' }, // Komponen Baru
        { id: 'panel-auction', file: './components/auction.html' },
        { id: 'panel-refine-transfer', file: './components/refine-transfer.html' },

        // --- Kolom 3 (Kanan) ---
        { id: 'panel-leaderboard', file: './components/leaderboard.html' }, // Komponen Baru
        { id: 'panel-mall', file: './components/mall.html' },
        { id: 'panel-shop', file: './components/shop.html' },
        { id: 'panel-coin-market', file: './components/coin-market.html' },
        { id: 'panel-mailbox', file: './components/mailbox.html' },
        { id: 'panel-bank', file: './components/bank.html' },
        { id: 'panel-guild', file: './components/guild.html' },
        { id: 'panel-chat', file: './components/chat-box.html' },

        // --- Sistem Modal & Pop-up (Komponen Baru) ---
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
}