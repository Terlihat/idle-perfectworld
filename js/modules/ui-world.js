import { escapeHTML, getIconHTML } from './ui-utils.js';
import { ITEM_DB } from '../data/items.js';

export const SHOP_ITEMS = [
    { name: 'Pedang Besi', price: 2000, currency: 'Gold' },
    { name: 'Tongkat Sihir', price: 2000, currency: 'Gold' },
    { name: 'Zirah Kulit', price: 2000, currency: 'Gold' },
    { name: 'Cincin Akurat', price: 3000, currency: 'Gold' },
    { name: 'Kuda Coklat', price: 5000, currency: 'Gold' },
    { name: 'Beruang Kutub', price: 25000, currency: 'Gold' },
    { name: 'Ramuan HP', price: 500, currency: 'Gold' },
    { name: 'Ramuan MP', price: 500, currency: 'Gold' }
];

export const MALL_ITEMS = [
    { name: 'Mirage Stone', price: 5, currency: 'Coin' },
    { name: 'Heaven Stone', price: 15, currency: 'Coin' },
    { name: 'Underworld Stone', price: 15, currency: 'Coin' },
    { name: 'Universal Stone', price: 50, currency: 'Coin' },
    { name: 'Tiket Ganti Nama', price: 50, currency: 'Coin' },
    { name: 'Tiket Ubah Job', price: 100, currency: 'Coin' },
    { name: 'Ramuan Stamina', price: 10, currency: 'Coin' },
    { name: 'Naga Terbang', price: 200, currency: 'Coin' },
    { name: 'Buku Reset Stats', price: 100, currency: 'Coin' },
    { name: 'Dragon Orb (1 Star)', price: 10, currency: 'Coin' },
    { name: 'Dragon Orb (2 Star)', price: 25, currency: 'Coin' },
    { name: 'Dragon Orb (3 Star)', price: 60, currency: 'Coin' }
];

export function renderShopAndMall() {
    const shopContainer = document.getElementById('panel-shop-grid');
    const mallContainer = document.getElementById('panel-mall-grid');
    function buildGrid(items) {
        let html = '<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(80px, 1fr)); gap:10px; margin-top:10px;">';
        items.forEach(item => {
            const iconHTML = getIconHTML(item.name);
            const colorPrice = item.currency === 'Coin' ? '#ffcc00' : '#e0a800';
            const currencyIcon = item.currency === 'Coin' ? '🪙' : '💰';
            html += `
            <div onclick="window.openBuyModal('${escapeHTML(item.name)}', ${item.price}, '${item.currency}')" 
                 style="background:#121216; border:1px solid #333; border-radius:5px; padding:10px; text-align:center; cursor:pointer; transition:0.2s;">
                <div style="font-size:28px; margin-bottom:8px;">${iconHTML}</div>
                <div style="font-size:10px; color:#fff; margin-bottom:5px; line-height:1.2; height:24px;">${escapeHTML(item.name)}</div>
                <div style="font-size:11px; font-weight:bold; color:${colorPrice}; background:#222; padding:2px; border-radius:3px;">${currencyIcon} ${item.price}</div>
            </div>`;
        });
        return html + '</div>';
    }
    if (shopContainer) shopContainer.innerHTML = buildGrid(SHOP_ITEMS);
    if (mallContainer) mallContainer.innerHTML = buildGrid(MALL_ITEMS);
}

// ==========================================
// STATE GLOBAL UNTUK FILTER PASAR LELANG
// ==========================================
let currentAuctionItems = [];
let currentUid = null;
let currentFilter = 'Semua';
let currentSort = 'asc'; // 'asc' (Murah ke Mahal), 'desc' (Mahal ke Murah)
let currentSearch = '';

window.setAuctionFilter = function (tipe) {
    currentFilter = tipe;
    // Ubah warna tombol agar ketahuan mana yang sedang aktif
    const btns = document.getElementById('auc-category-btns').children;
    for (let b of btns) { b.style.background = '#333'; b.style.border = '1px solid #555'; }
    event.target.style.background = '#007bff';
    event.target.style.border = 'none';
    renderFilteredAuction();
};

window.setAuctionSort = function (sortType) {
    currentSort = sortType;
    renderFilteredAuction();
};

window.updateAuctionFilter = function () {
    currentSearch = document.getElementById('auction-search').value.toLowerCase();
    renderFilteredAuction();
};

// ==========================================
// FUNGSI UTAMA RENDER LELANG
// ==========================================
export function renderAuctionUI(items, currentUserUid) {
    currentAuctionItems = items;
    currentUid = currentUserUid;
    renderFilteredAuction(); // Panggil fungsi filter
}

