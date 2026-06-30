// File: admin-market.js
import { db } from '../../js/firebase-config.js';
import { collection, doc, updateDoc, deleteDoc, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// ==========================================
// 1. GLOBAL KILL SWITCH (BEKUKAN PASAR)
// ==========================================
let isMarketFrozen = false;

window.listenToMarketStatus = function() {
    // Menumpang di dokumen serverBuffs untuk menyimpan status global
    onSnapshot(doc(db, "events", "serverBuffs"), (docSnap) => {
        if (docSnap.exists()) {
            isMarketFrozen = !!docSnap.data().marketFrozen;
            const statusText = document.getElementById('status-market-freeze');
            const btnToggle = document.getElementById('btn-toggle-market-freeze');
            
            if (statusText && btnToggle) {
                statusText.innerText = isMarketFrozen ? "[ DIBEKUKAN ]" : "[ AMAN ]";
                statusText.style.color = isMarketFrozen ? "#dc3545" : "#28a745";
                
                btnToggle.innerText = isMarketFrozen ? "Buka Kembali Pasar" : "?? Bekukan Pasar";
                btnToggle.style.background = isMarketFrozen ? "#28a745" : "#dc3545";
            }
        }
    });
};

document.getElementById('btn-toggle-market-freeze')?.addEventListener('click', async () => {
    const actionText = isMarketFrozen ? "MEMBUKA" : "MEMBEKUKAN";
    if (!confirm(`?? Yakin ingin ${actionText} seluruh aktivitas Bursa Coin?\nPemain tidak akan bisa membeli atau menjual coin selama dibekukan.`)) return;
    
    try {
        await updateDoc(doc(db, "events", "serverBuffs"), { marketFrozen: !isMarketFrozen });
        if(window.logAdminAction) window.logAdminAction("SYSTEM", `Telah ${actionText} Global Coin Market.`);
    } catch (err) {
        alert("Gagal mengubah status bursa: " + err.message);
    }
});

// ==========================================
// 2. LIVE MONITORING & TAKEDOWN PAKSA (BURSA COIN)
// ==========================================
window.listenToLiveMarket = function() {
    const listDiv = document.getElementById('admin-market-list');
    if (!listDiv) return;

    // ?? PERBAIKAN: Membaca dari koleksi "coin_market" sesuai sistem game
    const q = query(collection(db, "coin_market"), orderBy("timestamp", "desc"));
    
    onSnapshot(q, (snapshot) => {
        listDiv.innerHTML = "";
        
        if (snapshot.empty) {
            listDiv.innerHTML = `<div style="text-align: center; color: #aaa; padding: 20px; font-size: 13px;">Tidak ada transaksi di Bursa Coin saat ini.</div>`;
            return;
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const itemId = docSnap.id;
            
            // ?? PERBAIKAN: Konversi Date.now() dari sistem game menjadi format tanggal terbaca
            const time = data.timestamp ? new Date(data.timestamp).toLocaleString('id-ID') : 'Baru saja';
            
            listDiv.innerHTML += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid #333; background: #1a1a24; margin-bottom: 5px; border-radius: 4px;">
                    <div>
                        <div style="color: #00d2ff; font-weight: bold; font-size: 15px;">?? ${data.amount.toLocaleString()} Coin</div>
                        <div style="color: #aaa; font-size: 12px; margin-top: 3px;">
                            Penjual: <span style="color: #ffca28; font-weight: bold;">${data.sellerName || data.sellerUid}</span> | 
                            Harga: <span style="color: #28a745; font-weight: bold;">${(data.price || 0).toLocaleString()} Gold</span>
                        </div>
                        <div style="color: #777; font-size: 10px; margin-top: 4px;">Waktu: ${time} | ID Lelang: ${itemId}</div>
                    </div>
                    <button class="btn-takedown-item" data-id="${itemId}" data-amount="${data.amount}" data-seller="${data.sellerUid}" style="background: #dc3545; color: white; padding: 8px 12px; font-size: 11px; font-weight: bold; border: none; border-radius: 4px; cursor: pointer; transition: 0.2s;">?? Sita Koin</button>
                </div>`;
        });

        // Pasang Event Listener ke tombol Sita Koin (Takedown)
        document.querySelectorAll('.btn-takedown-item').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const itemId = e.target.getAttribute('data-id');
                const amount = e.target.getAttribute('data-amount');
                const sellerUid = e.target.getAttribute('data-seller');
                
                if (!confirm(`?? PERINGATAN KERAS: Turunkan paksa [${amount} Coin] dari bursa?\nCatatan: Koin ini akan hangus disita oleh sistem (TIDAK dikembalikan ke saldo deposit penjual).`)) return;
                
                try {
                    // Menghapus langsung dari koleksi coin_market tanpa melakukan pengembalian dana
                    await deleteDoc(doc(db, "coin_market", itemId));
                    
                    if(window.logAdminAction) window.logAdminAction("SYSTEM", `Takedown paksa lelang ${amount} Coin milik UID: ${sellerUid}`);
                    alert("Koin ilegal berhasil disita dan diturunkan dari Bursa!");
                } catch (err) {
                    alert("Gagal menghapus lelang: " + err.message);
                }
            });
        });
    });
};