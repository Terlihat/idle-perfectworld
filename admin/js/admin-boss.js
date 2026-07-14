// ==========================================
// 1. MENGISI DROPDOWN HADIAH WORLD BOSS
// ==========================================
window.populateWorldBossItemDropdowns = function() {
    const selects = ['wb-reward-1-item', 'wb-reward-2-item', 'wb-reward-3-item'];
    
    // Pastikan ITEM_DB sudah di-import atau tersedia di window
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

// Panggil fungsi ini saat Admin Panel selesai dimuat
// window.populateWorldBossItemDropdowns(); 

// ==========================================
// 2. MENYIMPAN & MENJADWALKAN WORLD BOSS
// ==========================================
document.getElementById('btn-admin-spawn-wb')?.addEventListener('click', async () => {
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
        const btn = document.getElementById('btn-admin-spawn-wb');
        btn.innerText = "⏳ Menyimpan..."; btn.disabled = true;

        // Import doc & setDoc jika belum ada di file ini
        const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
        await setDoc(doc(db, "events", "worldBoss"), bossData);

        alert(`✅ World Boss [${name}] berhasil diatur dan dijadwalkan!`);
        btn.innerText = "⚔️ SIMPAN & JADWALKAN BOSS"; btn.disabled = false;
    } catch (err) {
        alert("Gagal menjadwalkan boss: " + err.message);
        document.getElementById('btn-admin-spawn-wb').disabled = false;
    }
});