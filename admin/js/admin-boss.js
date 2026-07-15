// File: admin-boss.js
import { db } from '../../js/firebase-config.js';
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { ITEM_DB } from '../../js/data/items.js';

// Variabel penampung Multi-Drop
window.currentWbDrops = [];

// ==========================================
// 1. MENGISI DROPDOWN HADIAH WORLD BOSS
// ==========================================
window.populateWorldBossItemDropdowns = function () {
    // Tambahkan id 'wb-drop-item-select' ke daftar ini
    const selects = ['wb-reward-1-item', 'wb-reward-2-item', 'wb-reward-3-item', 'wb-drop-item-select'];

    if (typeof ITEM_DB !== 'undefined') {
        selects.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.innerHTML = '<option value="">-- Pilih Item --</option>';
                Object.keys(ITEM_DB).forEach(itemName => {
                    el.innerHTML += `<option value="${itemName}">${itemName}</option>`;
                });
            }
        });
    }
};

// ==========================================
// 2. MANAJEMEN UI EXTRA DROP (MULTI-DROP)
// ==========================================
window.renderWbDropsUI = function () {
    const list = document.getElementById('wb-admin-drops-list');
    if (!list) return;

    list.innerHTML = "";
    if (window.currentWbDrops.length === 0) {
        list.innerHTML = `<div style="text-align: center; color: #777; font-size: 12px; font-style: italic;">Belum ada drop extra.</div>`;
        return;
    }

    window.currentWbDrops.forEach((d, index) => {
        list.innerHTML += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px; background: #010409; border: 1px solid #333; margin-bottom: 5px; border-radius: 3px;">
                <div style="font-size: 12px; color: #fff;">
                    <span style="color: #ffca28;">${d.item}</span> 
                    <span style="color: #a6e3a1; margin-left: 5px;">(${d.chance}%)</span>
                </div>
                <button onclick="window.removeWbDrop(${index})" style="background: #dc3545; color: white; border: none; padding: 2px 6px; font-size: 10px; border-radius: 2px; cursor: pointer;">X</button>
            </div>
        `;
    });
};

document.getElementById('btn-add-wb-drop')?.addEventListener('click', () => {
    const item = document.getElementById('wb-drop-item-select').value;
    const chance = parseFloat(document.getElementById('wb-drop-chance').value);

    if (!item || isNaN(chance) || chance <= 0) {
        return alert("Pilih item dan masukkan persentase peluang dengan benar (contoh: 90 atau 1.5).");
    }

    // Cek apakah item sudah ada, jika ada timpa peluangnya
    const exists = window.currentWbDrops.find(d => d.item === item);
    if (exists) exists.chance = chance;
    else window.currentWbDrops.push({ item: item, chance: chance });

    window.renderWbDropsUI();
});

window.removeWbDrop = function (index) {
    window.currentWbDrops.splice(index, 1);
    window.renderWbDropsUI();
};

// ==========================================
// 3. MENYIMPAN & MENJADWALKAN WORLD BOSS
// ==========================================
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
        extraDrops: window.currentWbDrops, // 🔥 DAFTAR ITEM GACHA DISIMPAN DI SINI
        isActive: true,
        participants: {},
        rewardsDistributed: false
    };

    try {
        const btn = document.getElementById('btn-save-wb-schedule');
        btn.innerText = "⏳ Menyimpan..."; btn.disabled = true;

        await setDoc(doc(db, "events", "worldBoss"), bossData);

        alert(`✅ World Boss [${name}] berhasil diatur dan dijadwalkan!`);
        btn.innerText = "⚔️ SIMPAN & JADWALKAN BOSS"; btn.disabled = false;
    } catch (err) {
        alert("Gagal menjadwalkan boss: " + err.message);
        document.getElementById('btn-save-wb-schedule').disabled = false;
    }
});

// ==========================================
// 4. MANAJEMEN ANTREAN (QUEUE) WORLD BOSS
// ==========================================
window.currentGlobalQueue = []; // Penampung antrean sementara

// Menampilkan Daftar Antrean secara Real-Time
onSnapshot(doc(db, "events", "worldBoss"), (docSnap) => {
    const list = document.getElementById('wb-queue-list');
    if (!list || !docSnap.exists()) return;

    let data = docSnap.data();
    let queue = data.queue || [];
    window.currentGlobalQueue = queue;

    list.innerHTML = "";
    if (queue.length === 0) {
        list.innerHTML = `<div style="text-align: center; color: #777; font-size: 12px; font-style: italic;">Antrean kosong. Sistem aman.</div>`;
        return;
    }

    queue.forEach((q, idx) => {
        list.innerHTML += `
            <div style="padding: 10px; background: #1a1a24; border: 1px solid #333; margin-bottom: 5px; border-radius: 4px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong style="color: #ffca28; font-size: 15px;">${q.name}</strong><br>
                    <small style="color:#aaa;">Mulai: ${new Date(q.startTime).toLocaleString('id-ID')}</small>
                </div>
                <button onclick="window.removeQueuedBoss(${idx})" style="background: #dc3545; color: white; border: none; padding: 6px 12px; font-weight: bold; border-radius: 3px; cursor: pointer;">Hapus</button>
            </div>`;
    });
});

// Menghapus Boss dari Antrean
window.removeQueuedBoss = async function (index) {
    if (!confirm("Yakin ingin menghapus boss ini dari antrean?")) return;
    const bossToRemove = window.currentGlobalQueue[index];
    try {
        await updateDoc(doc(db, "events", "worldBoss"), {
            queue: arrayRemove(bossToRemove)
        });
    } catch (err) { alert("Gagal menghapus antrean: " + err.message); }
};

// Menambahkan Boss Baru ke Antrean
document.getElementById('btn-queue-wb')?.addEventListener('click', async () => {
    const name = document.getElementById('wb-admin-name').value.trim();
    const hp = parseInt(document.getElementById('wb-admin-hp').value);
    const startTime = document.getElementById('wb-admin-start-time').value;
    const endTime = document.getElementById('wb-admin-end-time').value;
    const isPermanent = document.getElementById('wb-admin-is-permanent').checked;

    if (!name || isNaN(hp) || hp <= 0) return alert("Nama dan HP Boss tidak valid!");
    if (isPermanent) return alert("Boss Permanen tidak bisa dimasukkan ke antrean! Boss antrean harus memiliki waktu mulai dan akhir.");
    if (!startTime || !endTime) return alert("Waktu Mulai dan Waktu Berakhir wajib diisi untuk antrean!");
    if (new Date(startTime).getTime() >= new Date(endTime).getTime()) return alert("Waktu Berakhir harus lebih lambat!");

    // Ambil struktur rewards dari form (sama seperti tombol simpan utama)
    const rewards = {
        rank1: { gold: parseInt(document.getElementById('wb-reward-1-gold').value) || 0, coin: parseInt(document.getElementById('wb-reward-1-coin').value) || 0, item: document.getElementById('wb-reward-1-item').value || "", qty: parseInt(document.getElementById('wb-reward-1-qty').value) || 1 },
        rank2_3: { gold: parseInt(document.getElementById('wb-reward-2-gold').value) || 0, coin: parseInt(document.getElementById('wb-reward-2-coin').value) || 0, item: document.getElementById('wb-reward-2-item').value || "", qty: parseInt(document.getElementById('wb-reward-2-qty').value) || 1 },
        rank4_plus: { gold: parseInt(document.getElementById('wb-reward-3-gold').value) || 0, coin: parseInt(document.getElementById('wb-reward-3-coin').value) || 0, item: document.getElementById('wb-reward-3-item').value || "", qty: parseInt(document.getElementById('wb-reward-3-qty').value) || 1 }
    };

    // Format Data Boss Antrean (Mirip Active Boss, tapi tanpa currentHp dan status aktif)
    const queuedBossData = {
        name: name,
        maxHp: hp,
        startTime: startTime,
        endTime: endTime,
        isPermanent: false,
        rewards: rewards,
        extraDrops: window.currentWbDrops || []
    };

    try {
        const btn = document.getElementById('btn-queue-wb');
        btn.innerText = "⏳ Memproses..."; btn.disabled = true;

        // Gunakan setDoc dengan merge agar array 'queue' bertambah tanpa merusak data Boss Aktif
        await setDoc(doc(db, "events", "worldBoss"), {
            queue: arrayUnion(queuedBossData)
        }, { merge: true });

        alert(`✅ Boss [${name}] dimasukkan ke Antrean! Sistem akan otomatis memunculkannya saat jadwal tiba.`);
        btn.innerText = "➕ MASUKKAN KE ANTREAN"; btn.disabled = false;
    } catch (err) {
        alert("Gagal menambahkan antrean: " + err.message);
        document.getElementById('btn-queue-wb').disabled = false;
    }
});