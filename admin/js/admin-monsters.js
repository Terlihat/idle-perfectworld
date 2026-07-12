// File: admin-monsters.js
import { db } from '../../js/firebase-config.js';
import { collection, doc, getDocs, setDoc, deleteDoc, onSnapshot, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { ITEM_DB } from '../../js/data/items.js';
import { MONSTER_DB } from '../../js/data/monsters.js';

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

        // 🔥 LOGIKA BARU: Pindahkan data ke Array agar bisa diurutkan (Sort)
        let monstersArray = [];
        snapshot.forEach((docSnap) => {
            monstersArray.push({ id: docSnap.id, ...docSnap.data() });
        });

        // 🔥 Mengurutkan berdasarkan Level Monster (Terkecil ke Terbesar)
        monstersArray.sort((a, b) => (a.levelReq || 1) - (b.levelReq || 1));

        // Render HTML
        monstersArray.forEach((data) => {
            const monsterId = data.id;
            const dropCount = data.drops ? data.drops.length : 0;
            const level = data.levelReq || 1;
            const exp = data.expReward || data.exp || 0;
            const gold = data.goldReward || data.gold || 0;

            const dataString = encodeURIComponent(JSON.stringify(data));

            // Desain List Baru (Menampilkan Level, EXP, dan Gold)
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
                // 🔥 Sisipkan pengisian nilai Level ke form
                document.getElementById('editor-monster-level').value = data.levelReq || 1;
                document.getElementById('editor-monster-hp').value = data.hp || 1000;
                document.getElementById('editor-monster-atk').value = data.atk || 50;
                // Mendukung kompatibilitas data lama (exp/gold) dan baru (expReward/goldReward)
                document.getElementById('editor-monster-exp').value = data.expReward || data.exp || 100;
                document.getElementById('editor-monster-gold').value = data.goldReward || data.gold || 50;

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
// 4. MIGRASI DATA LAMA (SYNC DEFAULT)
// ==========================================
document.getElementById('btn-sync-default-monsters')?.addEventListener('click', async () => {
    if (typeof MONSTER_DB === 'undefined') return alert("File data/monsters.js tidak ditemukan.");
    if (!confirm("Tarik semua data dari MONSTER_DB statis ke Firestore?")) return;

    try {
        const batch = writeBatch(db);
        let count = 0;

        for (const [monsterId, data] of Object.entries(MONSTER_DB)) {
            const ref = doc(db, "monsters", monsterId);
            batch.set(ref, data, { merge: true });
            count++;
        }

        await batch.commit();
        alert(`✅ ${count} monster disinkronkan ke Database Live.`);
    } catch (err) {
        alert("Gagal Sync: " + err.message);
    }
});