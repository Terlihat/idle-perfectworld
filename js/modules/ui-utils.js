export function escapeHTML(str) {
    return str ? str.toString().replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])) : "";
}

let ITEM_ICONS = { "default": { col: 0, row: 0 } };

fetch('./data/items.json')
    .then(response => {
        if (!response.ok) throw new Error("Gagal menemukan file di ./data/items.json");
        return response.json();
    })
    .then(data => {
        ITEM_ICONS = data;
        console.log("✅ Kamus Ikon UI berhasil dimuat!");

        // Memaksa game menggambar ulang tas setelah data ikon siap
        if (typeof window.renderInventoryUI === 'function' && window.currentInventoryData) {
            window.renderInventoryUI(window.currentInventoryData);
        }
        if (typeof window.renderBankUI === 'function' && window.currentBankData) {
            window.renderBankUI(window.currentBankData);
        }
    })
    .catch(err => console.error("❌ Gagal memuat items.json untuk ikon:", err));

export function getIconHTML(itemName) {
    // Membaca langsung dari memori lokal super cepat
    const pos = ITEM_ICONS[itemName] || ITEM_ICONS["default"];
    const posX = -(pos.col * 32);
    const posY = -(pos.row * 32);
    return `<i class="pw-icon" style="background-position: ${posX}px ${posY}px;"></i>`;
}