import { db, auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, getDoc, updateDoc, onSnapshot, runTransaction, collection, getDocs, query, where} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// IMPORT MODULES UI
import { loadUIComponents } from './ui-loader.js';
loadUIComponents(); 

import { 
    renderPlayerUI, renderQuestUI, renderInventoryUI, renderBankUI, writeBatch,
    renderMailboxUI, renderAuctionUI, renderPartyUI, renderGuildUI, renderChatUI, escapeHTML, renderCraftingUI, getIconHTML, renderShopAndMall, renderPKUI
} from './modules/ui-renderer.js';

// IMPORT MODULES SISTEM
import { selectCharacterClass, addCharacterStat, startStaminaRegeneration } from './modules/character.js';
import { equipFromInventory, sellItemToNPC, unequipItem } from './modules/inventory.js';
import { attackMonster } from './modules/battle.js'; 
import { listenToChat, sendChat } from './modules/chat.js';
import { depositGold, withdrawGold, depositItem, withdrawItem } from './modules/bank.js';
import { listenToAuction, listAuctionItem, buyAuctionItem, placeBid, acceptBid, rejectBid, cancelAuction } from './modules/auction.js';
import { listenToParties, createOrJoinParty, leaveParty, startFbBattle } from './modules/party.js';
import { assignRandomQuests, claimQuestReward } from './modules/quest.js';
import { listenToGuilds, createGuild, joinGuild, leaveGuild as dbLeaveGuild, donateGold, upgradeGuild, updateMotd, kickMember, disbandGuild } from './modules/guild.js';
import { listenToMailbox, claimMailReward, deleteMail } from './modules/mailbox.js';
import { dismantleItemAction, DISMANTLE_CONFIG, craftItemAction } from './modules/crafting.js';
import { ITEM_DB } from './data/items.js';
import { executeRefineAction } from './modules/blacksmith.js';

// ==========================================
// SISTEM UNIVERSAL RPG MODAL (Pengganti Alert/Confirm/Prompt)
// ==========================================
window.showModal = function({ type, msg, title, inputType = 'text' }) {
    return new Promise((resolve) => {
        const modal = document.getElementById('rpg-modal');
        const box = document.getElementById('rpg-modal-box');
        const elTitle = document.getElementById('rpg-modal-title');
        const elMsg = document.getElementById('rpg-modal-msg');
        const elInput = document.getElementById('rpg-modal-input');
        const btnCancel = document.getElementById('btn-rpg-cancel');
        const btnOk = document.getElementById('btn-rpg-ok');

        if (!modal) {
            console.error("HTML Modal belum dipasang!");
            return resolve(type === 'prompt' ? null : (type !== 'confirm'));
        }

        // Kustomisasi Warna berdasarkan Tipe
        let colorTheme = '#00d2ff'; // Default Biru
        if (type === 'alert') colorTheme = '#ffcc00'; // Kuning (Peringatan)
        if (type === 'confirm') colorTheme = '#ff9800'; // Oranye (Pertanyaan)
        
        elTitle.innerText = title;
        elTitle.style.color = colorTheme;
        box.style.borderColor = colorTheme;
        btnOk.style.background = colorTheme;
        
        elMsg.innerHTML = String(msg).replace(/\n/g, '<br>');

        // Reset Event Listener agar tidak bertumpuk
        const newBtnOk = btnOk.cloneNode(true);
        const newBtnCancel = btnCancel.cloneNode(true);
        btnOk.parentNode.replaceChild(newBtnOk, btnOk);
        btnCancel.parentNode.replaceChild(newBtnCancel, btnCancel);

        // Atur Mode
        if (type === 'prompt') {
            elInput.style.display = 'block';
            elInput.type = inputType;
            elInput.value = '';
            newBtnCancel.style.display = 'block';
        } else if (type === 'confirm') {
            elInput.style.display = 'none';
            newBtnCancel.style.display = 'block';
        } else { // Alert
            elInput.style.display = 'none';
            newBtnCancel.style.display = 'none';
        }

        modal.style.display = 'flex';
        if (type === 'prompt') elInput.focus();

        // Eksekusi Tombol
        newBtnOk.addEventListener('click', () => {
            modal.style.display = 'none';
            resolve(type === 'prompt' ? elInput.value : true);
        });

        newBtnCancel.addEventListener('click', () => {
            modal.style.display = 'none';
            resolve(type === 'prompt' ? null : false);
        });
    });
};

// ALIAS FUNGSI UNTUK MEMPERMUDAH PEMANGGILAN
window.rpgAlert = (msg, title="Pesan Sistem") => window.showModal({type: 'alert', msg, title});
window.rpgConfirm = (msg, title="Konfirmasi") => window.showModal({type: 'confirm', msg, title});
window.rpgPrompt = (msg, title="Input", inputType="text") => window.showModal({type: 'prompt', msg, title, inputType});

// OVERRIDE ALERT BAWAAN BROWSER AGAR MODUL LAIN OTOMATIS KEREN
window.alert = function(msg) { window.rpgAlert(msg); };

// ==========================================

let currentUserUid = null;
let activeUnsubscribeListeners = [];
let inventoryMode = "EQUIP"; 
let playerUsername = "Hero Anonim";
let currentPlayerStats = {}; 
let staminaRegenInterval = null;

let globalGuilds = {}; 
let guildUpgradesMap = {};

let currentChatChannel = 'world'; 
let currentPartyId = null;
let unsubChatListener = null;
let unsubMail;

let bsSelectedEquip = null;
let bsSelectedCatalyst = "Tanpa Batu Tambahan";

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    document.getElementById(screenId).style.display = 'block';
}

