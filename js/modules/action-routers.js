import { db } from '../firebase-config.js';
import { doc, updateDoc, collection, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getIconHTML } from './ui-renderer.js';
import { selectCharacterClass, addCharacterStat, consumePotion } from './character.js';
import { equipFromInventory, sellItemToNPC, unequipItem } from './inventory.js';
import { depositItem, withdrawItem, depositGold, withdrawGold } from './bank.js';
import { listAuctionItem, buyAuctionItem, placeBid, acceptBid, rejectBid, cancelAuction } from './auction.js';
import { dismantleItemAction, craftItemAction, DISMANTLE_CONFIG } from './crafting.js';
import { ITEM_DB } from '../data/items.js';
import { executeRefineAction } from './blacksmith.js';
import { attackMonster } from './battle.js';
import { sendChat } from './chat.js';
import { createGuild, leaveGuild as dbLeaveGuild, donateGold, upgradeGuild, updateMotd, disbandGuild, joinGuild, kickMember } from './guild.js';
import { createOrJoinParty, leaveParty, startFbBattle } from './party.js';
import { claimQuestReward, assignRandomQuests } from './quest.js';
import { claimMailReward, deleteMail } from './mailbox.js';
import { MONSTER_DB } from '../data/monsters.js';

// FUNGSI PEMBERSIH UI MODE TAS
window.clearActiveModeClasses = function () {
    ['btn-mode-equip', 'btn-mode-sell', 'btn-mode-bank', 'btn-mode-auction', 'btn-mode-dismantle', 'btn-mode-blacksmith', 'btn-mode-crafting'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { 
            el.className = ""; 
            if (id !== 'btn-mode-equip') el.style.backgroundColor = "#495057"; 
        }
    });
};

// ACTION ALIASES
window.handleBankClick = async function (itemName) { const qtyStr = await window.rpgPrompt(`Berapa banyak [${itemName}] yang ingin ditarik?`, "Tarik dari Bank", "number"); const qty = parseInt(qtyStr); if (qty > 0) withdrawItem(db, window.currentUserUid, itemName, qty); };
window.claimMail = function (mailId) { claimMailReward(db, window.currentUserUid, mailId); };
window.deleteMail = async function (mailId) { if (await window.rpgConfirm("Yakin ingin menghapus surat ini?", "Hapus Surat")) deleteMail(db, window.currentUserUid, mailId); };
window.buyFromAuction = async function (id, name, price, sellerId) { if (await window.rpgConfirm(`Beli Langsung ${name} seharga ${price} Gold?`, "Pasar Lelang")) buyAuctionItem(db, window.currentUserUid, id, name, price, sellerId); };
window.cancelAuction = async function (id) { if (await window.rpgConfirm("Tarik barang dari pasar?", "Batal Lelang")) cancelAuction(db, window.currentUserUid, id); };
window.actionBid = async function (id, action) { if (action === 'accept' && await window.rpgConfirm("Terima tawaran ini?", "Terima Tawaran")) acceptBid(db, window.currentUserUid, id); if (action === 'reject' && await window.rpgConfirm("Tolak tawaran ini?", "Tolak Tawaran")) rejectBid(db, window.currentUserUid, id); };
window.addStat = function (statName) { addCharacterStat(db, window.currentUserUid, statName); };
window.leaveParty = function (partyId) { leaveParty(db, partyId, window.currentUserUid); };
window.joinGuildAction = async function (guildId) { if (await window.rpgConfirm("Bergabung dengan Guild ini?", "Gabung Guild")) joinGuild(db, window.currentUserUid, window.currentPlayerStats, guildId); };
window.kickMemberAction = async function (targetUid) { if (await window.rpgConfirm("Keluarkan anggota ini dari Guild?", "Keluarkan Anggota")) kickMember(db, window.currentUserUid, window.currentPlayerStats.guildId, targetUid); };
window.actionCraftItem = async function (recipeName) { if (await window.rpgConfirm(`Siap menempa [${recipeName}]?\nSemua material dan Gold yang disyaratkan akan dikonsumsi.`, "Crafting")) craftItemAction(db, window.currentUserUid, recipeName); };
window.actionUnequip = function (slotType) { unequipItem(db, window.currentUserUid, slotType); };

