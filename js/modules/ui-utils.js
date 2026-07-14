export function escapeHTML(str) {
    return str ? str.toString().replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])) : "";
}

let ITEM_ICONS = { "default": { col: 0, row: 0 } };

// 🔥 KITA KEMBALIKAN KE LOCAL FETCH AGAR SUPER CEPAT
// Mencoba dua jalur (../data atau ./data) untuk memastikan tidak ada error 404
fetch('../data/items.json')
    .then(response => {
        if (!response.ok) return fetch('./data/items.json');
        return response;
    })
    .then(response => response.json())
    .then(data => {
        ITEM_ICONS = data;
        console.log("✅ Kamus Ikon UI berhasil dimuat!");

        // 🔥 PELATUK RAHASIA: Setelah ikon dimuat, paksa game menggambar ulang tas!
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