// File: admin-monsters.js
import { db } from '../../js/firebase-config.js';
import { collection, doc, getDocs, setDoc, deleteDoc, onSnapshot, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { ITEM_DB } from '../../js/data/items.js';
import { MONSTER_DB, FB_BOSSES } from '../../js/data/monsters.js';

let currentMonsterDrops = [];

// ==========================================
// 1. POPULASI DROPDOWN ITEM & LISTEN MONSTERS
// ==========================================
window.populateMonsterItemDropdown = function () {
    const selectBox = document.getElementById('monster-drop-item-select');
    if (!selectBox) return;

    selectBox.innerHTML = '<option value="">-- Pilih Item --</option>';
    if (typeof ITEM_DB !== 'undefined') {
        Object.keys(ITEM_DB).forEach(itemName => {
            selectBox.innerHTML += `<option value="${itemName}">${itemName}</option>`;
        });
    }
};

window.listenToMonsters = function () {
    const listDiv = document.getElementById('admin-monster-list');
    if (!listDiv) return;

    onSnapshot(collection(db, "monsters"), (snapshot) => {
        listDiv.innerHTML = "";

        if (snapshot.empty) {
            listDiv.innerHTML = `<div style="text-align: center; color: #aaa; padding: 30px; font-size: 13px;">Database kosong. Silakan buat baru atau klik Sync Default.</div>`;
            return;
        }

        // Pindahkan data ke Array agar bisa diurutkan (Sort)
        let monstersArray = [];
        snapshot.forEach((docSnap) => {
            monstersArray.push({ id: docSnap.id, ...docSnap.data() });
        });

        // Mengurutkan berdasarkan Level Monster (Terkecil ke Terbesar)
        // Karena Sync Default sudah otomatis mengatur levelReq, kita cukup baca levelReq
        monstersArray.sort((a, b) => (a.levelReq || 1) - (b.levelReq || 1));

        // Render HTML
        monstersArray.forEach((data) => {
            const monsterId = data.id;
            const dropCount = data.drops ? data.drops.length : 0;

            // Ambil data yang sudah distandarisasi oleh sistem Sync yang baru
            const level = data.levelReq || 1;
            const exp = data.expReward || 0;
            const gold = data.goldReward || 0;

            const dataString = encodeURIComponent(JSON.stringify(data));

            // Desain List
            listDiv.innerHTML += `
                <div style="padding: 10px; border-bottom: 1px solid #333; background: #1a1a24; margin-bottom: 5px; border-radius: 4px; display: flex; justify-content: space-between; align-items: center;">
                    <div style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="background: #e040fb; color: #fff; padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: bold;">Lv.${level}</span>
                            <span style="color: #ffca28; font-weight: bold; font-size: 14px;">${data.name || monsterId}</span>
                        </div>
                        <div style="color: #aaa; font-size: 11px; margin-top: 5px; display: flex; gap: 10px; flex-wrap: wrap;">
                            <span>❤️ ${data.hp}</span>
                            <span>⚔️ ${data.atk}</span>
                            <span style="color: #a6e3a1;">✨ ${exp} EXP</span>
                            <span style="color: #ffd700;">💰 ${gold} G</span>
                            <span style="color: #00d2ff;">🎁 ${dropCount} Drop</span>
                        </div>
                    </div>
                    <button class="btn-edit-monster" data-id="${monsterId}" data-info="${dataString}" style="background: #0366d6; color: white; padding: 8px 15px; font-size: 12px; font-weight: bold; border: none; border-radius: 4px; cursor: pointer; height: fit-content;">Edit</button>
                </div>`;
        });

        // Event Listener Tombol Edit
        document.querySelectorAll('.btn-edit-monster').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const monsterId = e.target.getAttribute('data-id');
                const data = JSON.parse(decodeURIComponent(e.target.getAttribute('data-info')));

                document.getElementById('editor-monster-id').value = monsterId;
                document.getElementById('editor-monster-name').value = data.name || monsterId;
                document.getElementById('editor-monster-level').value = data.levelReq || 1;
                document.getElementById('editor-monster-hp').value = data.hp || 1000;
                document.getElementById('editor-monster-atk').value = data.atk || 50;
                document.getElementById('editor-monster-exp').value = data.expReward || 100;
                document.getElementById('editor-monster-gold').value = data.goldReward || 50;

                currentMonsterDrops = data.drops || [];
                renderMonsterDropsUI();

                const editorPanel = document.getElementById('monster-editor-panel');
                editorPanel.style.opacity = "1";
                editorPanel.style.pointerEvents = "auto";
            });
        });
    });
};