window.placeBid = async function (id, name, currentBid) {
    const minBid = currentBid > 0 ? currentBid + 10 : 10;
    const bidStr = await window.rpgPrompt(`Masukkan tawaran (Bid) untuk ${name}\n(Minimal: ${minBid} Gold):`, "Tawar Lelang", "number");
    const bidAmt = parseInt(bidStr); if (bidAmt >= minBid) { placeBid(db, window.currentUserUid, window.playerUsername, id, bidAmt); } else if (bidStr) { window.rpgAlert(`Tawaran terlalu rendah! Minimal tawaran adalah ${minBid} Gold.`); }
};

window.executeTempa = async function () {
    if (!window.bsSelectedEquip) return window.addBlacksmithLog("[ERROR] Pilih Equipment terlebih dahulu dari Tas!", "#dc3545");
    if (window.isForging) return; window.isForging = true;
    const btnTempa = document.querySelector('button[onclick="window.executeTempa()"]');
    if (btnTempa) { btnTempa.innerText = "⏳ MENEMPA..."; btnTempa.style.background = "#555"; btnTempa.style.cursor = "not-allowed"; }

    const newEquipName = await executeRefineAction(db, window.currentUserUid, window.bsSelectedEquip, window.bsSelectedCatalyst);
    if (newEquipName && typeof newEquipName === 'string') { window.bsSelectedEquip = newEquipName; const elText = document.getElementById('bs-text-equip'); if (elText) elText.innerText = newEquipName; }
    if (btnTempa) { btnTempa.innerText = "⚒️ TEMPA"; btnTempa.style.background = "#28a745"; btnTempa.style.cursor = "pointer"; }
    window.isForging = false;
};

window.startFb = async function (partyId) {
    if (window.isFbRunning) return; window.isFbRunning = true;
    try { await startFbBattle(db, window.currentUserUid, partyId); } 
    catch (err) { console.error("Gagal memulai FB:", err); } 
    finally { setTimeout(() => { window.isFbRunning = false; }, 1500); }
};

window.deleteAllMails = async function () {
    if (!await window.rpgConfirm("Hapus semua surat?\n(Surat yang berisi Hadiah yang belum diklaim TIDAK dihapus).", "Bersihkan Kotak Surat")) return;
    try {
        const mailRef = collection(db, "users", window.currentUserUid, "mailbox"); const snap = await getDocs(mailRef);
        const batch = writeBatch(db); let deletedCount = 0;
        snap.docs.forEach(docSnap => {
            const data = docSnap.data(); const att = data.attachments || {};
            const adaItem = att.itemName || att.name; const adaGold = (att.gold || 0) > 0; const adaCoin = (att.coin || 0) > 0;
            const isSudahDiKlaim = data.isClaimed === true || data.isClaimed === "true";
            if (!(adaItem || adaGold || adaCoin || data.reward) || isSudahDiKlaim) { batch.delete(docSnap.ref); deletedCount++; }
        });
        if (deletedCount > 0) { await batch.commit(); window.rpgAlert(`🧹 ${deletedCount} surat berhasil dibersihkan!`, "Sukses"); } 
        else window.rpgAlert("Tidak ada surat yang bisa dihapus.", "Kotak Bersih");
    } catch (err) { window.rpgAlert(`Gagal: ${err.message}`, "Error"); }
};

