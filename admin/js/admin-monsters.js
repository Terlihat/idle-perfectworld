// File: admin-monsters.js
import { db } from '../../js/firebase-config.js';
import { collection, doc, getDocs, setDoc, deleteDoc, onSnapshot, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { ITEM_DB } from '../../js/data/items.js';
// Opsi: Import MONSTER_DB lama untuk fungsi Sync Default
import { MONSTER_DB } from '../../js/data/monsters.js';

let currentMonsterDrops = []; // Menyimpan state drop item sementara saat mengedit

// ==========================================
// 1. POPULASI DROPDOWN ITEM & LISTEN MONSTERS
// ==========================================
window.populateMonsterItemDropdown = function() {
    const selectBox = document.getElementById('monster-drop-item-select');
    if (!selectBox) return;
    
    selectBox.innerHTML = '<option value="">-- Pilih Item --</option>';
    if (typeof ITEM_DB !== 'undefined') {
        Object.keys(ITEM_DB).forEach(itemName => {
            selectBox.innerHTML += `<option value="${itemName}">${itemName}</option>`;
        });
    }
};

window.listenToMonsters = function() {
    const listDiv = document.getElementById('admin-monster-list');
    if (!listDiv) return;

    onSnapshot(collection(db, "monsters"), (snapshot) => {
        listDiv.innerHTML = "";
        
        if (snapshot.empty) {
            listDiv.innerHTML = `<div style="text-align: center; color: #aaa; padding: 30px; font-size: 13px;">Database kosong. Silakan buat baru atau klik Sync Default.</div>`;
            return;
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const monsterId = docSnap.id;
            const dropCount = data.drops ? data.drops.length : 0;
            
            // Simpan data mentah di atribut tombol untuk mempermudah edit
            const dataString = encodeURIComponent(JSON.stringify(data));

            listDiv.innerHTML += `
                <div style="padding: 10px; border-bottom: 1px solid #333; background: #1a1a24; margin-bottom: 5px; border-radius: 4px; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="color: #ffca28; font-weight: bold; font-size: 14px;">${data.name || monsterId}</div>
                        <div style="color: #aaa; font-size: 11px;">HP: ${data.hp} | ATK: ${data.atk} | Drops: ${dropCount} item</div>
                    </div>
                    <button class="btn-edit-monster" data-id="${monsterId}" data-info="${dataString}" style="background: #0366d6; color: white; padding: 5px 12px; font-size: 11px; font-weight: bold; border: none; border-radius: 4px; cursor: pointer;">Edit</button>
                </div>`;
        });

        // Event Listener Tombol Edit
        document.querySelectorAll('.btn-edit-monster').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const monsterId = e.target.getAttribute('data-id');
                const data = JSON.parse(decodeURIComponent(e.target.getAttribute('data-info')));
                
                document.getElementById('editor-monster-id').value = monsterId;
                document.getElementById('editor-monster-name').value = data.name || monsterId;
                document.getElementById('editor-monster-hp').value = data.hp || 1000;
                document.getElementById('editor-monster-atk').value = data.atk || 50;
                document.getElementById('editor-monster-exp').value = data.expReward || 100;
                document.getElementById('editor-monster-gold').value = data.goldReward || 50;
                
                // Load Drops ke memori sementara lalu render
                currentMonsterDrops = data.drops || [];
                renderMonsterDropsUI();
                
                // Buka Panel
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
        return alert("Pilih item dan masukkan persentase peluang dengan benar (contoh: 5.5).");
    }
    
    // Cek duplikasi
    const exists = currentMonsterDrops.find(d => d.item === itemName);
    if (exists) {
        exists.chance = chance; // Update chance jika sudah ada
    } else {
        currentMonsterDrops.push({ item: itemName, chance: chance });
    }
    
    renderMonsterDropsUI();
});

window.removeDropItem = function(index) {
    currentMonsterDrops.splice(index, 1);
    renderMonsterDropsUI();
};

// ==========================================
// 3. TOMBOL SIMPAN / HAPUS / TAMBAH BARU
// ==========================================
document.getElementById('btn-add-new-monster')?.addEventListener('click', () => {
    document.getElementById('editor-monster-id').value = "";
    document.getElementById('editor-monster-name').value = "Monster Baru";
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
    
    // Jika ID kosong (Monster Baru), gunakan nama sebagai ID (format jadi huruf kecil tanpa spasi)
    if (!monsterId) {
        monsterId = name.toLowerCase().replace(/\s+/g, '_');
    }

    const dataToSave = {
        name: name,
        hp: parseInt(document.getElementById('editor-monster-hp').value) || 1,
        atk: parseInt(document.getElementById('editor-monster-atk').value) || 1,
        expReward: parseInt(document.getElementById('editor-monster-exp').value) || 0,
        goldReward: parseInt(document.getElementById('editor-monster-gold').value) || 0,
        drops: currentMonsterDrops
    };

    try {
        // setDoc dengan merge:true agar menimpa atau membuat baru
        await setDoc(doc(db, "monsters", monsterId), dataToSave, { merge: true });
        
        if(window.logAdminAction) {
            window.logAdminAction("SYSTEM", `Telah menyimpan/mengupdate data Monster: [${monsterId}]`);
        }
        alert("✅ Data monster berhasil disimpan ke Database!");
    } catch (err) {
        alert("Gagal menyimpan monster: " + err.message);
    }
});

document.getElementById('btn-delete-monster')?.addEventListener('click', async () => {
    const monsterId = document.getElementById('editor-monster-id').value;
    if (!monsterId) return alert("Pilih monster yang sudah ada terlebih dahulu!");
    
    if (!confirm(`YAKIN ingin menghapus [${monsterId}] dari database? Game mungkin error jika monster ini dipanggil di Fuben!`)) return;

    try {
        await deleteDoc(doc(db, "monsters", monsterId));
        
        if(window.logAdminAction) {
            window.logAdminAction("SYSTEM", `Telah MENGHAPUS Monster: [${monsterId}] dari database.`);
        }
        alert("💥 Monster berhasil dihapus.");
        
        // Tutup editor
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
    
    if (!confirm("Ini akan menarik semua data dari MONSTER_DB statis Anda dan memasukkannya ke Firestore. Lanjutkan?")) return;
    
    try {
        const batch = writeBatch(db);
        let count = 0;
        
        for (const [monsterId, data] of Object.entries(MONSTER_DB)) {
            const ref = doc(db, "monsters", monsterId);
            batch.set(ref, data, { merge: true });
            count++;
        }
        
        await batch.commit();
        alert(`✅ Selesai! ${count} monster dari file lokal berhasil disinkronkan ke Database Live.`);
        if(window.logAdminAction) window.logAdminAction("SYSTEM", `Melakukan Sync massal ${count} Monster ke Firestore.`);
    } catch (err) {
        alert("Gagal melakukan Sync: " + err.message);
    }
});