import { db } from '../firebase-config.js';
import { doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

let selectedSource = null;
let selectedTarget = null;
let currentTransferType = null; // 'source' atau 'target'
let transferCost = 0;

// Tabel Biaya Universal Stone (Bisa Anda sesuaikan)
const STONE_COST = {
    1: 10, 2: 25, 3: 50, 4: 80, 5: 120, 
    6: 180, 7: 250, 8: 350, 9: 500, 10: 700, 
    11: 850, 12: 1000 // +12 Butuh 1000 Stone
};

// Fungsi membuka modal untuk memilih item
window.openTransferSelect = function(type) {
    currentTransferType = type;
    const modal = document.getElementById('transfer-select-modal');
    const title = document.getElementById('transfer-modal-title');
    const list = document.getElementById('transfer-item-list');
    
    title.innerText = type === 'source' ? "Pilih Item Tumbal (+)" : "Pilih Item Penerima";
    list.innerHTML = ""; // Bersihkan list
    
    // Ambil data inventory asli dari window (didapat dari renderPlayerUI/game.js)
    const inv = window.currentInventoryData || {}; 
    
    let hasItem = false;
    for (let itemName in inv) {
        // Abaikan item konsumsi/material
        if (itemName.includes("Ramuan") || itemName.includes("Stone") || itemName.includes("Coin")) continue;

        const refineMatch = itemName.match(/\+(\d+)/);
        const refineLevel = refineMatch ? parseInt(refineMatch[1]) : 0;

        // Jika mencari SUMBER, hanya tampilkan item yang punya +1 ke atas
        if (type === 'source' && refineLevel === 0) continue;
        
        // Jangan tampilkan item yang sedang dipakai di slot sebelah
        if (type === 'target' && itemName === selectedSource) continue;
        if (type === 'source' && itemName === selectedTarget) continue;

        hasItem = true;
        
        const btn = document.createElement('button');
        btn.innerText = `${itemName} (x${inv[itemName]})`;
        btn.style.cssText = "background:#1a1a1a; color:#fff; padding:10px; border:1px solid #333; border-radius:3px; cursor:pointer; text-align:left;";
        btn.onclick = () => selectTransferItem(itemName, refineLevel);
        list.appendChild(btn);
    }

    if (!hasItem) {
        list.innerHTML = `<div style="text-align:center; color:#aaa; font-size:12px;">Tidak ada item yang cocok di tas Anda.</div>`;
    }

    modal.style.display = "flex";
};

function selectTransferItem(itemName, refineLevel) {
    document.getElementById('transfer-select-modal').style.display = 'none';

    if (currentTransferType === 'source') {
        selectedSource = itemName;
        document.getElementById('transfer-name-source').innerText = itemName;
        document.getElementById('transfer-slot-source').style.borderColor = "#ffcc00";
        document.getElementById('transfer-slot-source').innerHTML = "⚔️"; // Icon Dummy (Bisa diganti image icon nanti)
        
        // Hitung Biaya
        transferCost = STONE_COST[refineLevel] || (refineLevel * 100);
        document.getElementById('transfer-cost-amount').innerText = transferCost;
    } else {
        selectedTarget = itemName;
        document.getElementById('transfer-name-target').innerText = itemName;
        document.getElementById('transfer-slot-target').style.borderColor = "#28a745";
        document.getElementById('transfer-slot-target').innerHTML = "🛡️"; // Icon Dummy
    }
}

window.executeTransfer = async function() {
    if (!selectedSource || !selectedTarget) return window.rpgAlert("Pilih Item Sumber dan Target terlebih dahulu!");

    if (!await window.rpgConfirm(`Proses ini akan memindahkan tempa dari [${selectedSource}] ke [${selectedTarget}] dengan biaya ${transferCost} Universal Stone. Item sumber akan menjadi +0. Lanjutkan?`, "Konfirmasi Transfer")) return;

    try {
        await runTransaction(db, async (ts) => {
            const userRef = doc(db, "users", window.currentUserUid);
            const data = (await ts.get(userRef)).data();
            let inv = data.inventory || {};

            // 1. Validasi Kepemilikan Barang
            if (!inv[selectedSource] || inv[selectedSource] < 1) throw "Item Sumber tidak ditemukan di Tas!";
            if (!inv[selectedTarget] || inv[selectedTarget] < 1) throw "Item Target tidak ditemukan di Tas!";
            if ((inv['Universal Stone'] || 0) < transferCost) throw `Universal Stone tidak cukup! Butuh ${transferCost}.`;

            // 2. Ekstrak angka + dari sumber
            const sourceMatch = selectedSource.match(/\+(\d+)/);
            if (!sourceMatch) throw "Item Sumber tidak memiliki tingkat tempa (+)!";
            const refineLevel = sourceMatch[1]; // misal "12"

            // 3. Bersihkan nama dari +
            const cleanSourceName = selectedSource.replace(/\s\+\d+/, ""); // "Pedang Besi +12" -> "Pedang Besi"
            const cleanTargetName = selectedTarget.replace(/\s\+\d+/, ""); // Bersihkan target jika sudah ada + nya
            
            const newTargetName = `${cleanTargetName} +${refineLevel}`;

            // 4. Potong Biaya
            inv['Universal Stone'] -= transferCost;
            if (inv['Universal Stone'] <= 0) delete inv['Universal Stone'];

            // 5. Modifikasi Inventory (Hapus 1 source, jadikan +0. Hapus 1 target, jadikan +X)
            // Kurangi item asli
            inv[selectedSource] -= 1;
            if (inv[selectedSource] <= 0) delete inv[selectedSource];
            
            inv[selectedTarget] -= 1;
            if (inv[selectedTarget] <= 0) delete inv[selectedTarget];

            // Tambahkan item hasil modifikasi
            inv[cleanSourceName] = (inv[cleanSourceName] || 0) + 1; // Sumber jadi +0
            inv[newTargetName] = (inv[newTargetName] || 0) + 1;     // Target jadi +X

            ts.update(userRef, { inventory: inv });
        });

        // Reset UI Setelah Sukses
        selectedSource = null;
        selectedTarget = null;
        transferCost = 0;
        document.getElementById('transfer-name-source').innerText = "Pilih Item";
        document.getElementById('transfer-name-target').innerText = "Pilih Item";
        document.getElementById('transfer-slot-source').innerHTML = "+";
        document.getElementById('transfer-slot-target').innerHTML = "+";
        document.getElementById('transfer-slot-source').style.borderColor = "#555";
        document.getElementById('transfer-slot-target').style.borderColor = "#555";
        document.getElementById('transfer-cost-amount').innerText = "0";

        window.rpgAlert("✨ SUCCESS! Pewarisan tempa berhasil dilakukan!", "Sukses");

    } catch (err) { window.rpgAlert(err, "Gagal Transfer"); }
};