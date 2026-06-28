// ===================================================
// SISTEM MASTER TOGGLE MODE INVENTORY
// ===================================================
window.setInventoryMode = function (namaMode, idTombol, idPanel, warnaAktif) {
    const semuaPanel = ['panel-refine-transfer', 'panel-blacksmith', 'panel-crafting'];
    
    // LOGIKA MATIKAN (KEMBALI KE DEFAULT)
    if (window.inventoryMode === namaMode) {
        window.inventoryMode = 'EQUIP'; 
        
        semuaPanel.forEach(id => {
            const p = document.getElementById(id);
            if (p) p.style.display = 'none';
        });
        
        ['equip', 'sell', 'dismantle', 'bank', 'auction', 'blacksmith', 'transfer', 'crafting'].forEach(m => {
            const btn = document.getElementById('btn-mode-' + m);
            if (btn) {
                btn.classList.remove('mode-active');
                btn.style.background = '#495057';
            }
        });
        
        const btnEquip = document.getElementById('btn-mode-equip');
        if (btnEquip) {
            btnEquip.classList.add('mode-active');
            btnEquip.style.background = ''; 
        }
        
        return false; 
    }

    // LOGIKA NYALAKAN MODE BARU
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
    
    ['equip', 'sell', 'dismantle', 'bank', 'auction', 'blacksmith', 'transfer', 'crafting'].forEach(m => {
        const btn = document.getElementById('btn-mode-' + m);
        if (btn) {
            btn.classList.remove('mode-active');
            btn.style.background = '#495057';
        }
    });
    
    const btnActive = document.getElementById(idTombol);
    if (btnActive) {
        btnActive.style.background = warnaAktif;
    }
    
    return true; 
};

// ===================================================
// FUNGSI TOMBOL-TOMBOL INVENTORY
// ===================================================

window.activateTransferMode = function () {
    if (!window.setInventoryMode('waris', 'btn-mode-transfer', 'panel-refine-transfer', '#e83e8c')) return;
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

window.activateCraftingMode = function () {
    if (!window.setInventoryMode('CRAFTING', 'btn-mode-crafting', 'panel-crafting', '#20c997')) return;
};

window.activateSellMode = function () {
    window.setInventoryMode('SELL', 'btn-mode-sell', null, '#dc3545'); 
};

window.activateDismantleMode = function () {
    window.setInventoryMode('DISMANTLE', 'btn-mode-dismantle', null, '#d35400'); 
};