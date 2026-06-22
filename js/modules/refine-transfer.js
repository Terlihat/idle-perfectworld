import { db } from '../firebase-config.js';
import { doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

let selectedSource = null;
let selectedTarget = null;
let currentTransferType = null; // 'source' atau 'target'
let transferCost = 0;

// Tabel Biaya Universal Stone
const STONE_COST = {
    1: 10, 2: 25, 3: 50, 4: 80, 5: 120,
    6: 180, 7: 250, 8: 350, 9: 500, 10: 700,
    11: 850, 12: 1000 // +12 Butuh 1000 Stone
};

// Fungsi membuka modal untuk memilih item
window.openTransferSelect = function (type) {
    currentTransferType = type;
    const modal = document.getElementById('transfer-select-modal');
    const title = document.getElementById('transfer-modal-title');
    const list = document.getElementById('transfer-item-list');

    title.innerText = type === 'source' ? "Pilih Item Tumbal (+)" : "Pilih Item Penerima";
    list.innerHTML = "";

    const inv = window.currentInventoryData || {};

    let hasItem = false;
    for (let itemName in inv) {
        if (itemName.includes("Ramuan") || itemName.includes("Stone") || itemName.includes("Coin")) continue;

        // FIX: Ekstrak angka dengan mendeteksi kurung siku [+X]
        const refineMatch = itemName.match(/\[\+(\d+)\]$/);
        const refineLevel = refineMatch ? parseInt(refineMatch[1]) : 0;

        if (type === 'source' && refineLevel === 0) continue;
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
        document.getElementById('transfer-slot-source').innerHTML = "⚔️";

        transferCost = STONE_COST[refineLevel] || (refineLevel * 100);
        document.getElementById('transfer-cost-amount').innerText = transferCost;
    } else {
        selectedTarget = itemName;
        document.getElementById('transfer-name-target').innerText = itemName;
        document.getElementById('transfer-slot-target').style.borderColor = "#28a745";
        document.getElementById('transfer-slot-target').innerHTML = "🛡️";
    }
}

window.executeTransfer = async function () {
    if (!selectedSource || !selectedTarget) return window.rpgAlert("Pilih Item Sumber dan Target terlebih dahulu!");

    if (!await window.rpgConfirm(`Proses ini akan memindahkan tempa dari [${selectedSource}] ke [${selectedTarget}] dengan biaya ${transferCost} Universal Stone. Item sumber akan menjadi +0. Lanjutkan?`, "Konfirmasi Transfer")) return;

    try {
        await runTransaction(db, async (ts) => {
            const userRef = doc(db, "users", window.currentUserUid);
            const data = (await ts.get(userRef)).data();
            let inv = data.inventory || {};

            if (!inv[selectedSource] || inv[selectedSource] < 1) throw "Item Sumber tidak ditemukan di Tas!";
            if (!inv[selectedTarget] || inv[selectedTarget] < 1) throw "Item Target tidak ditemukan di Tas!";
            if ((inv['Universal Stone'] || 0) < transferCost) throw `Universal Stone tidak cukup! Butuh ${transferCost}.`;

            // FIX: Deteksi kurung siku saat membaca nama item dari database
            const sourceMatch = selectedSource.match(/\[\+(\d+)\]$/);
            if (!sourceMatch) throw "Item Sumber tidak memiliki tingkat tempa (+)!";
            const refineLevel = sourceMatch[1];

            // FIX: Bersihkan nama dengan menghapus spasi dan kurung siku " [+X]"
            const cleanSourceName = selectedSource.replace(/\s\[\+\d+\]$/, "");
            const cleanTargetName = selectedTarget.replace(/\s\[\+\d+\]$/, "");

            // FIX: Cetak nama item target dengan menyertakan kurung siku agar dikenali game
            const newTargetName = `${cleanTargetName} [+${refineLevel}]`;

            inv['Universal Stone'] -= transferCost;
            if (inv['Universal Stone'] <= 0) delete inv['Universal Stone'];

            inv[selectedSource] -= 1;
            if (inv[selectedSource] <= 0) delete inv[selectedSource];

            inv[selectedTarget] -= 1;
            if (inv[selectedTarget] <= 0) delete inv[selectedTarget];

            inv[cleanSourceName] = (inv[cleanSourceName] || 0) + 1;
            inv[newTargetName] = (inv[newTargetName] || 0) + 1;

            ts.update(userRef, { inventory: inv });
        });

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

// FITUR Pemasukan Item via Tas
window.putItemToTransferSlot = function (itemName) {
    // FIX: Pastikan pemasukan dari tas juga membaca format kurung siku
    const match = itemName.match(/\[\+(\d+)\]$/);
    const refineLevel = match ? parseInt(match[1]) : 0;

    if (!selectedSource) {
        if (refineLevel === 0) {
            return window.rpgAlert("Item tumbal harus memiliki tingkat tempa (+1 atau lebih)!", "Peringatan");
        }
        currentTransferType = 'source';
        selectTransferItem(itemName, refineLevel);
        window.rpgAlert(`[${itemName}] diletakkan di slot SUMBER.`);
    }
    else {
        if (itemName === selectedSource) {
            return window.rpgAlert("Item target tidak boleh sama dengan item tumbal!", "Peringatan");
        }
        currentTransferType = 'target';
        selectTransferItem(itemName, refineLevel);
        window.rpgAlert(`[${itemName}] diletakkan di slot TARGET.`);
    }
};