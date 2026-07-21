// ==========================================
// SISTEM ROUTER & EVENT LISTENER GLOBAL
// ==========================================
import { db, auth } from '../firebase-config.js';
import { doc, updateDoc, collection, getDocs, writeBatch, query, where, deleteDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js"; // 🔥 Tambahkan deleteDoc
import { updateEmail, linkWithPopup, unlink, GoogleAuthProvider, deleteUser } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js"; // 🔥 Import modul Auth

const googleProvider = new GoogleAuthProvider();

import { MONSTER_DB } from '../data/monsters.js';
import { ITEM_DB } from '../data/items.js';

// Import Fungsi Modul
import { selectCharacterClass, consumePotion, addCharacterStat } from './character.js';
import { sendChat } from './chat.js';
import { createGuild, leaveGuild as dbLeaveGuild, donateGold, upgradeGuild, updateMotd, disbandGuild, joinGuild, kickMember } from './guild.js';
import { depositGold, withdrawGold, depositItem, withdrawItem } from './bank.js';
import { attackMonster } from './battle.js';
import { createOrJoinParty, leaveParty, startFbBattle } from './party.js';
import { equipFromInventory, sellItemToNPC, unequipItem } from './inventory.js';
import { listAuctionItem, buyAuctionItem, cancelAuction, placeBid, acceptBid, rejectBid, returnExpiredToMail } from './auction.js';
import { dismantleItemAction, DISMANTLE_CONFIG, craftItemAction } from './crafting.js';
import { executeRefineAction } from './blacksmith.js';
import { claimMailReward, deleteMail } from './mailbox.js';
import { getIconHTML } from './ui-renderer.js';

// ==========================================
// FUNGSI BANTUAN UI (Toggles & Panels)
// ==========================================
export function clearActiveModeClasses() {
    ['btn-mode-equip', 'btn-mode-sell', 'btn-mode-bank', 'btn-mode-auction', 'btn-mode-dismantle', 'btn-mode-blacksmith', 'btn-mode-crafting'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.className = ""; if (id !== 'btn-mode-equip') el.style.backgroundColor = "#495057"; }
    });
}
window.clearActiveModeClasses = clearActiveModeClasses;

