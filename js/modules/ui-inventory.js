import { escapeHTML } from './ui-utils.js'; // getIconHTML dihapus karena kita pakai sprite
import { CRAFTING_RECIPES } from './crafting.js';
// import { ITEM_DB } from '../data/items.js'; // 🔥 Dihapus, beralih ke CLOUD_ITEM_DB

export function renderInventoryUI(inventory) {
    const invGrid = document.getElementById('inventory-grid');
    if (!invGrid) return;
    let html = "";
    let renderSlots = [];
    let items = Object.entries(inventory || {}).sort((a, b) => a[0].localeCompare(b[0]));

    for (const [name, totalQty] of items) {
        if (totalQty <= 0) continue;
        let baseName = name.replace(/\s\[\+\d+\]$/, '');
        let badgeHtml = "";
        const match = name.match(/\[\+(\d+)\]$/);
        if (match) {
            badgeHtml = `<div style="position:absolute; top:-5px; right:-5px; background:#dc3545; color:white; font-size:10px; font-weight:bold; padding:2px 4px; border-radius:4px; z-index:10; box-shadow: 0 0 3px black;">+${match[1]}</div>`;
        }

        // 🔥 BACA DARI CLOUD CACHE 
        const itemInfo = window.CLOUD_ITEM_DB[baseName] || { type: 'misc', col: 0, row: 0, goldPrice: 0 };

        // Atur batas default ke 50000 sesuai keinginan Anda
        let maxStack = 50000;

        // Pengecualian HANYA untuk Equipment agar sistem Tempa (+1, +2) tidak error
        if (['weapon', 'armor', 'accessory', 'mount', 'equipment'].includes(itemInfo.type)) {
            maxStack = 1;
        }

        let remainingQty = totalQty;
        while (remainingQty > 0) {
            let currentSlotQty = Math.min(remainingQty, maxStack);
            renderSlots.push({
                name: name,
                baseName: baseName,
                badgeHtml: badgeHtml,
                qty: currentSlotQty,
                col: itemInfo.col || 0,
                row: itemInfo.row || 0,
                goldPrice: itemInfo.goldPrice || 0
            });
            remainingQty -= currentSlotQty;
        }
    }

    // 🔥 PENGATURAN CSS SPRITE UNTUK IKON
    const iconSize = 32; // Ganti jika ikon Anda berukuran 36px atau 48px
    const spriteSheetUrl = "assets/interface.webp"; // Ganti dengan path file gambar sprite asli Anda

    for (let i = 0; i < renderSlots.length; i++) {
        const slot = renderSlots[i];
        const qtyText = (slot.qty > 1) ? `<span class="inv-qty">x${slot.qty}</span>` : "";

        // Kalkulasi posisi X dan Y
        const bgPosX = -(slot.col * iconSize) + "px";
        const bgPosY = -(slot.row * iconSize) + "px";
        const iconHtml = `<div style="width: ${iconSize}px; height: ${iconSize}px; background-image: url('${spriteSheetUrl}'); background-position: ${bgPosX} ${bgPosY}; margin: 0 auto;"></div>`;

        html += `
        <div class="inv-slot filled" onclick="window.handleInventoryClick('${escapeHTML(slot.name)}')" style="position: relative;" title="Harga Jual: ${slot.goldPrice}G">
            ${slot.badgeHtml}
            ${iconHtml} 
            <span style="font-size:10px;">${escapeHTML(slot.baseName)}</span>
            ${qtyText}
        </div>`;
    }

    const minSlots = 20;
    const totalSlotsToRender = Math.max(minSlots, renderSlots.length);
    for (let i = renderSlots.length; i < totalSlotsToRender; i++) {
        html += `<div class="inv-slot"></div>`;
    }
    invGrid.innerHTML = html;
}

export function renderBankUI(bankInventory) {
    const bankGrid = document.getElementById('bank-grid');
    if (!bankGrid) return;
    bankGrid.innerHTML = "";
    let bankItems = Object.entries(bankInventory || {}).sort((a, b) => a[0].localeCompare(b[0]));

    const iconSize = 32;
    const spriteSheetUrl = "assets/interface.webp";

    for (let i = 0; i < 16; i++) {
        if (i < bankItems.length) {
            const [name, qty] = bankItems[i];
            let baseName = name.replace(/\s\[\+\d+\]$/, '');

            // 🔥 Terapkan Sprite juga di UI Bank
            const itemInfo = window.CLOUD_ITEM_DB[baseName] || { col: 0, row: 0 };
            const bgPosX = -(itemInfo.col * iconSize) + "px";
            const bgPosY = -(itemInfo.row * iconSize) + "px";
            const iconHtml = `<div style="width: ${iconSize}px; height: ${iconSize}px; background-image: url('${spriteSheetUrl}'); background-position: ${bgPosX} ${bgPosY}; margin: 0 auto;"></div>`;

            bankGrid.innerHTML += `
            <div class="bank-slot filled" onclick="window.handleBankClick('${escapeHTML(name)}')">
                ${iconHtml}
                <span style="font-size:10px;">${escapeHTML(name)}</span>
                <span class="inv-qty">x${qty}</span>
            </div>`;
        } else { bankGrid.innerHTML += `<div class="bank-slot"></div>`; }
    }
}

export function renderCraftingUI(inventory, playerLevel, playerGold) {
    const craftList = document.getElementById('crafting-list');
    if (!craftList) return;
    craftList.innerHTML = "";

    for (const [recipeName, recipe] of Object.entries(CRAFTING_RECIPES)) {
        let reqHtml = `Lv.${recipe.reqLevel} | 💰 ${recipe.reqGold.toLocaleString()} Gold<br>`;
        let canCraft = (playerLevel >= recipe.reqLevel) && (playerGold >= recipe.reqGold);
        let matHtml = "";
        for (const [matName, qtyNeeded] of Object.entries(recipe.materials)) {
            const hasQty = inventory[matName] || 0;
            const color = hasQty >= qtyNeeded ? "#28a745" : "#dc3545";
            if (hasQty < qtyNeeded) canCraft = false;
            matHtml += `<span style="color:${color}; font-size:10px;">[${matName}] ${hasQty}/${qtyNeeded}</span><br>`;
        }

        let btnHtml = canCraft
            ? `<button onclick="window.actionCraftItem('${escapeHTML(recipeName)}')" style="background:#00d2ff; color:#000; font-weight:bold; padding:4px 8px; font-size:10px;">🔨 TEMPA</button>`
            : `<button disabled style="background:#555; padding:4px 8px; font-size:10px; cursor:not-allowed; border:1px solid #333;">Syarat Kurang</button>`;
        craftList.innerHTML += `
        <div style="border-bottom:1px solid #333; padding: 8px 0; display:flex; justify-content:space-between; align-items:center;">
            <div>
                <strong style="color:#ff9800; font-size:13px;">${escapeHTML(recipe.resultItem)}</strong><br>
                <span style="font-size:10px; color:#aaa;">Syarat: ${reqHtml}</span>
                <div style="margin-top:4px; padding-left:4px; border-left: 2px solid #555;">
                    ${matHtml}
                </div>
            </div>
            <div>${btnHtml}</div>
        </div>`;
    }
}