function renderFilteredAuction() {
    const auctionList = document.getElementById('auction-list');
    if (!auctionList) return;
    auctionList.innerHTML = "";

    const now = Date.now();
    let activeItems = [];

    // 1. PISAHKAN BARANG KADALUARSA
    currentAuctionItems.forEach(item => {
        if ((item.expiresAt || 0) < now) {
            if (typeof window.processExpiredAuction === 'function') window.processExpiredAuction(item.id);
        } else {
            activeItems.push(item);
        }
    });

    // 2. FILTERING (Pencarian & Kategori)
    let filteredItems = activeItems.filter(item => {
        // Hapus tulisan [+...] untuk mencari nama aslinya di database
        const baseItemName = item.itemName.replace(/\s\[\+\d+\]$/, '');
        const itemData = ITEM_DB[baseItemName] || {};
        const itemType = itemData.type || 'lainnya';

        // Pengecekan Kolom Pencarian
        if (currentSearch && !item.itemName.toLowerCase().includes(currentSearch)) return false;

        // Pengecekan Kategori (Senjata, Armor, Aksesoris)
        if (currentFilter !== 'Semua') {
            if (itemType !== currentFilter) return false;
        }
        return true;
    });

    // 3. SORTING (Pengurutan Harga)
    filteredItems.sort((a, b) => {
        const priceA = a.buyoutPrice || a.price || 0;
        const priceB = b.buyoutPrice || b.price || 0;
        return currentSort === 'asc' ? priceA - priceB : priceB - priceA;
    });

    // 4. MENGGAMBAR KE LAYAR (RENDER)
    filteredItems.forEach(item => {
        const isMine = item.sellerId === currentUid;
        const itemPrice = item.buyoutPrice || item.price || 0;
        const namaPenjualTampil = isMine ? escapeHTML(item.sellerName) + " (Anda)" : "Anonim";

        // 🔥 SOLUSI IKON HILANG: Cari ikon berdasarkan nama asli (tanpa plus)
        const baseItemName = item.itemName.replace(/\s\[\+\d+\]$/, '');
        const itemIcon = getIconHTML(baseItemName);

        const sisaMs = (item.expiresAt || 0) - now;
        const sisaHari = Math.floor(sisaMs / (1000 * 60 * 60 * 24));
        const sisaJam = Math.floor((sisaMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const teksWaktu = sisaHari > 0 ? `${sisaHari} Hari ${sisaJam} Jam` : `${sisaJam} Jam`;

        let btnHtml = "";
        if (isMine) {
            if (item.highestBid) {
                btnHtml += `<div style="margin-bottom:4px; font-size:10px;">Bid: <strong style="color:#00d2ff">${item.highestBid.amount}G</strong> (${escapeHTML(item.highestBid.buyerName)})</div>`;
                btnHtml += `<button onclick="window.actionBid('${item.id}', 'accept')" style="padding:2px 5px; font-size:9px; background:#28a745;">Terima</button> `;
                btnHtml += `<button onclick="window.actionBid('${item.id}', 'reject')" style="padding:2px 5px; font-size:9px; background:#dc3545;">Tolak</button>`;
            } else {
                btnHtml += `<div style="margin-bottom:4px;"><span style="color:#28a745; font-size:9px;">⏰ ${teksWaktu}</span></div>`;
                btnHtml += `<button onclick="window.cancelAuction('${item.id}')" style="padding:2px 5px; font-size:9px; background:#555;">Tarik</button>`;
            }
        } else {
            const currentBid = item.highestBid ? item.highestBid.amount : 0;
            btnHtml += `<div style="font-size:9px; margin-bottom:4px;">Bid: ${currentBid > 0 ? currentBid + 'G' : '-'}</div>`;
            btnHtml += `<button onclick="window.placeBid('${item.id}', '${escapeHTML(item.itemName)}', ${currentBid})" style="padding:2px 5px; font-size:9px; background:#007bff;">Tawar</button> `;
            btnHtml += `<button onclick="window.buyFromAuction('${item.id}', '${escapeHTML(item.itemName)}', ${itemPrice}, '${item.sellerId}')" style="padding:2px 5px; font-size:9px; background:#e0a800;">Beli ${itemPrice}G</button>`;
        }

        auctionList.innerHTML += `<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #333; padding: 6px 0;"><div><strong style="color:#00d2ff;">${itemIcon} ${escapeHTML(item.itemName)}</strong><br><span style="font-size:10px; color:#aaa;">Penjual: <span style="color:#ffcc00;">${namaPenjualTampil}</span> | 💰 ${itemPrice.toLocaleString()}G</span></div><div style="text-align: right;">${btnHtml}</div></div>`;
    });

    if (filteredItems.length === 0) {
        auctionList.innerHTML = activeItems.length === 0 ? "Belum ada lelang aktif saat ini." : "🔍 Tidak ada barang yang cocok dengan pencarian/kategori ini.";
    }
}

export function renderPKUI(pkPlayers, currentUid) {
    const container = document.getElementById('pk-player-list');
    if (!container) return;
    let html = '<div style="display:grid; gap:10px;">';
    let targetCount = 0;
    pkPlayers.forEach(p => {
        if (p.id === currentUid) return;
        targetCount++;
        let isRed = (p.pkKills || 0) >= 3;
        let nameColor = isRed ? '#ff4c4c' : '#fff';
        let karmaTitle = isRed ? '💀 RED NAME (Drop 20%)' : 'Pengembara (Drop 5%)';
        html += `
        <div style="background:#121216; border:1px solid ${isRed ? '#ff4c4c' : '#555'}; border-radius:5px; padding:10px; display:flex; justify-content:space-between; align-items:center;">
            <div>
                <div style="color:${nameColor}; font-weight:bold; font-size:14px;">${escapeHTML(p.username)} <span style="font-size:10px; color:#aaa;">(Lv. ${p.level || 1})</span></div>
                <div style="font-size:11px; color:#ffcc00;">${karmaTitle}</div>
            </div>
            <button onclick="window.attackPK('${p.id}', '${escapeHTML(p.username)}')" style="background:#dc3545; color:#fff; border:none; padding:8px 15px; border-radius:3px; cursor:pointer; font-weight:bold;">Serang</button>
        </div>`;
    });
    html += '</div>';
    if (targetCount === 0) {
        html = '<div style="text-align:center; color:#555; padding:20px;">Hutan sepi. Tidak ada pemain lain di sini.</div>';
    }
    container.innerHTML = html;
}