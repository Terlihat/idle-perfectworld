import { db } from '../firebase-config.js';
import { doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getIconHTML } from './ui-utils.js';

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

// ==========================================
// FUNGSI PEMBANTU BARU
// ==========================================

// 1. Memeriksa apakah item adalah Equipment
function isEquipment(itemName) {
    const baseName = itemName.replace(/\s\[\+\d+\]$/, '');

    // Jika data ITEM_DB global tersedia, cek tipenya
    if (typeof window.ITEM_DB !== 'undefined' && window.ITEM_DB[baseName]) {
        const type = window.ITEM_DB[baseName].type;
        return type === 'weapon' || type === 'armor' || type === 'accessory';
    }

    // Filter Fallback: Tolak keyword yang bukan equipment
    const invalidKeywords = ["Ramuan", "Stone", "Coin", "Buku", "Tiket", "Mold", "Inti", "Potongan", "Serbuk", "Kayu", "Serpihan", "Botol"];
    if (invalidKeywords.some(kw => itemName.includes(kw))) return false;

    return true; // Jika lolos, anggap sebagai equipment
}

// 2. Melepaskan/Mengosongkan Slot
function resetTransferSlot(type) {
    if (type === 'source') {
        selectedSource = null;
        transferCost = 0;
        document.getElementById('transfer-name-source').innerText = "Pilih Item";
        document.getElementById('transfer-slot-source').innerHTML = '<span style="font-size: 24px; color: #555;">+</span>';
        document.getElementById('transfer-slot-source').style.borderColor = "#555";
        document.getElementById('transfer-cost-amount').innerText = "0";
    } else {
        selectedTarget = null;
        document.getElementById('transfer-name-target').innerText = "Pilih Item";
        document.getElementById('transfer-slot-target').innerHTML = '<span style="font-size: 24px; color: #555;">+</span>';
        document.getElementById('transfer-slot-target').style.borderColor = "#555";
    }
}

// ==========================================
// FUNGSI UTAMA TRANSFER
// ==========================================

window.openTransferSelect = function (type) {
    // LOGIKA BARU: Jika slot sudah berisi item, KLIK = LEPASKAN ITEM
    if (type === 'source' && selectedSource) {
        resetTransferSlot('source');
        return;
    }
    if (type === 'target' && selectedTarget) {
        resetTransferSlot('target');
        return;
    }

    // Jika slot kosong, buka modal pemilihan
    currentTransferType = type;
    const modal = document.getElementById('transfer-select-modal');
    const title = document.getElementById('transfer-modal-title');
    const list = document.getElementById('transfer-item-list');

    title.innerText = type === 'source' ? "Pilih Item Tumbal (+)" : "Pilih Item Penerima";
    list.innerHTML = "";

    const inv = window.currentInventoryData || {};

    let hasItem = false;
    for (let itemName in inv) {
        // FILTER: Abaikan jika bukan equipment
        if (!isEquipment(itemName)) continue;

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
        list.innerHTML = `<div style="text-align:center; color:#aaa; font-size:12px;">Tidak ada equip yang cocok di tas Anda.</div>`;
    }

    modal.style.display = "flex";
};

function selectTransferItem(itemName, refineLevel) {
    document.getElementById('transfer-select-modal').style.display = 'none';

    const baseName = itemName.replace(/\s\[\+\d+\]$/, '');

    // Render icon dengan aman
    let iconHTML = "📦";
    try {
        iconHTML = (typeof getIconHTML === 'function') ? getIconHTML(baseName) : window.getIconHTML(baseName);
    } catch (e) { }

    if (currentTransferType === 'source') {
        selectedSource = itemName;
        document.getElementById('transfer-name-source').innerText = itemName;
        document.getElementById('transfer-slot-source').style.borderColor = "#ffcc00";
        document.getElementById('transfer-slot-source').innerHTML = iconHTML;

        transferCost = STONE_COST[refineLevel] || (refineLevel * 100);
        document.getElementById('transfer-cost-amount').innerText = transferCost;
    } else {
        selectedTarget = itemName;
        document.getElementById('transfer-name-target').innerText = itemName;
        document.getElementById('transfer-slot-target').style.borderColor = "#28a745";
        document.getElementById('transfer-slot-target').innerHTML = iconHTML;
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

            const sourceMatch = selectedSource.match(/\[\+(\d+)\]$/);
            if (!sourceMatch) throw "Item Sumber tidak memiliki tingkat tempa (+)!";
            const refineLevel = sourceMatch[1];

            const cleanSourceName = selectedSource.replace(/\s\[\+\d+\]$/, "");
            const cleanTargetName = selectedTarget.replace(/\s\[\+\d+\]$/, "");

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

        // Kosongkan slot secara otomatis setelah sukses
        resetTransferSlot('source');
        resetTransferSlot('target');

        window.rpgAlert("✨ SUCCESS! Pewarisan tempa berhasil dilakukan!", "Sukses");

    } catch (err) { window.rpgAlert(err, "Gagal Transfer"); }
};

// ==========================================
// INTEGRASI DENGAN KLIK TAS INVENTORY
// ==========================================
window.putItemToTransferSlot = function (itemName) {
    // FILTER KETAT: Jika pemain mengklik item selain Equip dari tas
    if (!isEquipment(itemName)) {
        return window.rpgAlert("❌ Hanya Senjata, Zirah, dan Aksesoris yang bisa dimasukkan ke Altar Pewarisan!");
    }

    const match = itemName.match(/\[\+(\d+)\]$/);
    const refineLevel = match ? parseInt(match[1]) : 0;

    if (!selectedSource) {
        if (refineLevel === 0) {
            return window.rpgAlert("Item tumbal (Sumber) harus memiliki tingkat tempa (+1 atau lebih)!", "Peringatan");
        }
        currentTransferType = 'source';
        selectTransferItem(itemName, refineLevel);
        window.rpgAlert(`[${itemName}] diletakkan di slot SUMBER.`);
    }
    else if (!selectedTarget) {
        if (itemName === selectedSource) {
            return window.rpgAlert("Item target tidak boleh sama dengan item tumbal!", "Peringatan");
        }
        currentTransferType = 'target';
        selectTransferItem(itemName, refineLevel);
        window.rpgAlert(`[${itemName}] diletakkan di slot TARGET.`);
    } else {
        // Jika kedua slot penuh, peringatkan pemain untuk melepaskan slot
        window.rpgAlert("❌ Kedua slot sudah penuh! Silakan lepaskan (klik) salah satu slot terlebih dahulu untuk menggantinya.");
    }
};