// ==========================================
// 2. MANAJEMEN DROP ITEM (SISI UI EDITOR)
// ==========================================
function renderMonsterDropsUI() {
    const dropsDiv = document.getElementById('editor-monster-drops');
    dropsDiv.innerHTML = "";

    if (currentMonsterDrops.length === 0) {
        dropsDiv.innerHTML = `<div style="text-align: center; color: #777; font-size: 12px; font-style: italic;">Belum ada drop item.</div>`;
        return;
    }

    currentMonsterDrops.forEach((drop, index) => {
        dropsDiv.innerHTML += `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px; background: #010409; border: 1px solid #333; margin-bottom: 5px; border-radius: 3px;">
                <div style="font-size: 12px; color: #fff;">
                    <span style="color: #ffca28;">${drop.item}</span> 
                    <span style="color: #a6e3a1; margin-left: 5px;">(${drop.chance}%)</span>
                </div>
                <button onclick="window.removeDropItem(${index})" style="background: #dc3545; color: white; border: none; padding: 2px 6px; font-size: 10px; border-radius: 2px; cursor: pointer;">X</button>
            </div>
        `;
    });
}

document.getElementById('btn-add-drop')?.addEventListener('click', () => {
    const itemName = document.getElementById('monster-drop-item-select').value;
    const chance = parseFloat(document.getElementById('monster-drop-chance').value);

    if (!itemName || isNaN(chance) || chance <= 0) {
        return alert("Pilih item dan masukkan persentase peluang dengan benar.");
    }

    const exists = currentMonsterDrops.find(d => d.item === itemName);
    if (exists) exists.chance = chance;
    else currentMonsterDrops.push({ item: itemName, chance: chance });

    renderMonsterDropsUI();
});

window.removeDropItem = function (index) {
    currentMonsterDrops.splice(index, 1);
    renderMonsterDropsUI();
};

// ==========================================
// 3. TOMBOL SIMPAN / HAPUS / TAMBAH BARU
// ==========================================
document.getElementById('btn-add-new-monster')?.addEventListener('click', () => {
    document.getElementById('editor-monster-id').value = "";
    document.getElementById('editor-monster-name').value = "Monster Baru";
    document.getElementById('editor-monster-level').value = "1"; // Reset Level
    document.getElementById('editor-monster-hp').value = "1000";
    document.getElementById('editor-monster-atk').value = "50";
    document.getElementById('editor-monster-exp').value = "100";
    document.getElementById('editor-monster-gold').value = "50";
    currentMonsterDrops = [];
    renderMonsterDropsUI();

    const editorPanel = document.getElementById('monster-editor-panel');
    editorPanel.style.opacity = "1";
    editorPanel.style.pointerEvents = "auto";
});

document.getElementById('btn-save-monster')?.addEventListener('click', async () => {
    let monsterId = document.getElementById('editor-monster-id').value;
    const name = document.getElementById('editor-monster-name').value.trim();

    if (!name) return alert("Nama monster tidak boleh kosong!");

    if (!monsterId) {
        monsterId = name.toLowerCase().replace(/\s+/g, '_');
    }

    // 🔥 Sisipkan levelReq ke data yang akan disimpan
    const dataToSave = {
        name: name,
        levelReq: parseInt(document.getElementById('editor-monster-level').value) || 1,
        hp: parseInt(document.getElementById('editor-monster-hp').value) || 1,
        atk: parseInt(document.getElementById('editor-monster-atk').value) || 1,
        expReward: parseInt(document.getElementById('editor-monster-exp').value) || 0,
        goldReward: parseInt(document.getElementById('editor-monster-gold').value) || 0,
        drops: currentMonsterDrops
    };

    try {
        const btn = document.getElementById('btn-save-monster');
        btn.innerText = "⏳ Menyimpan..."; btn.disabled = true;

        await setDoc(doc(db, "monsters", monsterId), dataToSave, { merge: true });

        if (window.logAdminAction) window.logAdminAction("SYSTEM", `Menyimpan data Monster: [${monsterId}]`);

        btn.innerText = "✅ Tersimpan!";
        setTimeout(() => { btn.innerText = "💾 Simpan Monster"; btn.disabled = false; }, 2000);
    } catch (err) {
        alert("Gagal menyimpan monster: " + err.message);
        document.getElementById('btn-save-monster').disabled = false;
    }
});

