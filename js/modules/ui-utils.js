export function escapeHTML(str) {
    return str ? str.toString().replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])) : "";
}

export function getIconHTML(itemName) {
    // 🔥 BACA DARI CLOUD! Jika data belum ada, baru gunakan fallback col: 0, row: 0
    const pos = (window.CLOUD_ITEM_DB && window.CLOUD_ITEM_DB[itemName])
        ? window.CLOUD_ITEM_DB[itemName]
        : { col: 0, row: 0 };

    const posX = -(pos.col * 32);
    const posY = -(pos.row * 32);

    // Kembalikan ke format pw-icon andalan Anda
    return `<i class="pw-icon" style="background-position: ${posX}px ${posY}px;"></i>`;
}