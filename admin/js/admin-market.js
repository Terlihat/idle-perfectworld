// File: admin-market.js
import { db } from '../../js/firebase-config.js';
import { collection, doc, updateDoc, deleteDoc, onSnapshot, query, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// ==========================================
// 1. GLOBAL KILL SWITCH (BEKUKAN PASAR)
// ==========================================
let isMarketFrozen = false;

window.listenToMarketStatus = function() {
    // Kita menumpang di dokumen serverBuffs untuk menyimpan status global
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
    if (!confirm(`⚠️ Yakin ingin ${actionText} seluruh aktivitas Pasar Coin?\nPemain tidak akan bisa membeli atau menjual item selama dibekukan.`)) return;
    
    try {
        await updateDoc(doc(db, "events", "serverBuffs"), { marketFrozen: !isMarketFrozen });
        if(window.logAdminAction) window.logAdminAction("SYSTEM", `Telah ${actionText} Global Market.`);
    } catch (err) {
        alert("Gagal mengubah status pasar: " + err.message);
    }
});

// ==========================================
// 2. LIVE MONITORING & TAKEDOWN PAKSA
// ==========================================
window.listenToLiveMarket = function() {
    const listDiv = document.getElementById('admin-market-list');
    if (!listDiv) return;

    // Asumsi nama koleksi database Anda adalah "market"
    const q = query(collection(db, "market"), orderBy("timestamp", "desc"));
    
    onSnapshot(q, (snapshot) => {
        listDiv.innerHTML = "";
        
        if (snapshot.empty) {
            listDiv.innerHTML = `<div style="text-align: center; color: #aaa; padding: 20px; font-size: 13px;">Tidak ada item yang sedang dijual di pasar saat ini.</div>`;
            return;
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const itemId = docSnap.id;
            const time = data.timestamp ? data.timestamp.toDate().toLocaleString('id-ID') : 'Baru saja';
            
            listDiv.innerHTML += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid #333; background: #1a1a24; margin-bottom: 5px; border-radius: 4px;">
                    <div>
                        <div style="color: #ffca28; font-weight: bold; font-size: 14px;">${data.itemName} (x${data.qty})</div>
                        <div style="color: #aaa; font-size: 11px; margin-top: 3px;">Penjual: <span style="color: #00d2ff;">${data.sellerName || data.sellerUid}</span> | Harga: <span style="color: #28a745; font-weight: bold;">${(data.price || 0).toLocaleString()} Coin</span></div>
                        <div style="color: #777; font-size: 10px; margin-top: 2px;">Waktu: ${time} | ID Lelang: ${itemId}</div>
                    </div>
                    <button class="btn-takedown-item" data-id="${itemId}" data-item="${data.itemName}" data-seller="${data.sellerUid}" style="background: #dc3545; color: white; padding: 6px 12px; font-size: 11px; font-weight: bold; border: none; border-radius: 4px; cursor: pointer;">Takedown Paksa</button>
                </div>`;
        });

        // Pasang Event Listener ke tombol Takedown
        document.querySelectorAll('.btn-takedown-item').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const itemId = e.target.getAttribute('data-id');
                const itemName = e.target.getAttribute('data-item');
                const sellerUid = e.target.getAttribute('data-seller');
                
                if (!confirm(`⚠️ PERINGATAN KERAS: Turunkan paksa [${itemName}] dari pasar?\nCatatan: Item ini akan disita oleh sistem (Dihapus dari pasar dan TIDAK dikembalikan ke penjual).`)) return;
                
                try {
                    await deleteDoc(doc(db, "market", itemId));
                    if(window.logAdminAction) window.logAdminAction("SYSTEM", `Takedown paksa item pasar: [${itemName}] milik UID: ${sellerUid}`);
                    alert("Item ilegal berhasil disita dan diturunkan dari pasar!");
                } catch (err) {
                    alert("Gagal menghapus item: " + err.message);
                }
            });
        });
    });
};