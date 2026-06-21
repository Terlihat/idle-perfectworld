export function escapeHTML(str) {
    return str ? str.toString().replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])) : "";
}

let ITEM_ICONS = { "default": { col: 0, row: 0 } };
fetch('./data/items.json')
    .then(response => response.json())
    .then(data => {
        ITEM_ICONS = data;
        console.log("✅ Kamus Ikon berhasil dimuat!");
    })
    .catch(err => console.error("❌ Gagal memuat items.json:", err));
	
export function getIconHTML(itemName) {
    const pos = ITEM_ICONS[itemName] || ITEM_ICONS["default"];
    const posX = -(pos.col * 32);
    const posY = -(pos.row * 32);
    return `<i class="pw-icon" style="background-position: ${posX}px ${posY}px;"></i>`;
}