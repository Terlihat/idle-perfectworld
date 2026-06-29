// ===================================================
// SISTEM MASTER TOGGLE MODE INVENTORY
// ===================================================
window.setInventoryMode = function (namaMode, idTombol, idPanel, warnaAktif) {
    const semuaPanel = ['panel-refine-transfer', 'panel-blacksmith', 'panel-crafting', 'panel-bank', 'panel-auction'];

    // FUNGSI RESET: Bersihkan semua tombol ke state awal (abu-abu/mati)
    const resetSemuaTombol = () => {
        ['equip', 'sell', 'dismantle', 'bank', 'auction', 'blacksmith', 'transfer', 'crafting'].forEach(m => {
            const btn = document.getElementById('btn-mode-' + m);
            if (btn) {
                btn.className = ""; // Cabut semua border
                if (m !== 'equip') {
                    btn.style.background = '#495057'; // Tombol lain kembali abu-abu
                } else {
                    btn.style.background = ''; // Equip kembali ke default CSS
                }
            }
        });
    };

    // ==========================================
    // LOGIKA MATIKAN (KEMBALI KE DEFAULT/PAKAI)
    // ==========================================
    if (window.inventoryMode === namaMode) {
        window.inventoryMode = 'EQUIP';

        semuaPanel.forEach(id => {
            const p = document.getElementById(id);
            if (p) p.style.display = 'none';
        });

        resetSemuaTombol();

        // Kembalikan border ke tombol Equip saja
        const btnEquip = document.getElementById('btn-mode-equip');
        if (btnEquip) {
            btnEquip.className = 'mode-active';
            btnEquip.style.background = '';
        }

        return false;
    }

    // ==========================================
    // LOGIKA NYALAKAN MODE BARU
    // ==========================================
    window.inventoryMode = namaMode;

    semuaPanel.forEach(id => {
        const p = document.getElementById(id);
        if (p) p.style.display = 'none';
    });

    if (idPanel) {
        const panel = document.getElementById(idPanel);
        if (panel) {
            panel.style.display = 'block';
            panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    resetSemuaTombol();

    // ==========================================
    // PERBAIKAN BORDER SERAGAM UNTUK SEMUA TOMBOL
    // ==========================================
    const btnActive = document.getElementById(idTombol);
    if (btnActive) {
        // Berikan class 'mode-active' ke SEMUA tombol yang diklik agar memiliki border dan ukuran yang sama persis
        btnActive.className = 'mode-active';

        // Lalu, timpa warna latar belakangnya sesuai identitas mode masing-masing
        if (namaMode !== 'EQUIP') {
            btnActive.style.background = warnaAktif;
        } else {
            btnActive.style.background = '';
        }
    }

    return true;
};

// ===================================================
// FUNGSI TOMBOL-TOMBOL INVENTORY
// ===================================================
window.activateEquipMode = function () { window.setInventoryMode('EQUIP', 'btn-mode-equip', null, ''); };
window.activateBankMode = function () { window.setInventoryMode('BANK', 'btn-mode-bank', 'panel-bank', '#007bff'); };
window.activateAuctionMode = function () { window.setInventoryMode('AUCTION', 'btn-mode-auction', 'panel-auction', '#6f42c1'); };

window.activateTransferMode = function () {
    // PERBAIKAN 2: Ubah nama mode menjadi 'TRANSFER' agar sesuai dengan game.js
    if (!window.setInventoryMode('TRANSFER', 'btn-mode-transfer', 'panel-refine-transfer', '#e83e8c')) return;
};

window.activateBlacksmithMode = function () {
    if (!window.setInventoryMode('BLACKSMITH', 'btn-mode-blacksmith', 'panel-blacksmith', '#ff9800')) return;

    setTimeout(() => {
        if (typeof window.renderCraftingUI === 'function') {
            const inv = window.currentInventoryData || {};
            const lvl = (typeof currentPlayerStats !== 'undefined' && currentPlayerStats) ? (currentPlayerStats.level || 1) : 1;
            const gold = (typeof currentPlayerStats !== 'undefined' && currentPlayerStats) ? (currentPlayerStats.gold || 0) : 0;
            window.renderCraftingUI(inv, lvl, gold);
        }
    }, 100);
};

window.activateCraftingMode = function () { if (!window.setInventoryMode('CRAFTING', 'btn-mode-crafting', 'panel-crafting', '#20c997')) return; };
window.activateSellMode = function () { window.setInventoryMode('SELL', 'btn-mode-sell', null, '#dc3545'); };
window.activateDismantleMode = function () { window.setInventoryMode('DISMANTLE', 'btn-mode-dismantle', null, '#d35400'); };