function startDynamicChat() {
    if (unsubChatListener) unsubChatListener(); 
    let targetId = null;
    if (currentChatChannel === 'guild') targetId = currentPlayerStats.guildId;
    if (currentChatChannel === 'party') targetId = currentPartyId;

    unsubChatListener = listenToChat(db, currentChatChannel, targetId, (messages) => {
        renderChatUI(messages, currentChatChannel);
    });
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUserUid = user.uid;
        
        await loadUIComponents();
        
        const docSnap = await getDoc(doc(db, "users", currentUserUid));
        if (!docSnap.exists() || !docSnap.data().characterClass) {
            showScreen('screen-char-select');
        } else {
            showScreen('screen-game');
            renderShopAndMall();
            startLiveGameSync();
            if (staminaRegenInterval) clearInterval(staminaRegenInterval);
            staminaRegenInterval = startStaminaRegeneration(db, currentUserUid); 
        }
    } else {
        currentUserUid = null;
        if (staminaRegenInterval) clearInterval(staminaRegenInterval);
        activeUnsubscribeListeners.forEach(unsub => unsub());
        if (unsubChatListener) unsubChatListener();
        activeUnsubscribeListeners = [];
        showScreen('screen-auth');
    }
});

function startLiveGameSync() {

    const unsubGuilds = listenToGuilds(db, (guildsData, upgradesData) => {
        globalGuilds = guildsData;
        guildUpgradesMap = upgradesData;
        renderGuildUI(currentPlayerStats, globalGuilds, guildUpgradesMap); 
    });

    const unsubData = onSnapshot(doc(db, "users", currentUserUid), (docSnap) => {
        if (!docSnap.exists()) return;
        const d = docSnap.data();
        playerUsername = d.username || "Hero Anonim";

        const baseTotal = d.characterClass === 'Warrior' ? 42 : 45;
        const expectedTotal = baseTotal + ((d.level || 1) - 1) * 5;
        const currentTotal = (d.str || 0) + (d.con || 0) + (d.dex || 0) + (d.int || 0) + (d.statPoints || 0);

        if (currentTotal < expectedTotal) {
            updateDoc(doc(db, "users", currentUserUid), { statPoints: (d.statPoints || 0) + (expectedTotal - currentTotal) });
            return; 
        }

        if (d.guildId && globalGuilds[d.guildId]) {
            const myGuild = globalGuilds[d.guildId];
            const myDataInGuild = myGuild.members.find(m => m.uid === currentUserUid);
            if (myDataInGuild && myDataInGuild.level !== (d.level || 1)) {
                const updatedMembers = myGuild.members.map(m => 
                    m.uid === currentUserUid ? { ...m, level: (d.level || 1) } : m
                );
                updateDoc(doc(db, "guilds", d.guildId), { members: updatedMembers });
            }
        }

        if (!d.guildId && currentChatChannel === 'guild') {
            currentChatChannel = 'world';
            const sel = document.getElementById('chat-channel-select');
            if(sel) sel.value = 'world';
            startDynamicChat();
        }

        const newStats = renderPlayerUI(d, currentUserUid, globalGuilds, guildUpgradesMap);
        if (newStats) currentPlayerStats = newStats; 

        renderQuestUI(d.quests);
        renderInventoryUI(d.inventory);
        renderBankUI(d.bankInventory);
        renderGuildUI(currentPlayerStats, globalGuilds, guildUpgradesMap); 
        renderCraftingUI(d.inventory || {}, d.level || 1, d.gold || 0);
        
        if (!unsubChatListener) startDynamicChat();
    });

    unsubMail = listenToMailbox(db, currentUserUid, (mails) => {
        renderMailboxUI(mails);
        const badge = document.getElementById('mail-badge');
        if (badge) {
            if (mails && mails.length > 0) {
                badge.innerText = mails.length;
                badge.style.display = 'inline-block'; // Munculkan badge
            } else {
                badge.style.display = 'none'; // Sembunyikan jika kosong
            }
        }
    });

    const unsubAuction = listenToAuction(db, (items) => {
        renderAuctionUI(items, currentUserUid);
    });

    const unsubParties = listenToParties(db, (parties) => {
        let myParty = parties.find(p => p.members.find(m => m.uid === currentUserUid));
        let newPartyId = myParty ? myParty.id : null;

        if (currentPartyId !== newPartyId) {
            currentPartyId = newPartyId;
            if (!currentPartyId && currentChatChannel === 'party') {
                currentChatChannel = 'world';
                const sel = document.getElementById('chat-channel-select');
                if(sel) sel.value = 'world';
                startDynamicChat();
            }
        }
        renderPartyUI(parties, currentUserUid);
    });

    activeUnsubscribeListeners.push(unsubData, unsubMail, unsubAuction, unsubParties, unsubGuilds);
}

document.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'chat-channel-select') {
        const val = e.target.value;
        if (val === 'guild' && !currentPlayerStats.guildId) {
            window.rpgAlert("Anda belum bergabung dengan Guild!");
            e.target.value = currentChatChannel; return;
        }
        if (val === 'party' && !currentPartyId) {
            window.rpgAlert("Anda belum masuk ke dalam Ruang Tunggu Party FB!");
            e.target.value = currentChatChannel; return;
        }
        currentChatChannel = val;
        startDynamicChat();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.target && e.target.id === 'chat-input' && e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('btn-send-chat').click();
    }
});

function clearActiveModeClasses() { 
    ['btn-mode-equip', 'btn-mode-sell', 'btn-mode-bank', 'btn-mode-auction', 'btn-mode-dismantle', 'btn-mode-blacksmith', 'btn-mode-crafting'].forEach(id => { 
        const el = document.getElementById(id); 
        if (el) { el.className = ""; if (id !== 'btn-mode-equip') el.style.backgroundColor = "#495057"; }
    }); 
}

