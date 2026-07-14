// File: admin-boss.js
// 🔥 IMPORT WAJIB DITAMBAHKAN DI SINI
import { db } from '../../js/firebase-config.js';
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { ITEM_DB } from '../../js/data/items.js';

// ==========================================
// 1. MENGISI DROPDOWN HADIAH WORLD BOSS
// ==========================================
window.populateWorldBossItemDropdowns = function () {
    const selects = ['wb-reward-1-item', 'wb-reward-2-item', 'wb-reward-3-item'];

    // Sekarang ITEM_DB sudah terbaca karena sudah di-import di atas
    if (typeof ITEM_DB !== 'undefined') {
        selects.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.innerHTML = '<option value="">-- Tidak Kirim Item --</option>';
                Object.keys(ITEM_DB).forEach(itemName => {
                    el.innerHTML += `<option value="${itemName}">${itemName}</option>`;
                });
            }
        });
    }
};

// ==========================================
// 2. MENYIMPAN & MENJADWALKAN WORLD BOSS
// ==========================================
// 🔥 KITA MENGGUNAKAN ID TOMBOL BARU AGAR TIDAK BENTROK DENGAN SCRIPT LAMA
document.getElementById('btn-save-wb-schedule')?.addEventListener('click', async () => {
    const name = document.getElementById('wb-admin-name').value.trim();
    const hp = parseInt(document.getElementById('wb-admin-hp').value);
    const startTime = document.getElementById('wb-admin-start-time').value;
    const endTime = document.getElementById('wb-admin-end-time').value;
    const isPermanent = document.getElementById('wb-admin-is-permanent').checked;

    if (!name || isNaN(hp) || hp <= 0) return alert("Nama dan HP Boss tidak valid!");

    if (!isPermanent && (!startTime || !endTime)) {
        return alert("Jika boss tidak permanen, Waktu Mulai dan Waktu Berakhir wajib diisi!");
    }

    if (!isPermanent && (new Date(startTime).getTime() >= new Date(endTime).getTime())) {
        return alert("Waktu Berakhir harus lebih lambat dari Waktu Mulai!");
    }

    // Menyusun struktur hadiah dinamis
    const rewards = {
        rank1: {
            gold: parseInt(document.getElementById('wb-reward-1-gold').value) || 0,
            coin: parseInt(document.getElementById('wb-reward-1-coin').value) || 0,
            item: document.getElementById('wb-reward-1-item').value || "",
            qty: parseInt(document.getElementById('wb-reward-1-qty').value) || 1
        },
        rank2_3: {
            gold: parseInt(document.getElementById('wb-reward-2-gold').value) || 0,
            coin: parseInt(document.getElementById('wb-reward-2-coin').value) || 0,
            item: document.getElementById('wb-reward-2-item').value || "",
            qty: parseInt(document.getElementById('wb-reward-2-qty').value) || 1
        },
        rank4_plus: {
            gold: parseInt(document.getElementById('wb-reward-3-gold').value) || 0,
            coin: parseInt(document.getElementById('wb-reward-3-coin').value) || 0,
            item: document.getElementById('wb-reward-3-item').value || "",
            qty: parseInt(document.getElementById('wb-reward-3-qty').value) || 1
        }
    };

    const bossData = {
        name: name,
        maxHp: hp,
        currentHp: hp,
        startTime: isPermanent ? null : startTime,
        endTime: isPermanent ? null : endTime,
        isPermanent: isPermanent,
        rewards: rewards,
        isActive: true,
        participants: {},
        rewardsDistributed: false
    };

    try {
        const btn = document.getElementById('btn-save-wb-schedule');
        btn.innerText = "⏳ Menyimpan..."; btn.disabled = true;

        // Menggunakan koneksi DB yang sudah di-import di baris paling atas
        await setDoc(doc(db, "events", "worldBoss"), bossData);

        alert(`✅ World Boss [${name}] berhasil diatur dan dijadwalkan!`);
        btn.innerText = "⚔️ SIMPAN & JADWALKAN BOSS"; btn.disabled = false;
    } catch (err) {
        alert("Gagal menjadwalkan boss: " + err.message);
        document.getElementById('btn-save-wb-schedule').disabled = false;
    }
});