window.handleInventoryClick = async function (itemName) {
    const modeSaatIni = window.inventoryMode || "EQUIP";
    if (modeSaatIni === "transfer" || modeSaatIni === "TRANSFER") { window.putItemToTransferSlot(itemName); return; }

    if (modeSaatIni === "EQUIP") {
        if (itemName === "Tiket Ganti Nama") { const inputName = await window.rpgPrompt("Masukkan Nama Baru:", "Ganti Nama"); if (inputName && inputName.trim() !== "") equipFromInventory(db, window.currentUserUid, itemName, inputName); }
        else if (itemName === "Tiket Ubah Job") { const inputJob = await window.rpgPrompt("Pilih Job Baru (Warrior / Mage):", "Ganti Job"); if (inputJob === "Warrior" || inputJob === "Mage") equipFromInventory(db, window.currentUserUid, itemName, inputJob); else if (inputJob) window.rpgAlert("Job tidak valid!"); }
        else if (itemName === "Buku Reset Stats") { if (await window.rpgConfirm("Gunakan Buku Reset Stats?", "Reset Stats")) equipFromInventory(db, window.currentUserUid, itemName, null); }
        else if (itemName === "Ramuan HP" || itemName === "Ramuan MP") { const sukses = await consumePotion(db, window.currentUserUid, itemName, window.currentPlayerStats.maxHp, window.currentPlayerStats.maxMp); if (sukses) window.rpgAlert(`Glug... Anda meminum [${itemName}]!`, "Berhasil"); }
        else { equipFromInventory(db, window.currentUserUid, itemName, null); }
    }
    else if (modeSaatIni === "SELL") sellItemToNPC(db, window.currentUserUid, itemName);
    else if (modeSaatIni === "BANK") { const qtyStr = await window.rpgPrompt(`Berapa banyak [${itemName}] yang ingin disimpan?`, "Simpan", "number"); const qty = parseInt(qtyStr); if (qty > 0) depositItem(db, window.currentUserUid, itemName, qty); }
    else if (modeSaatIni === "AUCTION") { if (itemName.includes("Tiket") || itemName.includes("Buku") || itemName.includes("Ramuan Stamina") || itemName.includes("Naga Terbang")) return window.rpgAlert("Item premium tidak bisa dilelang."); const priceStr = await window.rpgPrompt(`Masukkan Harga (Gold) untuk 1x [${itemName}]:`, "Jual", "number"); const price = parseInt(priceStr); if (price > 0) listAuctionItem(db, window.currentUserUid, itemName, price, window.playerUsername); }
    else if (modeSaatIni === "DISMANTLE") { if (DISMANTLE_CONFIG[itemName]) { if (await window.rpgConfirm(`🔥 LEBUR [${itemName}]?`, "Peleburan")) dismantleItemAction(db, window.currentUserUid, itemName); } else window.rpgAlert(`❌ [${itemName}] tidak bisa dilebur!`); }
    else if (modeSaatIni === "BLACKSMITH") {
        const baseName = itemName.replace(/\s\[\+\d+\]$/, ''); const itemInfo = ITEM_DB[baseName];
        if (!itemInfo) return window.rpgAlert("Item tidak dikenali.");
        if (itemInfo.type === 'weapon' || itemInfo.type === 'armor' || itemInfo.type === 'accessory') {
            window.bsSelectedEquip = itemName; document.getElementById('bs-icon-equip').innerHTML = getIconHTML(baseName); document.getElementById('bs-text-equip').innerText = itemName; document.getElementById('bs-text-equip').style.color = "#00d2ff"; document.getElementById('bs-info-cost').innerText = `Biaya: ${itemInfo.type === 'weapon' ? 2 : 1}x Mirage Stone & 1,000 Gold`;
        } else if (itemInfo.type === 'catalyst') {
            if (itemName === "Mirage Stone") return window.rpgAlert("Mirage Stone digunakan otomatis."); window.bsSelectedCatalyst = itemName; document.getElementById('bs-icon-catalyst').innerHTML = getIconHTML(baseName); document.getElementById('bs-text-catalyst').innerText = itemName; document.getElementById('bs-text-catalyst').style.color = "#ffcc00";
        } else window.rpgAlert("❌ Hanya bisa memasukkan Equip atau Batu Catalyst!");
    }
};

// ==========================================
// KUMPULAN EVENT LISTENERS CLICKS
// ==========================================
document.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'chat-channel-select') {
        const val = e.target.value;
        if (val === 'guild' && !window.currentPlayerStats.guildId) { window.rpgAlert("Belum masuk Guild!"); e.target.value = window.currentChatChannel; return; }
        if (val === 'party' && !window.currentPartyId) { window.rpgAlert("Belum masuk Party!"); e.target.value = window.currentChatChannel; return; }
        window.currentChatChannel = val; window.startDynamicChat();
    }
    if (e.target && e.target.name === 'char-class') {
        document.querySelectorAll('input[name="char-class"]').forEach(r => { r.parentElement.style.borderColor = "#3f3f52"; r.parentElement.style.background = "#121216"; });
        if (e.target.value === 'Warrior') { e.target.parentElement.style.borderColor = "#dc3545"; e.target.parentElement.style.background = "#1c152a"; }
        else if (e.target.value === 'Mage') { e.target.parentElement.style.borderColor = "#00d2ff"; e.target.parentElement.style.background = "#15201b"; }
    }
    if (e.target.id === 'fb-select') {
        const boss = MONSTER_DB[e.target.value]; const infoBox = document.getElementById('fb-drop-info'); const textBox = document.getElementById('fb-drop-text');
        if (boss && infoBox && textBox) { let dropsInfo = []; if (boss.drop) dropsInfo.push(`[${boss.drop.item}] (${(boss.drop.chance * 100).toFixed(0)}%)`); if (boss.drops) boss.drops.forEach(d => dropsInfo.push(`[${d.item}] (${(d.chance * 100).toFixed(0)}%)`)); textBox.innerText = dropsInfo.length > 0 ? dropsInfo.join(' | ') : "Hanya EXP & Gold"; infoBox.style.display = 'block'; }
    }
});

