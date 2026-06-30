// File: admin-market.js
import { db } from '../../js/firebase-config.js';
import { collection, doc, updateDoc, deleteDoc, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// ==========================================
// 1. GLOBAL KILL SWITCH (BEKUKAN PASAR)
// ==========================================
let isMarketFrozen = false;

window.listenToMarketStatus = function () {
    onSnapshot(doc(db, "events", "serverBuffs"), (docSnap) => {
        if (docSnap.exists()) {
            isMarketFrozen = !!docSnap.data().marketFrozen;
            const statusText = document.getElementById('status-market-freeze');
            const btnToggle = document.getElementById('btn-toggle-market-freeze');

            if (statusText && btnToggle) {
                statusText.innerText = isMarketFrozen ? "[ DIBEKUKAN ]" : "[ AMAN ]";
                statusText.style.color = isMarketFrozen ? "#dc3545" : "#28a745";

                btnToggle.innerText = isMarketFrozen ? "Buka Kembali Pasar" : "🚨 Bekukan Pasar";
                btnToggle.style.background = isMarketFrozen ? "#28a745" : "#dc3545";
            }
        }
    });
};

document.getElementById('btn-toggle-market-freeze')?.addEventListener('click', async () => {
    const actionText = isMarketFrozen ? "MEMBUKA" : "MEMBEKUKAN";
    if (!confirm('⚠️ Yakin ingin ${actionText} seluruh aktivitas Bursa Coin?\nPemain tidak akan bisa membeli atau menjual coin selama dibekukan.')) return;

    try {
        await updateDoc(doc(db, "events", "serverBuffs"), { marketFrozen: !isMarketFrozen });
        if (window.logAdminAction) window.logAdminAction("SYSTEM", `Telah ${actionText} Global Coin Market.`);
    } catch (err) {
        alert("Gagal mengubah status bursa: " + err.message);
    }
});

// ==========================================
// 2. LIVE MONITORING (COIN & ITEM) & TAKEDOWN
// ==========================================
window.listenToLiveMarket = function () {
    const coinList = document.getElementById('admin-coin-list');
    const itemList = document.getElementById('admin-item-list');
    if (!coinList || !itemList) return;

    // --- A. LISTENER BURSA COIN ---
    onSnapshot(query(collection(db, "coin_market"), orderBy("timestamp", "desc")), (snapshot) => {
        coinList.innerHTML = snapshot.empty ? `<div style="text-align: center; color: #aaa; padding: 20px;">Kosong</div>` : "";
        snapshot.forEach((docSnap) => {
            const data = docSnap.data(); const itemId = docSnap.id;
            const time = data.timestamp ? new Date(data.timestamp).toLocaleString('id-ID') : 'Baru saja';

            coinList.innerHTML += `
                <div style="padding: 10px; border-bottom: 1px solid #333; background: #1a1a24; margin-bottom: 5px; border-radius: 4px;">
                    <div style="display: flex; justify-content: space-between;">
                        <div style="color: #ffca28; font-weight: bold; font-size: 14px;">🪙 ${data.amount.toLocaleString()} Coin</div>
                        <button class="btn-takedown-coin" data-id="${itemId}" data-amount="${data.amount}" style="background: #dc3545; color: white; padding: 4px 8px; font-size: 10px; font-weight: bold; border: none; border-radius: 3px; cursor: pointer;">Sita</button>
                    </div>
                    <div style="color: #aaa; font-size: 11px; margin-top: 3px;">Penjual: ${data.sellerName || data.sellerUid} | Harga: ${(data.price || 0).toLocaleString()}G</div>
                    <div style="color: #777; font-size: 10px; margin-top: 2px;">Waktu: ${time}</div>
                </div>`;
        });

        document.querySelectorAll('.btn-takedown-coin').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                if (!confirm(`SITA ${e.target.getAttribute('data-amount')} Coin ini tanpa refund?`)) return;
                await deleteDoc(doc(db, "coin_market", e.target.getAttribute('data-id')));
            });
        });
    });

    // --- B. LISTENER LELANG BARANG ---
    onSnapshot(query(collection(db, "market"), orderBy("timestamp", "desc")), (snapshot) => {
        itemList.innerHTML = snapshot.empty ? `<div style="text-align: center; color: #aaa; padding: 20px;">Kosong</div>` : "";
        snapshot.forEach((docSnap) => {
            const data = docSnap.data(); const itemId = docSnap.id;
            const bidText = data.highestBid ? `Bid: ${data.highestBid.amount}G` : `Harga: ${data.buyoutPrice}G`;

            itemList.innerHTML += `
                <div style="padding: 10px; border-bottom: 1px solid #333; background: #1a1a24; margin-bottom: 5px; border-radius: 4px;">
                    <div style="display: flex; justify-content: space-between;">
                        <div style="color: #00d2ff; font-weight: bold; font-size: 14px;">⚔️ ${data.itemName}</div>
                        <button class="btn-takedown-item" data-id="${itemId}" data-name="${data.itemName}" style="background: #dc3545; color: white; padding: 4px 8px; font-size: 10px; font-weight: bold; border: none; border-radius: 3px; cursor: pointer;">Sita</button>
                    </div>
                    <div style="color: #aaa; font-size: 11px; margin-top: 3px;">Penjual: ${data.sellerName || data.sellerId} | ${bidText}</div>
                </div>`;
        });

        document.querySelectorAll('.btn-takedown-item').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                if (!confirm(`SITA ${e.target.getAttribute('data-name')} ini dari lelang?`)) return;
                await deleteDoc(doc(db, "market", e.target.getAttribute('data-id')));
            });
        });
    });
};