window.bukaPanelKhusus = function (panelId) {
    const panels = ['panel-bank', 'panel-auction', 'panel-blacksmith', 'panel-crafting'];
    const targetPanel = document.getElementById(panelId);
    if (targetPanel && targetPanel.style.display === 'block') { targetPanel.style.display = 'none'; return; }
    panels.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    if (targetPanel) { targetPanel.style.display = 'block'; targetPanel.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
};

window.togglePanel = function (panelId) {
    const el = document.getElementById(panelId);
    if (el) {
        el.style.display = el.style.display === 'none' ? 'block' : 'none';
        if (el.style.display === 'block') el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
};

// ==========================================
// ROUTER KLIK INVENTORY (TAS)
// ==========================================
window.handleInventoryClick = async function (itemName) {
    const modeSaatIni = window.inventoryMode || "EQUIP";
    const uid = window.currentUserUid;
    const stats = window.currentPlayerStats || {};

    if (modeSaatIni === "transfer" || modeSaatIni === "TRANSFER") {
        if (window.putItemToTransferSlot) window.putItemToTransferSlot(itemName);
        return;
    }

    if (modeSaatIni === "EQUIP") {
        if (itemName === "Tiket Ganti Nama") {
            const inputName = await window.rpgPrompt("Masukkan Nama Karakter Baru:", "Ganti Nama");
            if (inputName && inputName.trim() !== "") equipFromInventory(db, uid, itemName, inputName);
        }
        else if (itemName === "Tiket Ubah Job") {
            const inputJob = await window.rpgPrompt("Pilih Job Baru (Ketik: Warrior atau Mage):", "Ganti Job");
            if (inputJob === "Warrior" || inputJob === "Mage") equipFromInventory(db, uid, itemName, inputJob);
            else if (inputJob) window.rpgAlert("Job tidak valid! Harus 'Warrior' atau 'Mage'.");
        }
        else if (itemName === "Buku Reset Stats") {
            if (await window.rpgConfirm("Gunakan Buku Reset Stats?", "Reset Stats")) equipFromInventory(db, uid, itemName, null);
        }
        else if (itemName === "Ramuan HP" || itemName === "Ramuan MP") {
            const sukses = await consumePotion(db, uid, itemName, stats.maxHp, stats.maxMp);
            if (sukses) window.rpgAlert(`Anda meminum [${itemName}]! Nyawa/Mana kembali penuh.`, "Berhasil Diteguk");
        }
        else if (itemName.startsWith("Item Renkarnasi")) {
            window.rpgAlert("Pergilah ke menu Kuil Reinkarnasi (Rebirth) untuk menggunakannya!", "Info Item");
        }
        else { equipFromInventory(db, uid, itemName, null); }
    }
    else if (modeSaatIni === "SELL") { sellItemToNPC(db, uid, itemName); }
    else if (modeSaatIni === "BANK") {
        const inv = window.currentInventoryData || stats.inventory || {};
        const totalItemDiTas = inv[itemName] || 0;

        const qtyStr = await window.rpgPrompt(`Berapa banyak [${itemName}] yang ingin disimpan?`, "Simpan ke Bank", "number", totalItemDiTas);
        const qty = parseInt(qtyStr);
        if (qty > 0) depositItem(db, uid, itemName, qty);
    }
    else if (modeSaatIni === "AUCTION") {
        const itemDilarangPersis = ["Dragon Orb (1 Star)", "Dragon Orb (2 Star)", "Dragon Orb (3 Star)", "Dragon Orb (4 Star)", "Dragon Orb (5 Star)", "Dragon Orb (6 Star)", "Dragon Orb (7 Star)", "Dragon Orb (8 Star)", "Dragon Orb (9 Star)", "Dragon Orb Ocean", "Dragon Orb Mirage", "Dragon Orb Flame", "Mahkota Kaisar Surga", "Pedang Kaisar Langit", "Senjata Dewa: Ragnarok", "Senjata Dewa: Nirvana", "Zirah Dewa: Aegis", "Naga Terbang", "Ramuan Stamina"];
        if (itemDilarangPersis.includes(itemName) || itemName.startsWith("Tiket") || itemName.startsWith("Buku")) return window.rpgAlert("Item premium ini terikat pada karakter dan tidak bisa dilelang.");

        const priceStr = await window.rpgPrompt(`Masukkan Harga Beli Langsung (Gold) untuk 1x [${itemName}]:`, "Jual ke Lelang", "number");
        const price = parseInt(priceStr);
        if (price > 0) listAuctionItem(db, uid, itemName, price, window.playerUsername);
    }
    else if (modeSaatIni === "DISMANTLE") {
        if (DISMANTLE_CONFIG[itemName]) {
            if (await window.rpgConfirm(`🔥 Yakin ingin MELEBUR [${itemName}]?`, "Peleburan Item")) dismantleItemAction(db, uid, itemName);
        } else window.rpgAlert(`❌ [${itemName}] tidak bisa dilebur!`);
    }
    else if (modeSaatIni === "BLACKSMITH") {
        const baseName = itemName.replace(/\s\[\+\d+\]$/, '');
        const itemInfo = ITEM_DB[baseName];
        if (!itemInfo) return window.rpgAlert("Item tidak dikenali sistem.");
        const realIconHTML = getIconHTML(baseName);

        if (itemInfo.type === 'weapon' || itemInfo.type === 'armor' || itemInfo.type === 'accessory') {
            window.bsSelectedEquip = itemName;
            document.getElementById('bs-icon-equip').innerHTML = realIconHTML;
            document.getElementById('bs-text-equip').innerText = itemName;
            document.getElementById('bs-text-equip').style.color = "#00d2ff";
            document.getElementById('bs-info-cost').innerText = `Biaya: ${itemInfo.type === 'weapon' ? 2 : 1}x Mirage Stone`;
        }
        else if (itemInfo.type === 'catalyst') {
            if (itemName === "Mirage Stone") return window.rpgAlert("Mirage Stone digunakan otomatis.");
            window.bsSelectedCatalyst = itemName;
            document.getElementById('bs-icon-catalyst').innerHTML = realIconHTML;
            document.getElementById('bs-text-catalyst').innerText = itemName;
            document.getElementById('bs-text-catalyst').style.color = "#ffcc00";
        }
        else window.rpgAlert("❌ Hanya bisa memasukkan Equip atau Batu Catalyst!");
    }
};

// ==========================================
// ROUTER KLIK LAINNYA (BANK, MAIL, LELANG, DLL)
// ==========================================
window.handleBankClick = async function (itemName, passedQty) {

    const totalItemDiBank = passedQty || 0;

    const qtyStr = await window.rpgPrompt(`Berapa banyak [${itemName}] yang ditarik?`, "Tarik dari Bank", "number", totalItemDiBank);
    const qty = parseInt(qtyStr);

    if (qty > 0) {
        withdrawItem(db, window.currentUserUid, itemName, qty);
    }
};

window.claimMail = function (mailId) { claimMailReward(db, window.currentUserUid, mailId); };
window.deleteMail = async function (mailId) { if (await window.rpgConfirm("Yakin menghapus surat ini?", "Hapus Surat")) deleteMail(db, window.currentUserUid, mailId); };
window.deleteAllMails = async function () {
    if (!await window.rpgConfirm("Hapus semua surat?\n(Surat yang berisi Hadiah belum diklaim TIDAK akan dihapus).", "Bersihkan Kotak Surat")) return;
    try {
        const mailRef = collection(db, "users", window.currentUserUid, "mailbox");
        const snap = await getDocs(mailRef);
        const batch = writeBatch(db);
        let deletedCount = 0;
        snap.docs.forEach(docSnap => {
            const data = docSnap.data();
            const att = data.attachments || {};
            const isPunyaHadiah = (att.itemName || att.name || (att.gold || 0) > 0 || (att.coin || 0) > 0 || data.reward);
            const isSudahDiKlaim = data.isClaimed === true || data.isClaimed === "true";
            if (!isPunyaHadiah || isSudahDiKlaim) { batch.delete(docSnap.ref); deletedCount++; }
        });
        if (deletedCount > 0) { await batch.commit(); window.rpgAlert(`🧹 ${deletedCount} surat dibersihkan!`, "Sukses"); }
        else window.rpgAlert("Tidak ada surat yang bisa dihapus.", "Kotak Bersih");
    } catch (err) { window.rpgAlert(`Gagal: ${err.message}`, "Sistem Error"); }
};

window.buyFromAuction = async function (id, name, price, sellerId) { if (await window.rpgConfirm(`Beli Langsung ${name} seharga ${price} Gold?`, "Pasar Lelang")) buyAuctionItem(db, window.currentUserUid, id, name, price, sellerId); };
window.cancelAuction = async function (id) { if (await window.rpgConfirm("Tarik barang dari pasar?", "Batal Lelang")) cancelAuction(db, window.currentUserUid, id); };
window.placeBid = async function (id, name, currentBid) {
    const minBid = currentBid > 0 ? currentBid + 10 : 10;
    const bidStr = await window.rpgPrompt(`Tawaran untuk ${name} (Min: ${minBid}):`, "Tawar Lelang", "number");
    const bidAmt = parseInt(bidStr);
    if (bidAmt >= minBid) placeBid(db, window.currentUserUid, window.playerUsername, id, bidAmt);
    else if (bidStr) window.rpgAlert(`Minimal tawaran ${minBid} Gold.`);
};
window.actionBid = async function (id, action) {
    if (action === 'accept' && await window.rpgConfirm("Terima tawaran?", "Terima")) acceptBid(db, window.currentUserUid, id);
    if (action === 'reject' && await window.rpgConfirm("Tolak tawaran?", "Tolak")) rejectBid(db, window.currentUserUid, id);
};
window.processExpiredAuction = function (auctionId) { returnExpiredToMail(db, auctionId); };

window.addStat = function (statName) { addCharacterStat(db, window.currentUserUid, statName); };
window.leaveParty = function (partyId) { leaveParty(db, partyId, window.currentUserUid); };
window.startFb = async function (partyId) {
    if (window.isFbRunning) return;
    window.isFbRunning = true;
    try { await startFbBattle(db, window.currentUserUid, partyId); }
    catch (err) { console.error("Gagal memulai FB:", err); }
    finally { setTimeout(() => { window.isFbRunning = false; }, 1500); }
};

window.joinGuildAction = async function (guildId) { if (await window.rpgConfirm("Bergabung dengan Guild ini?", "Gabung Guild")) joinGuild(db, window.currentUserUid, window.currentPlayerStats, guildId); };
window.kickMemberAction = async function (targetUid) { if (await window.rpgConfirm("Keluarkan anggota ini?", "Keluarkan")) kickMember(db, window.currentUserUid, window.currentPlayerStats.guildId, targetUid); };
window.actionCraftItem = async function (recipeName) { if (await window.rpgConfirm(`Siap menempa [${recipeName}]?`, "Crafting")) craftItemAction(db, window.currentUserUid, recipeName); };
window.actionUnequip = function (slotType) { unequipItem(db, window.currentUserUid, slotType); };

// ==========================================
// BLACKSMITH LOGIC
// ==========================================
window.addBlacksmithLog = function (msg, color) {
    const logPanel = document.getElementById('bs-log-panel');
    if (logPanel) {
        const time = new Date().toLocaleTimeString('id-ID', { hour12: false });
        logPanel.innerHTML += `<div style="color: ${color}; margin-bottom: 3px;">[${time}] ${msg}</div>`;
        logPanel.scrollTop = logPanel.scrollHeight;
    }
};

window.executeTempa = async function () {
    if (!window.bsSelectedEquip) return window.addBlacksmithLog("[ERROR] Pilih Equipment terlebih dahulu dari Tas!", "#dc3545");
    if (window.isForging) return;
    window.isForging = true;

    const btnTempa = document.querySelector('button[onclick="window.executeTempa()"]');
    if (btnTempa) { btnTempa.innerText = "⏳ MENEMPA..."; btnTempa.style.background = "#555"; btnTempa.style.cursor = "not-allowed"; }

    const newEquipName = await executeRefineAction(db, window.currentUserUid, window.bsSelectedEquip, window.bsSelectedCatalyst);
    if (newEquipName && typeof newEquipName === 'string') {
        window.bsSelectedEquip = newEquipName;
        const elText = document.getElementById('bs-text-equip');
        if (elText) elText.innerText = newEquipName;
    }

    if (btnTempa) { btnTempa.innerText = "⚒️ TEMPA"; btnTempa.style.background = "#28a745"; btnTempa.style.cursor = "pointer"; }
    window.isForging = false;
};

window.resetEquip = function () {
    window.bsSelectedEquip = null;
    const elIcon = document.getElementById('bs-icon-equip');
    const elText = document.getElementById('bs-text-equip');
    if (elIcon) elIcon.innerHTML = "🛡️";
    if (elText) { elText.innerText = "Pilih Equip"; elText.style.color = "#aaa"; }
    const costText = document.getElementById('bs-info-cost');
    if (costText) costText.innerText = "Silakan pilih Equipment.";
    window.addBlacksmithLog("[SISTEM] Equipment dikeluarkan dari tungku.", "#aaa");
};

window.resetCatalyst = function () {
    window.bsSelectedCatalyst = "Tanpa Batu Tambahan";
    const elIcon = document.getElementById('bs-icon-catalyst');
    const elText = document.getElementById('bs-text-catalyst');
    if (elIcon) elIcon.innerHTML = "💎";
    if (elText) { elText.innerText = "Tanpa Batu"; elText.style.color = "#aaa"; }
    window.addBlacksmithLog("[SISTEM] Batu katalis dikosongkan.", "#aaa");
};

// ==========================================
// SETUP EVENT LISTENERS UTAMA
// ==========================================
export function setupActionRouters() {

    // INFO BOS FB
    document.addEventListener('change', (e) => {
        if (e.target.id === 'fb-select') {
            const boss = MONSTER_DB[e.target.value];
            const infoBox = document.getElementById('fb-drop-info'), textBox = document.getElementById('fb-drop-text');
            if (boss && infoBox && textBox) {
                let dropsInfo = [];
                if (boss.drop) dropsInfo.push(`[${boss.drop.item}] (${(boss.drop.chance * 100).toFixed(0)}%)`);
                if (boss.drops && Array.isArray(boss.drops)) boss.drops.forEach(d => dropsInfo.push(`[${d.item}] (${(d.chance * 100).toFixed(0)}%)`));
                textBox.innerText = dropsInfo.length > 0 ? dropsInfo.join(' | ') : "Hanya EXP & Gold";
                infoBox.style.display = 'block';
            }
        }
    });

    // NAVIGASI COIN MARKET
    document.addEventListener('click', (e) => {
        if (['btn-tab-cmb', 'btn-tab-cms', 'btn-tab-cmw'].includes(e.target.id)) {
            document.getElementById('tab-cm-buy').style.display = e.target.id === 'btn-tab-cmb' ? 'block' : 'none';
            document.getElementById('tab-cm-sell').style.display = e.target.id === 'btn-tab-cms' ? 'block' : 'none';
            document.getElementById('tab-cm-wallet').style.display = e.target.id === 'btn-tab-cmw' ? 'block' : 'none';
        }
    });

    // CRAFTING AUTO TRIGGER
    document.addEventListener('click', function (e) {
        if (e.target.id === 'btn-mode-crafting' || e.target.id === 'btn-mode-blacksmith' || (e.target.innerText && e.target.innerText.includes('CRAFT'))) {
            setTimeout(() => {
                if (typeof window.renderCraftingUI === 'function') {
                    const inv = window.currentInventoryData || {};
                    const lvl = window.currentPlayerStats ? (window.currentPlayerStats.level || 1) : 1;
                    const gold = window.currentPlayerStats ? (window.currentPlayerStats.gold || 0) : 0;
                    window.renderCraftingUI(inv, lvl, gold);
                }
            }, 100);
        }
    });

    // CHAT CHANNEL
    document.addEventListener('change', (e) => {
        if (e.target && e.target.id === 'chat-channel-select') {
            const val = e.target.value;
            if (val === 'guild' && (!window.currentPlayerStats || !window.currentPlayerStats.guildId)) { window.rpgAlert("Belum gabung Guild!"); e.target.value = window.currentChatChannel; return; }
            if (val === 'party' && !window.currentPartyId) { window.rpgAlert("Belum masuk Party FB!"); e.target.value = window.currentChatChannel; return; }
            window.currentChatChannel = val;
            if (window.startDynamicChat) window.startDynamicChat();
        }
    });

    // CHAT ENTER
    document.addEventListener('keydown', (e) => {
        if (e.target && e.target.id === 'chat-input' && e.key === 'Enter') { e.preventDefault(); const btn = document.getElementById('btn-send-chat'); if (btn) btn.click(); }
    });

    // BUAT KARAKTER
    document.addEventListener('click', async function (e) {
        if (e.target && e.target.id === 'btn-create-char') {
            const charNameInput = document.getElementById('char-name-input');
            const classRadio = document.querySelector('input[name="char-class"]:checked');

            if (!charNameInput || !charNameInput.value.trim()) return window.rpgAlert("❌ Nama tidak boleh kosong!");
            if (!classRadio) return window.rpgAlert("❌ Pilih Class!");

            const newCharName = charNameInput.value.trim();

            // 🔥 VALIDASI 1: Cek Panjang Karakter (Misal minimal 4, maksimal 12)
            if (newCharName.length < 4 || newCharName.length > 12) {
                return window.rpgAlert("❌ Nama karakter harus antara 4 hingga 12 huruf!", "Nama Tidak Valid");
            }

            // 🔥 VALIDASI 2: Cek Karakter Aneh (Hanya izinkan huruf dan angka)
            const regexAlphaNumeric = /^[a-zA-Z0-9]+$/;
            if (!regexAlphaNumeric.test(newCharName)) {
                return window.rpgAlert("❌ Nama hanya boleh berisi huruf dan angka (tanpa spasi/simbol)!", "Nama Tidak Valid");
            }

            try {
                e.target.innerText = "🔍 MEMERIKSA NAMA...";
                e.target.style.background = "#555";
                e.target.disabled = true;

                // 🔥 VALIDASI 3: Pengecekan Nama Kembar di Database
                const usersRef = collection(db, "users");
                const q = query(usersRef, where("username", "==", newCharName));
                const querySnapshot = await getDocs(q);

                if (!querySnapshot.empty) {
                    // Jika query tidak kosong, berarti nama sudah dipakai orang lain
                    e.target.innerText = "🔥 Mulai Petualangan 🔥";
                    e.target.style.background = "#ff9800";
                    e.target.disabled = false;
                    return window.rpgAlert(`❌ Nama pahlawan [<b>${newCharName}</b>] sudah digunakan oleh orang lain di server ini. Silakan cari nama lain.`, "Nama Telah Terpakai");
                }

                // Jika semua validasi lolos, lanjutkan pembuatan karakter
                e.target.innerText = "⏳ MENEMPA TAKDIR...";

                await selectCharacterClass(db, window.currentUserUid, classRadio.value);
                await updateDoc(doc(db, "users", window.currentUserUid), { username: newCharName });

                // Refresh halaman agar masuk ke game dengan memori tas yang fresh
                window.location.reload();

            } catch (error) {
                window.rpgAlert("Gagal: " + error.message);
                e.target.innerText = "🔥 Mulai Petualangan 🔥";
                e.target.style.background = "#ff9800";
                e.target.disabled = false;
            }
        }
    });

    // HIGHLIGHT CLASS SELECT
    document.addEventListener('change', function (e) {
        if (e.target && e.target.name === 'char-class') {
            document.querySelectorAll('input[name="char-class"]').forEach(radio => { radio.parentElement.style.borderColor = "#3f3f52"; radio.parentElement.style.background = "#121216"; });
            if (e.target.value === 'Warrior') { e.target.parentElement.style.borderColor = "#dc3545"; e.target.parentElement.style.background = "#1c152a"; }
            else if (e.target.value === 'Mage') { e.target.parentElement.style.borderColor = "#00d2ff"; e.target.parentElement.style.background = "#15201b"; }
        }
    });

    // ROUTER KLIK GLOBAL
    document.addEventListener('click', async (e) => {
        const target = e.target.closest('button') || e.target.closest('.char-card') || e.target;
        const targetId = target.id;
        if (!targetId) return;

        const uid = window.currentUserUid;
        const stats = window.currentPlayerStats || {};

        if (targetId === 'btn-admin-panel') window.location.href = './admin/index.html';
        if (targetId === 'btn-copy-uid') { if (uid) { navigator.clipboard.writeText(uid); window.rpgAlert("📋 UID disalin!"); } }

        // LOGIKA PENGATURAN AKUN
        if (targetId === 'btn-settings') {
            const modal = document.getElementById('settings-modal');
            const user = auth.currentUser;
            if (modal && user) {
                document.getElementById('settings-current-email').innerText = user.email || "Tidak ada email";
                const isGoogleLinked = user.providerData.some(provider => provider.providerId === 'google.com');
                document.getElementById('btn-link-google').style.display = isGoogleLinked ? 'none' : 'flex';
                document.getElementById('btn-unlink-google').style.display = isGoogleLinked ? 'block' : 'none';
                modal.style.display = 'flex';
            }
        }

        if (targetId === 'btn-close-settings') {
            const modal = document.getElementById('settings-modal');
            if (modal) modal.style.display = 'none';
        }

        if (targetId === 'btn-change-email') {
            const newEmail = document.getElementById('settings-new-email').value;
            const user = auth.currentUser;
            if (!newEmail || !user) return;

            if (await window.rpgConfirm(`Yakin ingin mengubah email menjadi ${newEmail}?`, "Ganti Email")) {
                try {
                    await updateEmail(user, newEmail);
                    window.rpgAlert("Email berhasil diubah! Data di database juga akan disinkronkan.");
                    document.getElementById('settings-current-email').innerText = newEmail;
                    document.getElementById('settings-new-email').value = "";
                } catch (error) {
                    if (error.code === 'auth/requires-recent-login') window.rpgAlert("Demi keamanan, Anda harus Logout dan Login kembali sebelum dapat mengubah email.");
                    else window.rpgAlert("Gagal mengubah email: " + error.message);
                }
            }
        }

        if (targetId === 'btn-link-google') {
            const user = auth.currentUser;
            if (!user) return;
            try {
                await linkWithPopup(user, googleProvider);
                window.rpgAlert("Akun Google berhasil dihubungkan (Bind)!");
                document.getElementById('btn-link-google').style.display = 'none';
                document.getElementById('btn-unlink-google').style.display = 'block';
            } catch (error) {
                window.rpgAlert("Gagal menghubungkan Google: " + error.message);
            }
        }

        if (targetId === 'btn-unlink-google') {
            const user = auth.currentUser;
            if (!user) return;
            const hasPassword = user.providerData.some(p => p.providerId === 'password');
            if (!hasPassword) return window.rpgAlert("❌ Anda mendaftar menggunakan Google. Tambahkan kata sandi terlebih dahulu sebelum unbind.");

            if (await window.rpgConfirm("Yakin ingin memutuskan tautan akun Google Anda?", "Unbind Akun")) {
                try {
                    await unlink(user, 'google.com');
                    window.rpgAlert("Akun Google berhasil dilepaskan (Unbind)!");
                    document.getElementById('btn-link-google').style.display = 'flex';
                    document.getElementById('btn-unlink-google').style.display = 'none';
                } catch (error) {
                    window.rpgAlert("Gagal melepaskan Google: " + error.message);
                }
            }
        }

        if (targetId === 'btn-delete-account') {
            const user = auth.currentUser;
            if (!user) return;

            const confirm1 = await window.rpgConfirm("⚠️ PERINGATAN KRITIS: Seluruh data karakter, item, dan progres Anda akan dihapus selamanya. Anda yakin?", "Hapus Akun");
            if (confirm1) {
                const confirm2 = await window.rpgConfirm("Ketik 'HAPUS' (tanpa tanda kutip) untuk mengonfirmasi:", "Verifikasi Akhir", "text");
                if (confirm2 === "HAPUS") {
                    try {
                        await deleteDoc(doc(db, "users", user.uid));
                        await deleteUser(user);
                        alert("Akun berhasil dihapus selamanya. Selamat tinggal Pahlawan!");
                        window.location.reload();
                    } catch (error) {
                        if (error.code === 'auth/requires-recent-login') window.rpgAlert("Sistem menolak penghapusan. Anda harus Logout dan Login kembali sebelum menghapus akun.");
                        else window.rpgAlert("Gagal menghapus akun: " + error.message);
                    }
                } else if (confirm2) {
                    window.rpgAlert("Kata konfirmasi salah. Penghapusan dibatalkan.");
                }
            }
        }

        if (targetId.startsWith('btn-toggle-')) {
            const map = { 'btn-toggle-mall': 'panel-mall', 'btn-toggle-shop': 'panel-shop', 'btn-toggle-coin-market': 'panel-coin-market', 'btn-toggle-mail': 'panel-mailbox', 'btn-toggle-friends': 'panel-friends', 'btn-toggle-boss': 'panel-world-boss', 'btn-toggle-tower': 'panel-tower', 'btn-toggle-afk': 'panel-afk', 'btn-toggle-tickets': 'panel-tickets' };
            if (map[targetId]) window.togglePanel(map[targetId]);

            if (targetId === 'btn-toggle-leaderboard') {
                window.togglePanel('panel-leaderboard');
                const lbContent = document.getElementById('leaderboard-content');
                if (lbContent && lbContent.innerText.includes('Klik kategori')) window.fetchLeaderboard('level');
            }
            if (targetId === 'btn-toggle-tickets' && typeof window.listenToMyTickets === 'function') window.listenToMyTickets();
        }

        if (targetId === 'btn-lb-level') window.fetchLeaderboard('level');
        if (targetId === 'btn-lb-gold') window.fetchLeaderboard('gold');
        if (targetId === 'btn-lb-tower') window.fetchLeaderboard('tower');

        if (targetId === 'class-warrior') selectCharacterClass(db, uid, 'Warrior', () => window.showScreen('screen-game'));
        if (targetId === 'class-mage') selectCharacterClass(db, uid, 'Mage', () => window.showScreen('screen-game'));

        if (targetId === 'btn-send-chat') {
            const chatInput = document.getElementById('chat-input');
            if (chatInput && chatInput.value.trim()) {
                let tId = null;
                if (window.currentChatChannel === 'guild') tId = stats.guildId;
                if (window.currentChatChannel === 'party') tId = window.currentPartyId;
                sendChat(db, uid, window.playerUsername, chatInput.value, window.currentChatChannel, tId);
                chatInput.value = "";
            }
        }

        if (targetId === 'btn-create-guild') { const name = document.getElementById('input-guild-name').value; if (!name) return window.rpgAlert("Nama guild kosong!"); if (await window.rpgConfirm(`Dirikan [${name}] seharga 100k Gold?`, "Buat Guild")) createGuild(db, uid, stats, name); }
        if (targetId === 'btn-leave-guild') { if (await window.rpgConfirm("Keluar dari Guild?", "Keluar Guild")) dbLeaveGuild(db, uid, stats.guildId); }
        if (targetId === 'btn-donate-guild') { const amt = parseInt(document.getElementById('input-donate-gold').value); if (amt > 0) { donateGold(db, uid, stats.guildId, amt); document.getElementById('input-donate-gold').value = ""; } }
        if (targetId === 'btn-upgrade-guild') { if (await window.rpgConfirm("Gunakan Dana Guild untuk naik level?", "Upgrade Guild")) upgradeGuild(db, uid, stats.guildId); }
        if (targetId === 'btn-edit-motd') { const txt = await window.rpgPrompt("Pengumuman baru:", "Papan Info"); if (txt) updateMotd(db, uid, stats.guildId, txt); }
        if (targetId === 'btn-disband-guild') { if (await window.rpgConfirm("PERINGATAN: Bubarkan Guild selamanya?", "Bubarkan Guild")) disbandGuild(db, uid, stats.guildId); }

        if (targetId === 'btn-bank-deposit-gold') { const el = document.getElementById('bank-gold-input'); const val = parseInt(el.value); if (val > 0) { depositGold(db, uid, val); el.value = ""; } }
        if (targetId === 'btn-bank-withdraw-gold') { const el = document.getElementById('bank-gold-input'); const val = parseInt(el.value); if (val > 0) { withdrawGold(db, uid, val); el.value = ""; } }

        if (targetId === 'btn-attack-dungeon') attackMonster(db, uid, document.getElementById('dungeon-select').value, stats);
        if (targetId === 'btn-create-party') createOrJoinParty(db, document.getElementById('fb-select').value, stats);

        if (targetId === 'btn-take-quest') window.assignRandomQuests(db, uid);
        if (targetId === 'btn-claim-daily') window.claimQuestReward(db, uid, 'daily');
        if (targetId === 'btn-claim-bounty') window.claimQuestReward(db, uid, 'bounty');
    });
}