// MENGUBAH GLOBAL CLICK MENJADI ASYNC AGAR AWAIT BERFUNGSI
document.addEventListener('click', async (e) => {
    const target = e.target.closest('button') || e.target.closest('.char-card') || e.target;
    const targetId = target.id;

    if (!targetId) return;

    if (targetId === 'btn-admin-panel') window.location.href = './admin/index.html';
    if (targetId === 'btn-copy-uid') { if (currentUserUid) { navigator.clipboard.writeText(currentUserUid); window.rpgAlert("📋 UID disalin!"); } }
    
    // --- NAVIGASI TOGGLE PANEL ---
    if (targetId === 'btn-toggle-mall') window.togglePanel('panel-mall');
    if (targetId === 'btn-toggle-shop') window.togglePanel('panel-shop');
    if (targetId === 'btn-toggle-mail') window.togglePanel('panel-mailbox');
    if (targetId === 'btn-toggle-leaderboard') {
        window.togglePanel('panel-leaderboard');
        const lbContent = document.getElementById('leaderboard-content');
        if (lbContent && lbContent.innerText.includes('Klik kategori')) window.fetchLeaderboard('level');
    }

    // --- TOMBOL KATEGORI LEADERBOARD ---
    if (targetId === 'btn-lb-level') window.fetchLeaderboard('level');
    if (targetId === 'btn-lb-gold') window.fetchLeaderboard('gold');
    if (targetId === 'btn-lb-bp') window.fetchLeaderboard('bp');

    if (targetId === 'class-warrior') selectCharacterClass(db, currentUserUid, 'Warrior', () => showScreen('screen-game'));
    if (targetId === 'class-mage') selectCharacterClass(db, currentUserUid, 'Mage', () => showScreen('screen-game'));

    if (targetId === 'btn-mode-equip') { inventoryMode = "EQUIP"; clearActiveModeClasses(); target.className = "mode-active"; }
    if (targetId === 'btn-mode-sell') { inventoryMode = "SELL"; clearActiveModeClasses(); target.className = "mode-sell-active"; }
    if (targetId === 'btn-mode-dismantle') { inventoryMode = "DISMANTLE"; clearActiveModeClasses(); target.style.backgroundColor = "#dc3545"; }
    
    if (targetId === 'btn-mode-bank') { 
        inventoryMode = "BANK"; 
        clearActiveModeClasses(); 
        target.className = "mode-active"; 
        window.bukaPanelKhusus('panel-bank'); 
    }
    if (targetId === 'btn-mode-auction') { 
        inventoryMode = "AUCTION"; 
        clearActiveModeClasses(); 
        target.className = "mode-auction-active"; 
        window.bukaPanelKhusus('panel-auction'); 
    }
    if (targetId === 'btn-mode-crafting') { 
        inventoryMode = "CRAFTING"; 
        clearActiveModeClasses(); 
        target.style.backgroundColor = "#17a2b8";
        window.bukaPanelKhusus('panel-crafting'); 
    }

    if (targetId === 'btn-send-chat') {
        const chatInput = document.getElementById('chat-input');
        if (chatInput && chatInput.value.trim()) { 
            let tId = null;
            if (currentChatChannel === 'guild') tId = currentPlayerStats.guildId;
            if (currentChatChannel === 'party') tId = currentPartyId;
            sendChat(db, currentUserUid, playerUsername, chatInput.value, currentChatChannel, tId); 
            chatInput.value = ""; 
        }
    }

    // --- FITUR GUILD DENGAN RPG MODAL ---
    if (targetId === 'btn-create-guild') { 
        const name = document.getElementById('input-guild-name').value; 
        if (!name) return window.rpgAlert("Nama guild tidak boleh kosong!");
        if (await window.rpgConfirm(`Dirikan Guild [${name}] seharga 100,000 Gold?`, "Buat Guild")) createGuild(db, currentUserUid, currentPlayerStats, name); 
    }
    if (targetId === 'btn-leave-guild') { if (await window.rpgConfirm("Yakin ingin keluar dari Guild? Anda akan kehilangan semua Buff Guild!", "Keluar Guild")) dbLeaveGuild(db, currentUserUid, currentPlayerStats.guildId); }
    if (targetId === 'btn-donate-guild') { const amt = parseInt(document.getElementById('input-donate-gold').value); if (amt > 0) { donateGold(db, currentUserUid, currentPlayerStats.guildId, amt); document.getElementById('input-donate-gold').value = ""; } }
    if (targetId === 'btn-upgrade-guild') { if (await window.rpgConfirm("Gunakan Dana Guild untuk naik level?", "Upgrade Guild")) upgradeGuild(db, currentUserUid, currentPlayerStats.guildId); }
    if (targetId === 'btn-edit-motd') { 
        const txt = await window.rpgPrompt("Masukkan pengumuman baru untuk anggota Guild:", "Ubah Papan Info"); 
        if (txt) updateMotd(db, currentUserUid, currentPlayerStats.guildId, txt); 
    }
    if (targetId === 'btn-disband-guild') { if (await window.rpgConfirm("PERINGATAN KERAS: Yakin membubarkan Guild selamanya? Dana Guild akan hangus!", "Bubarkan Guild")) disbandGuild(db, currentUserUid, currentPlayerStats.guildId); }

    if (targetId === 'btn-bank-deposit-gold') { const el = document.getElementById('bank-gold-input'); const val = parseInt(el.value); if (val > 0) { depositGold(db, currentUserUid, val); el.value = ""; } }
    if (targetId === 'btn-bank-withdraw-gold') { const el = document.getElementById('bank-gold-input'); const val = parseInt(el.value); if (val > 0) { withdrawGold(db, currentUserUid, val); el.value = ""; } }

    if (targetId === 'btn-attack-dungeon') attackMonster(db, currentUserUid, document.getElementById('dungeon-select').value, currentPlayerStats);
    if (targetId === 'btn-create-party') createOrJoinParty(db, document.getElementById('fb-select').value, currentPlayerStats);

    if (targetId === 'btn-take-quest') assignRandomQuests(db, currentUserUid);
    if (targetId === 'btn-claim-daily') claimQuestReward(db, currentUserUid, 'daily');
    if (targetId === 'btn-claim-bounty') claimQuestReward(db, currentUserUid, 'bounty');

});