document.getElementById('btn-delete-monster')?.addEventListener('click', async () => {
    const monsterId = document.getElementById('editor-monster-id').value;
    if (!monsterId) return alert("Pilih monster yang sudah ada terlebih dahulu!");

    if (!confirm(`YAKIN ingin menghapus [${monsterId}] dari database?`)) return;

    try {
        await deleteDoc(doc(db, "monsters", monsterId));
        if (window.logAdminAction) window.logAdminAction("SYSTEM", `MENGHAPUS Monster: [${monsterId}].`);
        alert("💥 Monster berhasil dihapus.");

        document.getElementById('monster-editor-panel').style.opacity = "0.5";
        document.getElementById('monster-editor-panel').style.pointerEvents = "none";
    } catch (err) {
        alert("Gagal menghapus: " + err.message);
    }
});

// ==========================================
// 4. MIGRASI DATA LAMA (SYNC DEFAULT - OTOMATIS)
// ==========================================
document.getElementById('btn-sync-default-monsters')?.addEventListener('click', async () => {
    if (typeof MONSTER_DB === 'undefined') return alert("File data/monsters.js tidak ditemukan.");
    if (!confirm("Tarik dan PERBARUI OTOMATIS semua data dari MONSTER_DB & FB_BOSSES ke Firestore?")) return;

    try {
        const batch = writeBatch(db);
        let count = 0;

        // 🔥 FUNGSI HELPER: Menerjemahkan bahasa lama ke bahasa baru
        const processMonsterData = (monsterId, data) => {
            const ref = doc(db, "monsters", monsterId);

            // Konversi format drop tunggal (lama) ke format array (baru)
            let newDrops = [];
            if (data.drop && data.drop.item) {
                newDrops.push({
                    item: data.drop.item,
                    // Kalikan 100 agar 0.05 berubah jadi 5 (%) sesuai tampilan UI baru
                    chance: data.drop.chance * 100
                });
            } else if (data.drops) {
                newDrops = data.drops;
            }

            const autoFormattedData = {
                ...data,
                name: data.name || monsterId,
                levelReq: data.levelReq || data.level || 1,
                // Baca rewardExp/rewardGold dari DB lama
                expReward: data.rewardExp || data.expReward || data.exp || 0,
                goldReward: data.rewardGold || data.goldReward || data.gold || 0,
                drops: newDrops // Pakai array drop yang sudah dikonversi
            };

            // Hapus atribut usang agar database Firestore bersih
            delete autoFormattedData.rewardExp;
            delete autoFormattedData.rewardGold;
            delete autoFormattedData.drop;

            batch.set(ref, autoFormattedData, { merge: true });
            count++;
        };

        // 1. Eksekusi semua monster di MONSTER_DB (Dungeon)
        for (const [monsterId, data] of Object.entries(MONSTER_DB)) {
            processMonsterData(monsterId, data);
        }

        // 2. Eksekusi semua bos di FB_BOSSES (Fuben Bosses)
        if (typeof FB_BOSSES !== 'undefined') {
            for (const [bossId, data] of Object.entries(FB_BOSSES)) {
                processMonsterData(bossId, data);
            }
        }

        await batch.commit();
        if (window.logAdminAction) window.logAdminAction("SYSTEM", `Auto-Sync ${count} Monster & Boss ke Firestore.`);
        alert(`✅ ${count} monster & boss berhasil disinkronkan. EXP, Gold, dan Drop telah disesuaikan!`);
    } catch (err) {
        alert("Gagal Sync: " + err.message);
    }
});