document.addEventListener('keydown', (e) => { if (e.target && e.target.id === 'chat-input' && e.key === 'Enter') { e.preventDefault(); document.getElementById('btn-send-chat').click(); } });

document.addEventListener('click', async (e) => {
    const target = e.target.closest('button') || e.target.closest('.char-card') || e.target; const targetId = target.id;
    if (!targetId) return;

    if (targetId === 'btn-admin-panel') window.location.href = './admin/index.html';
    if (targetId === 'btn-copy-uid') { if (window.currentUserUid) { navigator.clipboard.writeText(window.currentUserUid); window.rpgAlert("📋 UID disalin!"); } }
    
    if (targetId === 'btn-toggle-mall') window.togglePanel('panel-mall');
    if (targetId === 'btn-toggle-shop') window.togglePanel('panel-shop');
    if (targetId === 'btn-toggle-coin-market') window.togglePanel('panel-coin-market');
    if (targetId === 'btn-toggle-mail') window.togglePanel('panel-mailbox');
    if (targetId === 'btn-toggle-friends') window.togglePanel('panel-friends');
    if (targetId === 'btn-toggle-boss') window.togglePanel('panel-world-boss');
    if (targetId === 'btn-toggle-tower') window.togglePanel('panel-tower');
    if (targetId === 'btn-toggle-afk') window.togglePanel('panel-afk');
    if (targetId === 'btn-toggle-pk') window.togglePanel('panel-pk');
    if (targetId === 'btn-toggle-leaderboard') { window.togglePanel('panel-leaderboard'); const lbContent = document.getElementById('leaderboard-content'); if (lbContent && lbContent.innerText.includes('Klik kategori')) window.fetchLeaderboard('level'); }
    if (targetId === 'btn-lb-level') window.fetchLeaderboard('level'); if (targetId === 'btn-lb-gold') window.fetchLeaderboard('gold'); if (targetId === 'btn-lb-tower') window.fetchLeaderboard('tower');
    
    if (targetId === 'btn-tab-cmb') { document.getElementById('tab-cm-buy').style.display = 'block'; document.getElementById('tab-cm-sell').style.display = 'none'; document.getElementById('tab-cm-wallet').style.display = 'none'; }
    if (targetId === 'btn-tab-cms') { document.getElementById('tab-cm-buy').style.display = 'none'; document.getElementById('tab-cm-sell').style.display = 'block'; document.getElementById('tab-cm-wallet').style.display = 'none'; }
    if (targetId === 'btn-tab-cmw') { document.getElementById('tab-cm-buy').style.display = 'none'; document.getElementById('tab-cm-sell').style.display = 'none'; document.getElementById('tab-cm-wallet').style.display = 'block'; }
    
    if (targetId === 'class-warrior') selectCharacterClass(db, window.currentUserUid, 'Warrior', () => window.showScreen('screen-game'));
    if (targetId === 'class-mage') selectCharacterClass(db, window.currentUserUid, 'Mage', () => window.showScreen('screen-game'));

    if (targetId === 'btn-send-chat') { const chatInput = document.getElementById('chat-input'); if (chatInput && chatInput.value.trim()) { let tId = null; if (window.currentChatChannel === 'guild') tId = window.currentPlayerStats.guildId; if (window.currentChatChannel === 'party') tId = window.currentPartyId; sendChat(db, window.currentUserUid, window.playerUsername, chatInput.value, window.currentChatChannel, tId); chatInput.value = ""; } }
    
    if (targetId === 'btn-create-guild') { const name = document.getElementById('input-guild-name').value; if (!name) return window.rpgAlert("Kosong!"); if (await window.rpgConfirm(`Dirikan Guild [${name}] seharga 100,000 Gold?`)) createGuild(db, window.currentUserUid, window.currentPlayerStats, name); }
    if (targetId === 'btn-leave-guild') { if (await window.rpgConfirm("Keluar dari Guild?")) dbLeaveGuild(db, window.currentUserUid, window.currentPlayerStats.guildId); }
    if (targetId === 'btn-donate-guild') { const amt = parseInt(document.getElementById('input-donate-gold').value); if (amt > 0) { donateGold(db, window.currentUserUid, window.currentPlayerStats.guildId, amt); document.getElementById('input-donate-gold').value = ""; } }
    if (targetId === 'btn-upgrade-guild') { if (await window.rpgConfirm("Upgrade Guild?")) upgradeGuild(db, window.currentUserUid, window.currentPlayerStats.guildId); }
    if (targetId === 'btn-edit-motd') { const txt = await window.rpgPrompt("Pengumuman baru:"); if (txt) updateMotd(db, window.currentUserUid, window.currentPlayerStats.guildId, txt); }
    if (targetId === 'btn-disband-guild') { if (await window.rpgConfirm("Bubarkan Guild selamanya?")) disbandGuild(db, window.currentUserUid, window.currentPlayerStats.guildId); }

    if (targetId === 'btn-bank-deposit-gold') { const el = document.getElementById('bank-gold-input'); const val = parseInt(el.value); if (val > 0) { depositGold(db, window.currentUserUid, val); el.value = ""; } }
    if (targetId === 'btn-bank-withdraw-gold') { const el = document.getElementById('bank-gold-input'); const val = parseInt(el.value); if (val > 0) { withdrawGold(db, window.currentUserUid, val); el.value = ""; } }
    if (targetId === 'btn-attack-dungeon') attackMonster(db, window.currentUserUid, document.getElementById('dungeon-select').value, window.currentPlayerStats);
    if (targetId === 'btn-create-party') createOrJoinParty(db, document.getElementById('fb-select').value, window.currentPlayerStats);
    if (targetId === 'btn-take-quest') assignRandomQuests(db, window.currentUserUid);
    if (targetId === 'btn-claim-daily') claimQuestReward(db, window.currentUserUid, 'daily');
    if (targetId === 'btn-claim-bounty') claimQuestReward(db, window.currentUserUid, 'bounty');

    if (targetId === 'btn-enter-pk') {
        if (window.currentPlayerStats.currentHp <= 0) return window.rpgAlert("Anda sudah mati!");
        if ((window.currentPlayerStats.level || 1) < 30) return window.rpgAlert("Hutan melarang level di bawah 30!");
        if (await window.rpgConfirm("Nyawa menjadi taruhan. Masuk Dark Forest?")) updateDoc(doc(db, "users", window.currentUserUid), { inPkZone: true });
    }
    if (targetId === 'btn-leave-pk') { updateDoc(doc(db, "users", window.currentUserUid), { inPkZone: false }); window.rpgAlert("Anda lari ke Safe Zone.", "Aman"); }

    if (targetId === 'btn-create-char') {
        const charNameInput = document.getElementById('char-name-input'); const classRadio = document.querySelector('input[name="char-class"]:checked');
        if (!charNameInput || !charNameInput.value.trim()) return window.rpgAlert("Nama kosong!"); if (!classRadio) return window.rpgAlert("Pilih Class!");
        try {
            e.target.innerText = "⏳ MENEMPA..."; e.target.style.background = "#555"; e.target.disabled = true;
            await selectCharacterClass(db, window.currentUserUid, classRadio.value); await updateDoc(doc(db, "users", window.currentUserUid), { username: charNameInput.value.trim() });
            const screenChar = document.getElementById('screen-char-select'); const screenGame = document.getElementById('screen-game');
            if (screenChar) screenChar.style.display = 'none'; if (screenGame) screenGame.style.display = 'block';
        } catch (error) { window.rpgAlert("Gagal: " + error.message); e.target.innerText = "🔥 Mulai Petualangan 🔥"; e.target.style.background = "#ff9800"; e.target.disabled = false; }
    }

    if (targetId === 'btn-mode-crafting' || targetId === 'btn-mode-blacksmith' || target.innerText.includes('CRAFT')) {
        setTimeout(() => { if (typeof window.renderCraftingUI === 'function') window.renderCraftingUI(window.currentInventoryData || {}, window.currentPlayerStats?.level || 1, window.currentPlayerStats?.gold || 0); }, 100);
    }
});