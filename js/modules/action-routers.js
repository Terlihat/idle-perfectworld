// ==========================================
// SISTEM ROUTER & EVENT LISTENER GLOBAL
// ==========================================
import { MONSTER_DB } from '../data/monsters.js';

export function setupActionRouters() {
    // --- SISTEM PEMBACA INFO DROP BOS FB ---
    document.addEventListener('change', (e) => {
        if (e.target.id === 'fb-select') {
            const bossKey = e.target.value;
            const boss = MONSTER_DB[bossKey];

            const infoBox = document.getElementById('fb-drop-info');
            const textBox = document.getElementById('fb-drop-text');

            if (boss && infoBox && textBox) {
                let dropsInfo = [];

                if (boss.drop) dropsInfo.push(`[${boss.drop.item}] (${(boss.drop.chance * 100).toFixed(0)}%)`);
                if (boss.drops && Array.isArray(boss.drops)) {
                    boss.drops.forEach(d => dropsInfo.push(`[${d.item}] (${(d.chance * 100).toFixed(0)}%)`));
                }

                if (dropsInfo.length > 0) {
                    textBox.innerText = dropsInfo.join(' | ');
                } else {
                    textBox.innerText = "Hanya EXP & Gold";
                }
                infoBox.style.display = 'block';
            }
        }
    });

    // --- NAVIGASI TAB BURSA KOIN ---
    document.addEventListener('click', (e) => {
        if (e.target.id === 'btn-tab-cmb') {
            document.getElementById('tab-cm-buy').style.display = 'block';
            document.getElementById('tab-cm-sell').style.display = 'none';
            document.getElementById('tab-cm-wallet').style.display = 'none';
        } else if (e.target.id === 'btn-tab-cms') {
            document.getElementById('tab-cm-buy').style.display = 'none';
            document.getElementById('tab-cm-sell').style.display = 'block';
            document.getElementById('tab-cm-wallet').style.display = 'none';
        } else if (e.target.id === 'btn-tab-cmw') {
            document.getElementById('tab-cm-buy').style.display = 'none';
            document.getElementById('tab-cm-sell').style.display = 'none';
            document.getElementById('tab-cm-wallet').style.display = 'block';
        }
    });

    // --- PEMICU OTOMATIS SAAT TOMBOL MENU DIKLIK (CRAFTING) ---
    document.addEventListener('click', function (e) {
        if (e.target.id === 'btn-mode-crafting' || e.target.id === 'btn-mode-blacksmith' || (e.target.innerText && e.target.innerText.includes('CRAFT'))) {
            setTimeout(() => {
                if (typeof window.renderCraftingUI === 'function') {
                    const inv = window.currentInventoryData || {};
                    // Karena file ini terpisah, kita memanggil stat dari window jika ada
                    const lvl = (typeof window.currentPlayerStats !== 'undefined' && window.currentPlayerStats) ? (window.currentPlayerStats.level || 1) : 1;
                    const gold = (typeof window.currentPlayerStats !== 'undefined' && window.currentPlayerStats) ? (window.currentPlayerStats.gold || 0) : 0;
                    window.renderCraftingUI(inv, lvl, gold);
                }
            }, 100); 
        }
    });
}