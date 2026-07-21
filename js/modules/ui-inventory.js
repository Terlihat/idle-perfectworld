import { escapeHTML, getIconHTML } from './ui-utils.js';
import { CRAFTING_RECIPES } from './crafting.js';
import { ITEM_DB } from '../data/items.js';

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

        // 🔥 PERBAIKAN: Teknik "Merge" Data Lokal dan Cloud
        const localData = ITEM_DB[baseName] || {};
        const cloudData = (window.CLOUD_ITEM_DB && window.CLOUD_ITEM_DB[baseName]) ? window.CLOUD_ITEM_DB[baseName] : {};

        // Gabungkan keduanya! (Jika ada data yang sama, cloudData dari Firebase akan menangkal lokal)
        const itemInfo = { ...localData, ...cloudData };

        const type = itemInfo.type || 'misc';

        // 🔥 Cek sellValue. Jika tidak ada, coba cari goldPrice sebagai cadangan
        const sellValue = itemInfo.sellValue !== undefined ? itemInfo.sellValue : (itemInfo.goldPrice || 0);
        const desc = itemInfo.desc || itemInfo.description || "";

        // 🔥 Status pembacaan
        let statsText = "";
        if (itemInfo) {
            if (itemInfo.patk) statsText += `\n⚔️ P.ATK: +${itemInfo.patk}`;
            if (itemInfo.matk) statsText += `\n🔮 M.ATK: +${itemInfo.matk}`;
            if (itemInfo.def) statsText += `\n🛡️ DEF: +${itemInfo.def}`;
            if (itemInfo.hpBonus) statsText += `\n❤️ Max HP: +${itemInfo.hpBonus}`;
            if (itemInfo.accBonus) statsText += `\n🎯 Akurasi: +${itemInfo.accBonus}`;
            if (itemInfo.stamDiscount) statsText += `\n⚡ Diskon Stamina: -${itemInfo.stamDiscount}`;
            if (itemInfo.goldBonus) statsText += `\n💰 Bonus Gold: +${itemInfo.goldBonus * 100}%`;
        }

        let maxStack = 9999;
        if (['weapon', 'armor', 'accessory', 'mount', 'equipment'].includes(type)) {
            maxStack = 1; // Perlengkapan tempur tidak ditumpuk
        }

        let remainingQty = totalQty;
        while (remainingQty > 0) {
            let currentSlotQty = Math.min(remainingQty, maxStack);

            // 🔥 5. RAKIT TOOLTIP
            let tooltip = `[ ${name} ]\n`;
            tooltip += `📦 Jumlah: ${currentSlotQty}\n`;
            tooltip += `🏷️ Tipe: ${type.toUpperCase()}\n`;

            if (desc !== "") tooltip += `\n📝 ${desc}\n`;
            if (statsText !== "") tooltip += `\n--- Stats ---${statsText}`;

            tooltip += `\n\n💰 Harga Jual: ${sellValue} Gold`;

            renderSlots.push({
                name: name,
                baseName: baseName,
                badgeHtml: badgeHtml,
                qty: currentSlotQty,
                tooltip: tooltip,
                sellValue: sellValue // Simpan juga untuk alert saat diklik
            });
            remainingQty -= currentSlotQty;
        }
    }

    for (let i = 0; i < renderSlots.length; i++) {
        const slot = renderSlots[i];
        const qtyText = (slot.qty > 1) ? `<span class="inv-qty">x${slot.qty}</span>` : "";

        html += `
        <div class="inv-slot filled" onclick="window.handleInventoryClick('${escapeHTML(slot.name)}')" title="${escapeHTML(slot.tooltip)}">
            ${slot.badgeHtml}
            ${getIconHTML(slot.baseName)} 
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

    for (let i = 0; i < 16; i++) {
        if (i < bankItems.length) {
            const [name, qty] = bankItems[i];
            let baseName = name.replace(/\s\[\+\d+\]$/, '');

            bankGrid.innerHTML += `
            <div class="bank-slot filled" onclick="window.handleBankClick('${escapeHTML(name)}', ${qty})">
                ${getIconHTML(baseName)}
                <span style="font-size:10px;">${escapeHTML(name)}</span>
                <span class="inv-qty">x${qty}</span>
            </div>`;
        } else { bankGrid.innerHTML += `<div class="bank-slot"></div>`; }
    }
}

// Ekspos fungsi ke global agar bisa dipanggil ulang dari file game.js
window.renderInventoryUI = renderInventoryUI;
window.renderBankUI = renderBankUI;