// GLOBAL WINDOW ROUTERS ASYNC
window.handleInventoryClick = async function(itemName) {
    if (inventoryMode === "EQUIP") {
        if (itemName === "Tiket Ganti Nama") { 
            const inputName = await window.rpgPrompt("Masukkan Nama Karakter Baru:", "Ganti Nama"); 
            if (inputName && inputName.trim() !== "") equipFromInventory(db, currentUserUid, itemName, inputName); 
        } 
        else if (itemName === "Tiket Ubah Job") { 
            const inputJob = await window.rpgPrompt("Pilih Job Baru (Ketik: Warrior atau Mage):", "Ganti Job"); 
            if (inputJob === "Warrior" || inputJob === "Mage") equipFromInventory(db, currentUserUid, itemName, inputJob); 
            else if (inputJob) window.rpgAlert("Job tidak valid! Harus 'Warrior' atau 'Mage'.");
        } 
        else if (itemName === "Buku Reset Stats") { 
            if(await window.rpgConfirm("Gunakan Buku Reset Stats? Semua alokasi manual akan dikembalikan.", "Reset Stats")) equipFromInventory(db, currentUserUid, itemName, null); 
        }
        else { equipFromInventory(db, currentUserUid, itemName, null); }
    } 
    else if (inventoryMode === "SELL") { sellItemToNPC(db, currentUserUid, itemName); } 
    else if (inventoryMode === "BANK") { depositItem(db, currentUserUid, itemName); }
    else if (inventoryMode === "AUCTION") {
        if (itemName.includes("Tiket") || itemName.includes("Buku") || itemName.includes("Ramuan Stamina") || itemName.includes("Naga Terbang")) return window.rpgAlert("Item premium tidak bisa dilelang.");
        const priceStr = await window.rpgPrompt(`Masukkan Harga Beli Langsung (Gold) untuk 1x [${itemName}]:`, "Jual ke Lelang", "number");
        const price = parseInt(priceStr);
        if (price > 0) listAuctionItem(db, currentUserUid, itemName, price, playerUsername);
    }
    else if (inventoryMode === "DISMANTLE") {
        if (DISMANTLE_CONFIG[itemName]) {
            if (await window.rpgConfirm(`🔥 Yakin ingin MELEBUR [${itemName}]?\nItem akan hancur menjadi material crafting.`, "Peleburan Item")) {
                dismantleItemAction(db, currentUserUid, itemName);
            }
        } else {
            window.rpgAlert(`❌ [${itemName}] tidak bisa dilebur!`);
        }
    }
    else if (inventoryMode === "BLACKSMITH") {
        const baseName = itemName.replace(/\s\[\+\d+\]$/, '');
        const itemInfo = ITEM_DB[baseName];
        
        if (!itemInfo) return window.rpgAlert("Item tidak dikenali sistem.");

        const realIconHTML = getIconHTML(baseName);

        if (itemInfo.type === 'weapon' || itemInfo.type === 'armor' || itemInfo.type === 'accessory') {
            bsSelectedEquip = itemName; 
            document.getElementById('bs-icon-equip').innerHTML = realIconHTML;
            document.getElementById('bs-text-equip').innerText = itemName;
            document.getElementById('bs-text-equip').style.color = "#00d2ff";
            
            const mCost = itemInfo.type === 'weapon' ? 2 : 1;
            document.getElementById('bs-info-cost').innerText = `Biaya: ${mCost}x Mirage Stone & 1,000 Gold`;
        } 
        else if (itemInfo.type === 'catalyst') {
            if (itemName === "Mirage Stone") return window.rpgAlert("Mirage Stone digunakan otomatis. Pilih batu tambahan atau biarkan kosong!");
            bsSelectedCatalyst = itemName;
            document.getElementById('bs-icon-catalyst').innerHTML = realIconHTML;
            document.getElementById('bs-text-catalyst').innerText = itemName;
            document.getElementById('bs-text-catalyst').style.color = "#ffcc00";
        } 
        else {
            window.rpgAlert("❌ Hanya bisa memasukkan Equip atau Batu Catalyst ke slot tungku!");
        }
    }
};

window.handleBankClick = function(itemName) { withdrawItem(db, currentUserUid, itemName); };
window.claimMail = function(mailId) { claimMailReward(db, currentUserUid, mailId); };
window.deleteMail = async function(mailId) { if (await window.rpgConfirm("Yakin ingin menghapus surat ini?", "Hapus Surat")) deleteMail(db, currentUserUid, mailId); };
window.buyFromAuction = async function(id, name, price, sellerId) { if (await window.rpgConfirm(`Beli Langsung ${name} seharga ${price} Gold?`, "Pasar Lelang")) buyAuctionItem(db, currentUserUid, id, name, price, sellerId); };
window.cancelAuction = async function(id) { if (await window.rpgConfirm("Tarik barang dari pasar?", "Batal Lelang")) cancelAuction(db, currentUserUid, id); };

window.placeBid = async function(id, name, currentBid) {
    const minBid = currentBid > 0 ? currentBid + 10 : 10;
    const bidStr = await window.rpgPrompt(`Masukkan tawaran (Bid) untuk ${name}\n(Minimal: ${minBid} Gold):`, "Tawar Lelang", "number");
    const bidAmt = parseInt(bidStr);
    if (bidAmt >= minBid) { placeBid(db, currentUserUid, playerUsername, id, bidAmt); } else if (bidStr) { window.rpgAlert(`Tawaran terlalu rendah! Minimal tawaran adalah ${minBid} Gold.`); }
};
window.actionBid = async function(id, action) {
    if (action === 'accept' && await window.rpgConfirm("Terima tawaran ini?", "Terima Tawaran")) acceptBid(db, currentUserUid, id);
    if (action === 'reject' && await window.rpgConfirm("Tolak tawaran ini?", "Tolak Tawaran")) rejectBid(db, currentUserUid, id);
};

window.addStat = function(statName) { addCharacterStat(db, currentUserUid, statName); };
window.leaveParty = function(partyId) { leaveParty(db, partyId, currentUserUid); };
window.startFb = function(partyId) { startFbBattle(db, currentUserUid, partyId); };
window.joinGuildAction = async function(guildId) { if (await window.rpgConfirm("Bergabung dengan Guild ini?", "Gabung Guild")) joinGuild(db, currentUserUid, currentPlayerStats, guildId); };
window.kickMemberAction = async function(targetUid) { if (await window.rpgConfirm("Keluarkan anggota ini dari Guild?", "Keluarkan Anggota")) kickMember(db, currentUserUid, currentPlayerStats.guildId, targetUid); };
window.actionCraftItem = async function(recipeName) {
    if(await window.rpgConfirm(`Siap menempa [${recipeName}]?\nSemua material dan Gold yang disyaratkan akan dikonsumsi.`, "Crafting")) {
        craftItemAction(db, currentUserUid, recipeName);
    }
};

window.bukaPanelKhusus = function(panelId) {
    const panels = ['panel-bank', 'panel-auction', 'panel-blacksmith', 'panel-crafting'];
    const targetPanel = document.getElementById(panelId);
    
    if (targetPanel && targetPanel.style.display === 'block') {
        targetPanel.style.display = 'none';
        return;
    }

    panels.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.style.display = 'none';
    });

    if (targetPanel) {
        targetPanel.style.display = 'block';
        targetPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
};

window.togglePanel = function(panelId) {
    const el = document.getElementById(panelId);
    if (el) {
        el.style.display = el.style.display === 'none' ? 'block' : 'none';
        if (el.style.display === 'block') el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
};

window.addBlacksmithLog = function(msg, color) {
    const logPanel = document.getElementById('bs-log-panel');
    if (logPanel) {
        const time = new Date().toLocaleTimeString('id-ID', { hour12: false });
        logPanel.innerHTML += `<div style="color: ${color}; margin-bottom: 3px;">[${time}] ${msg}</div>`;
        logPanel.scrollTop = logPanel.scrollHeight;
    }
};

let isForging = false;

window.executeTempa = async function() {
    if (!bsSelectedEquip) {
        window.addBlacksmithLog("[ERROR] Pilih Equipment terlebih dahulu dari Tas!", "#dc3545");
        return; 
    }
    
    if (isForging) return; 
    isForging = true;
    
    const btnTempa = document.querySelector('button[onclick="window.executeTempa()"]');
    if (btnTempa) {
        btnTempa.innerText = "⏳ MENEMPA...";
        btnTempa.style.background = "#555";
        btnTempa.style.cursor = "not-allowed";
    }

    await executeRefineAction(db, currentUserUid, bsSelectedEquip, bsSelectedCatalyst);

    if (btnTempa) {
        btnTempa.innerText = "⚒️ TEMPA";
        btnTempa.style.background = "#28a745";
        btnTempa.style.cursor = "pointer";
    }
    
    isForging = false;
};

window.resetEquip = function() {
    bsSelectedEquip = null;
    const elIcon = document.getElementById('bs-icon-equip');
    const elText = document.getElementById('bs-text-equip');
    if (elIcon) elIcon.innerHTML = "🛡️";
    if (elText) { elText.innerText = "Pilih Equip"; elText.style.color = "#aaa"; }
    
    const costText = document.getElementById('bs-info-cost');
    if (costText) costText.innerText = "Silakan pilih Equipment.";
    
    window.addBlacksmithLog("[SISTEM] Equipment dikeluarkan dari tungku.", "#aaa");
};

window.resetCatalyst = function() {
    bsSelectedCatalyst = "Tanpa Batu Tambahan";
    const elIcon = document.getElementById('bs-icon-catalyst');
    const elText = document.getElementById('bs-text-catalyst');
    if (elIcon) elIcon.innerHTML = "💎";
    if (elText) { elText.innerText = "Tanpa Batu"; elText.style.color = "#aaa"; }
    
    window.addBlacksmithLog("[SISTEM] Batu katalis dikosongkan.", "#aaa");
};

window.actionUnequip = function(slotType) {
    unequipItem(db, currentUserUid, slotType);
};

window.activateBlacksmithMode = function() {
    inventoryMode = "BLACKSMITH"; 
    
    ['btn-mode-equip', 'btn-mode-sell', 'btn-mode-bank', 'btn-mode-auction', 'btn-mode-dismantle', 'btn-mode-blacksmith', 'btn-mode-crafting'].forEach(id => { 
        const el = document.getElementById(id); 
        if (el) { 
            el.className = ""; 
            if (id !== 'btn-mode-equip') el.style.backgroundColor = "#495057"; 
        }
    }); 
    
    const btnEnchant = document.getElementById('btn-mode-blacksmith');
    if (btnEnchant) btnEnchant.style.backgroundColor = "#ff9800";
    
    if (typeof window.bukaPanelKhusus === "function") {
        window.bukaPanelKhusus('panel-blacksmith');
    } else {
        window.rpgAlert("Sistem gagal menemukan panel tungku!");
    }
};

// MENGUBAH EVENT LISTENER INI AGAR ASYNC AWAIT BERJALAN LANCAR
document.addEventListener('click', async function(e) {
    if (e.target && e.target.id === 'btn-create-char') {
        const charNameInput = document.getElementById('char-name-input');
        const classRadio = document.querySelector('input[name="char-class"]:checked');
        
        if (!charNameInput || !charNameInput.value.trim()) {
            return window.rpgAlert("❌ Nama karakter tidak boleh kosong!");
        }
        if (!classRadio) {
            return window.rpgAlert("❌ Silakan pilih Class/Job karakter Anda!");
        }

        const charName = charNameInput.value.trim();
        const charClass = classRadio.value;

        try {
            e.target.innerText = "⏳ MENEMPA TAKDIR...";
            e.target.style.background = "#555";
            e.target.disabled = true;

            await selectCharacterClass(db, currentUserUid, charClass);

            const userRef = doc(db, "users", currentUserUid);
            await updateDoc(userRef, { username: charName });

            const screenChar = document.getElementById('screen-char-select');
            const screenGame = document.getElementById('screen-game');
            
            if (screenChar) screenChar.style.display = 'none';
            if (screenGame) screenGame.style.display = 'block';

        } catch (error) {
            window.rpgAlert("Gagal membuat karakter: " + error.message);
            e.target.innerText = "🔥 Mulai Petualangan 🔥";
            e.target.style.background = "#ff9800";
            e.target.disabled = false;
        }
    }
});

document.addEventListener('change', function(e) {
    if (e.target && e.target.name === 'char-class') {
        document.querySelectorAll('input[name="char-class"]').forEach(radio => {
            radio.parentElement.style.borderColor = "#3f3f52";
            radio.parentElement.style.background = "#121216";
        });
        
        if (e.target.value === 'Warrior') {
            e.target.parentElement.style.borderColor = "#dc3545";
            e.target.parentElement.style.background = "#1c152a";
        } else if (e.target.value === 'Mage') {
            e.target.parentElement.style.borderColor = "#00d2ff";
            e.target.parentElement.style.background = "#15201b";
        }
    }
});

// ==========================================
// SISTEM MODAL PEMBELIAN TOKO & MALL
// ==========================================
let currentBuyItem = null;
let currentBuyPrice = 0;
let currentBuyCurrency = 'Gold';

window.openBuyModal = function(itemName, price, currency) {
    currentBuyItem = itemName;
    currentBuyPrice = price;
    currentBuyCurrency = currency;
    
    const modal = document.getElementById('buy-modal');
    if (!modal) return window.rpgAlert("Error: HTML Modal Pembelian belum terpasang!");
    
    document.getElementById('buy-modal-title').innerText = `Beli [${itemName}]`;
    document.getElementById('buy-modal-qty').value = 1;
    document.getElementById('buy-modal-currency').innerText = currency;
    document.getElementById('buy-modal-currency').style.color = currency === 'Coin' ? '#ffcc00' : '#e0a800';
    
    const iconContainer = document.getElementById('buy-modal-icon');
    if (iconContainer && typeof getIconHTML === 'function') {
        iconContainer.innerHTML = getIconHTML(itemName);
    }
    
    updateModalTotal();
    modal.style.display = 'flex';
};

function updateModalTotal() {
    const qty = parseInt(document.getElementById('buy-modal-qty').value) || 1;
    document.getElementById('buy-modal-total').innerText = (currentBuyPrice * qty).toLocaleString();
}

document.addEventListener('input', (e) => {
    if (e.target.id === 'buy-modal-qty') {
        let val = parseInt(e.target.value);
        if (val < 1) e.target.value = 1;
        if (val > 999) e.target.value = 999; 
        updateModalTotal();
    }
});

document.addEventListener('click', async (e) => {
    if (e.target.id === 'btn-cancel-buy') {
        document.getElementById('buy-modal').style.display = 'none';
    }
    
    if (e.target.id === 'btn-confirm-buy') {
        const qty = parseInt(document.getElementById('buy-modal-qty').value) || 1;
        const btn = document.getElementById('btn-confirm-buy');
        
        btn.disabled = true;
        btn.innerText = "⏳ PROSES...";
        btn.style.background = "#555";
        
        try {
            const userRef = doc(db, "users", currentUserUid);
            const totalCost = currentBuyPrice * qty;
            
            await runTransaction(db, async (ts) => {
                const snap = await ts.get(userRef);
                if (!snap.exists()) throw "User tidak ditemukan.";
                const data = snap.data();
                let updates = {};
                
                if (currentBuyCurrency === 'Gold') {
                    if ((data.gold || 0) < totalCost) throw `Gold tidak cukup! Butuh ${totalCost.toLocaleString()} Gold.`;
                    updates.gold = data.gold - totalCost;
                } else if (currentBuyCurrency === 'Coin') {
                    if ((data.coin || 0) < totalCost) throw `Coin Premium tidak cukup! Butuh ${totalCost.toLocaleString()} Coin.`;
                    updates.coin = data.coin - totalCost;
                }

                let inv = data.inventory || {};
                inv[currentBuyItem] = (inv[currentBuyItem] || 0) + qty;
                updates.inventory = inv;
                
                ts.update(userRef, updates);
            });
            
            document.getElementById('buy-modal').style.display = 'none';
            
        } catch (err) {
            window.rpgAlert("❌ " + err);
        } finally {
            btn.disabled = false;
            btn.innerText = "BELI";
            btn.style.background = "#28a745";
        }
    }
});

// ==========================================
// SISTEM GLOBAL LEADERBOARD & KALKULASI BP
// ==========================================
window.fetchLeaderboard = async function(type) {
    const lbContent = document.getElementById('leaderboard-content');
    if (!lbContent) return;
    
    lbContent.innerHTML = '<div style="text-align:center; color:#aaa; margin-top:20px;">⏳ Memindai data seluruh pemain...</div>';
    
    try {
        const usersRef = collection(db, "users");
        const snap = await getDocs(usersRef); // Unduh data pemain (bisa dioptimalkan di masa depan)
        let usersData = [];
        
        snap.forEach(docSnap => {
            const d = docSnap.data();
            // Hanya masukkan pemain yang sudah membuat karakter (punya username)
            if (d.username) {
                // RUMUS BATTLE POWER (BP): (Level x 50) + (Semua Status x 10) + (1/5 HP Maksimal)
                let calculatedBP = (d.level || 1) * 50 + 
                                   (d.str || 0) * 10 + 
                                   (d.con || 0) * 10 + 
                                   (d.dex || 0) * 10 + 
                                   (d.int || 0) * 10 + 
                                   Math.floor((d.maxHp || 0) / 5);
                         
                usersData.push({
                    name: d.username,
                    level: d.level || 1,
                    gold: d.gold || 0,
                    class: d.characterClass || '-',
                    bp: calculatedBP
                });
            }
        });

        // Urutkan data berdasarkan tombol yang diklik
        if (type === 'level') usersData.sort((a, b) => b.level - a.level);
        if (type === 'gold') usersData.sort((a, b) => b.gold - a.gold);
        if (type === 'bp') usersData.sort((a, b) => b.bp - a.bp);

        // Render HTML Tabel Leaderboard
        let html = '<table style="width:100%; border-collapse:collapse; font-size:12px; text-align:center;">';
        html += '<tr style="background:#222; color:#fff; border-bottom:2px solid #555;">';
        html += '<th style="padding:8px 5px;">Rank</th><th style="padding:8px 5px; text-align:left;">Nama</th><th style="padding:8px 5px;">Class</th><th style="padding:8px 5px;">Nilai</th></tr>';
        
        // Ambil maksimal Top 10
        for (let i = 0; i < Math.min(10, usersData.length); i++) {
            const u = usersData[i];
            let valStr = "";
            let valColor = "#fff";
            
            // Format angka dan ikon berdasar kategori
            if (type === 'level') { valStr = `Lv. ${u.level}`; valColor = '#00d2ff'; }
            if (type === 'gold') { valStr = `💰 ${u.gold.toLocaleString()}`; valColor = '#ffcc00'; }
            if (type === 'bp') { valStr = `⚔️ ${u.bp.toLocaleString()}`; valColor = '#dc3545'; }
            
            // Dekorasi Medali Top 3
            let rankColor = '#aaa'; 
            let rankIcon = `#${i+1}`;
            if (i === 0) { rankColor = '#ffcc00'; rankIcon = '🥇 1'; }
            else if (i === 1) { rankColor = '#c0c0c0'; rankIcon = '🥈 2'; }
            else if (i === 2) { rankColor = '#cd7f32'; rankIcon = '🥉 3'; }
            
            html += `<tr style="border-bottom:1px solid #333; background: ${i % 2 === 0 ? '#1a1a24' : '#121216'}; transition:0.2s;">
                <td style="padding:8px 5px; color:${rankColor}; font-weight:bold; font-size:14px;">${rankIcon}</td>
                <td style="padding:8px 5px; color:#fff; font-weight:bold; text-align:left;">${escapeHTML(u.name)}</td>
                <td style="padding:8px 5px; color:#aaa;">${u.class}</td>
                <td style="padding:8px 5px; color:${valColor}; font-weight:bold;">${valStr}</td>
            </tr>`;
        }
        html += '</table>';
        lbContent.innerHTML = html;

    } catch (err) {
        lbContent.innerHTML = `<div style="text-align:center; color:#dc3545; margin-top:20px;">Gagal memuat: ${err.message}</div>`;
    }
};

// ==========================================
// SISTEM DARK FOREST (ZONA PK & LOOT DROP)
// ==========================================

// 1. LIVE TRACKER UNTUK RADAR ZONA PK
const qPk = query(collection(db, "users"), where("inPkZone", "==", true));
onSnapshot(qPk, (snap) => {
    let pkPlayers = [];
    snap.forEach(docSnap => {
        if(docSnap.data().currentHp > 0) { // Hanya lacak yang masih hidup
            pkPlayers.push({ id: docSnap.id, ...docSnap.data() });
        }
    });
    
    if (typeof renderPKUI === 'function') renderPKUI(pkPlayers, currentUserUid);
    
    // Atur tombol masuk/keluar secara dinamis
    const myPkData = pkPlayers.find(p => p.id === currentUserUid);
    const btnEnter = document.getElementById('btn-enter-pk');
    const btnLeave = document.getElementById('btn-leave-pk');
    if (myPkData) {
        if (btnEnter) btnEnter.style.display = 'none';
        if (btnLeave) btnLeave.style.display = 'inline-block';
    } else {
        if (btnEnter) btnEnter.style.display = 'inline-block';
        if (btnLeave) btnLeave.style.display = 'none';
    }
});

// 2. KONTROL TOMBOL NAVIGASI & MASUK ZONA
document.addEventListener('click', async (e) => {
    const targetId = e.target.id;
    if (!targetId) return;

    if (targetId === 'btn-toggle-pk') window.togglePanel('panel-pk');
    
    if (targetId === 'btn-enter-pk') {
        if (currentPlayerStats.currentHp <= 0) return window.rpgAlert("Anda sudah mati! Sembuhkan diri di kota.");
        if ((currentPlayerStats.level || 1) < 30) {
            return window.rpgAlert("Hutan ini terlalu berdarah untuk pemula!\nAnda harus mencapai Level 30 untuk memasukinya.", "Akses Ditolak");
        }
        if (await window.rpgConfirm("Nyawa dan harta menjadi taruhan di sini. Masuk Dark Forest?", "Gerbang Hutan")) {
            updateDoc(doc(db, "users", currentUserUid), { inPkZone: true });
        }
    }
    if (targetId === 'btn-leave-pk') {
        updateDoc(doc(db, "users", currentUserUid), { inPkZone: false });
        window.rpgAlert("Anda berhasil lari ke Safe Zone.", "Aman");
    }
});

// 3. LOGIKA PERTARUNGAN (BATTLE TRANSACTION)
window.attackPK = async function(targetUid, targetName) {
    if (currentPlayerStats.currentHp <= 0) return window.rpgAlert("Hantu tidak bisa menyerang!");
    if (!await window.rpgConfirm(`Bantai ${targetName} sekarang?`, "Target Dikunci")) return;

    try {
        const targetRef = doc(db, "users", targetUid);
        const myRef = doc(db, "users", currentUserUid);

        const result = await runTransaction(db, async (ts) => {
            const mySnap = await ts.get(myRef);
            const targetSnap = await ts.get(targetRef);

            if (!mySnap.exists() || !targetSnap.exists()) throw "Target menghilang tertelan kabut.";
            const me = mySnap.data();
            const enemy = targetSnap.data();

            if (!enemy.inPkZone || enemy.currentHp <= 0) throw "Target sudah kabur ke kota atau sudah mati.";
            if (me.currentHp <= 0) throw "Anda mati kehabisan darah sebelum menyerang!";

            // Kalkulasi Kekuatan Dasar (BP)
            let myBP = (me.level || 1)*50 + (me.str || 0)*10 + (me.dex || 0)*10 + (me.con || 0)*10 + (me.int || 0)*10;
            let enemyBP = (enemy.level || 1)*50 + (enemy.str || 0)*10 + (enemy.dex || 0)*10 + (enemy.con || 0)*10 + (enemy.int || 0)*10;

            // Tambahkan elemen kejutan (RNG ±10%) agar menegangkan
            myBP *= (0.9 + Math.random() * 0.2);
            enemyBP *= (0.9 + Math.random() * 0.2);

            let logMsg = "";
            const safeItems = ["Tiket Ganti Nama", "Buku Reset Stats", "Tiket Ubah Job", "Ramuan Stamina", "Naga Terbang"]; // Item Kebal Drop

            if (myBP >= enemyBP) {
                // --- AKU MENANG ---
                let goldStolen = Math.floor((enemy.gold || 0) * 0.05); // Curi 5% Gold pasti
                let enemyInv = enemy.inventory || {};
                let myInv = me.inventory || {};
                let stolenItem = null;

                // Penentuan Drop Item (Red Name = 20%, Normal = 5%)
                let dropRate = ((enemy.pkKills || 0) >= 3) ? 0.20 : 0.05;

                if (Math.random() <= dropRate) {
                    let possibleItems = Object.keys(enemyInv).filter(i => enemyInv[i] > 0 && !safeItems.includes(i));
                    if (possibleItems.length > 0) {
                        stolenItem = possibleItems[Math.floor(Math.random() * possibleItems.length)];
                        enemyInv[stolenItem] -= 1;
                        if (enemyInv[stolenItem] <= 0) delete enemyInv[stolenItem];
                        myInv[stolenItem] = (myInv[stolenItem] || 0) + 1;
                    }
                }

                // Terapkan derita pada musuh
                ts.update(targetRef, { 
                    currentHp: 0, 
                    gold: Math.max(0, (enemy.gold || 0) - goldStolen),
                    inventory: enemyInv,
                    inPkZone: false // Terpental kembali ke kota
                });

                // Terapkan kejayaan padaku
                ts.update(myRef, {
                    gold: (me.gold || 0) + goldStolen,
                    inventory: myInv,
                    pkKills: (me.pkKills || 0) + 1 // Karma Name bertambah
                });

                // 📬 KIRIM SURAT DUKA KE MUSUH (OFFLINE/ONLINE)
                const enemyMailRef = doc(collection(db, "users", targetUid, "mail"));
                ts.set(enemyMailRef, {
                    title: "☠️ Terbunuh di Dark Forest!",
                    message: `Anda telah dibantai oleh [${me.username}] di Zona PK!\n\nKehilangan: ${goldStolen.toLocaleString()} Gold.` + (stolenItem ? `\nBarang dirampas: 1x ${stolenItem}` : ""),
                    date: new Date().toLocaleString('id-ID'),
                    timestamp: Date.now()
                });

                logMsg = `🔥 KEMENANGAN!\nAnda membantai ${targetName}.\nMencuri 💰 ${goldStolen.toLocaleString()} Gold.` + (stolenItem ? `\n\n🎁 DROP: Anda mendapat [${stolenItem}] dari mayatnya!` : "");
                return { success: true, log: logMsg };

            } else {
                // --- MUSUH MENANG (AKU MATI) ---
                let goldLost = Math.floor((me.gold || 0) * 0.05);
                let myInv = me.inventory || {};
                let enemyInv = enemy.inventory || {};
                let lostItem = null;

                let dropRate = ((me.pkKills || 0) >= 3) ? 0.20 : 0.05;

                if (Math.random() <= dropRate) {
                    let possibleItems = Object.keys(myInv).filter(i => myInv[i] > 0 && !safeItems.includes(i));
                    if (possibleItems.length > 0) {
                        lostItem = possibleItems[Math.floor(Math.random() * possibleItems.length)];
                        myInv[lostItem] -= 1;
                        if (myInv[lostItem] <= 0) delete myInv[lostItem];
                        enemyInv[lostItem] = (enemyInv[lostItem] || 0) + 1;
                    }
                }

                ts.update(myRef, { 
                    currentHp: 0, 
                    gold: Math.max(0, (me.gold || 0) - goldLost),
                    inventory: myInv,
                    inPkZone: false // Saya terpental ke kota
                });

                ts.update(targetRef, {
                    gold: (enemy.gold || 0) + goldLost,
                    inventory: enemyInv,
                    pkKills: (enemy.pkKills || 0) + 1
                });

                // 📬 KIRIM SURAT KEMENANGAN KE MUSUH (Karena dia diserang saat Offline namun menang)
                const enemyMailRef = doc(collection(db, "users", targetUid, "mail"));
                ts.set(enemyMailRef, {
                    title: "🛡️ Pertahanan PK Berhasil!",
                    message: `[${me.username}] mencoba menyerang Anda di Dark Forest, namun tewas oleh pertahanan Anda!\n\nAnda menjarah: ${goldLost.toLocaleString()} Gold.` + (lostItem ? `\nBarang dijarah: 1x ${lostItem}` : ""),
                    date: new Date().toLocaleString('id-ID'),
                    timestamp: Date.now()
                });

                logMsg = `💀 KEKALAHAN!\nAnda dibunuh oleh ${targetName}.\nKehilangan 💰 ${goldLost.toLocaleString()} Gold.` + (lostItem ? `\n\n🚨 RAMPASAN: [${lostItem}] Anda terlempar dan diambil musuh!` : "");
                return { success: false, log: logMsg };
            }
        });

        // Tampilkan Modal Peringatan Utama
        window.rpgAlert(result.log, result.success ? "🏆 PK BERHASIL" : "💀 TRAGEDI");
        
        // CATAT KE DALAM LOG BERDARAH DI PANEL PK!
        window.addPKLog(result.log, result.success ? "#28a745" : "#dc3545");

    } catch(err) {
        window.rpgAlert(err, "Pertarungan Batal");
        window.addPKLog(`Batal menyerang: ${err}`, "#aaa"); // Catat juga jika gagal
    }
};

window.deleteAllMails = async function() {
    if (!await window.rpgConfirm("Hapus semua surat?\n(Surat yang berisi Lampiran/Hadiah yang belum diklaim TIDAK akan dihapus).", "Bersihkan Kotak Surat")) return;

    try {
        const mailRef = collection(db, "users", currentUserUid, "mail");
        const snap = await getDocs(mailRef);
        
        const batch = writeBatch(db);
        let deletedCount = 0;

        snap.forEach(docSnap => {
            const data = docSnap.data();
            
            // PENYESUAIAN PENTING: Mengecek variabel 'attachments' sesuai dengan skrip Anda
            const hasUnclaimedAttachment = data.attachments && data.isClaimed !== true;
            
            // Jika tidak ada attachment ATAU attachment sudah di-claim, maka surat boleh dihapus
            if (!hasUnclaimedAttachment) {
                batch.delete(docSnap.ref);
                deletedCount++;
            }
        });

        if (deletedCount > 0) {
            await batch.commit();
            window.rpgAlert(`🧹 ${deletedCount} surat berhasil dibersihkan!`, "Sukses");
        } else {
            window.rpgAlert("Tidak ada surat yang bisa dihapus. (Pastikan Anda sudah mengambil/mengklaim semua lampiran hadiah terlebih dahulu).", "Kotak Bersih");
        }

    } catch (err) {
        window.rpgAlert(`Gagal membersihkan kotak surat: ${err.message}`, "Sistem Error");
    }
};