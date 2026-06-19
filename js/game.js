import { db, auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, getDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// IMPORT MODULES UI
import { loadUIComponents } from './ui-loader.js';

// ---> TAMBAHKAN BARIS INI DI SINI <---
loadUIComponents(); 

import { 
    renderPlayerUI, renderQuestUI, renderInventoryUI, renderBankUI, 
    renderMailboxUI, renderAuctionUI, renderPartyUI, renderGuildUI, renderChatUI, escapeHTML, renderCraftingUI 
} from './modules/ui-renderer.js';

// IMPORT MODULES SISTEM
import { selectCharacterClass, addCharacterStat, startStaminaRegeneration } from './modules/character.js';
import { equipFromInventory, sellItemToNPC, unequipItem } from './modules/inventory.js';
import { attackMonster } from './modules/battle.js'; 
import { buyEquipment } from './modules/shop.js';
import { listenToChat, sendChat } from './modules/chat.js';
import { buyPotion } from './modules/apothecary.js';
import { buyMallItem } from './modules/mall.js'; 
import { depositGold, withdrawGold, depositItem, withdrawItem } from './modules/bank.js';
import { listenToAuction, listAuctionItem, buyAuctionItem, placeBid, acceptBid, rejectBid, cancelAuction } from './modules/auction.js';
import { listenToParties, createOrJoinParty, leaveParty, startFbBattle } from './modules/party.js';
import { assignRandomQuests, claimQuestReward } from './modules/quest.js';
import { listenToGuilds, createGuild, joinGuild, leaveGuild as dbLeaveGuild, donateGold, upgradeGuild, updateMotd, kickMember, disbandGuild } from './modules/guild.js';
import { listenToMailbox, claimMailReward, deleteMail } from './modules/mailbox.js';
import { dismantleItemAction, DISMANTLE_CONFIG, craftItemAction } from './modules/crafting.js';
import { ITEM_DB } from './data/items.js';
import { executeRefineAction } from './modules/blacksmith.js';

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
        
        // Memuat HTML Panel Eksternal terlebih dahulu
        await loadUIComponents();
        
        const docSnap = await getDoc(doc(db, "users", currentUserUid));
        if (!docSnap.exists() || !docSnap.data().characterClass) {
            showScreen('screen-char-select');
        } else {
            showScreen('screen-game');
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
    
    // 1. Sinkronisasi Guild
    const unsubGuilds = listenToGuilds(db, (guildsData, upgradesData) => {
        globalGuilds = guildsData;
        guildUpgradesMap = upgradesData;
        renderGuildUI(currentPlayerStats, globalGuilds, guildUpgradesMap); 
    });

    // 2. Sinkronisasi User Data
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

    // 3. Sinkronisasi Kotak Surat
    const unsubMail = listenToMailbox(db, currentUserUid, (mails) => {
        renderMailboxUI(mails);
    });

    // 4. Sinkronisasi Pasar Lelang
    const unsubAuction = listenToAuction(db, (items) => {
        renderAuctionUI(items, currentUserUid);
    });

    // 5. Sinkronisasi Party
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

// BINDING EVENT DELEGATION
document.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'chat-channel-select') {
        const val = e.target.value;
        if (val === 'guild' && !currentPlayerStats.guildId) {
            alert("Anda belum bergabung dengan Guild!");
            e.target.value = currentChatChannel; return;
        }
        if (val === 'party' && !currentPartyId) {
            alert("Anda belum masuk ke dalam Ruang Tunggu Party FB!");
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

// ROUTING KLIK TOMBOL GLOBAL (EVENT DELEGATION)
document.addEventListener('click', (e) => {
    // Cari tombol terdekat yang diklik
    const target = e.target.closest('button') || e.target.closest('.char-card') || e.target;
    const targetId = target.id;

    if (!targetId) return;

    // --- KONTROL UMUM & AUTENTIKASI ---
    if (targetId === 'btn-admin-panel') window.location.href = './admin/index.html';
    if (targetId === 'btn-copy-uid') { if (currentUserUid) { navigator.clipboard.writeText(currentUserUid); alert("📋 UID disalin!"); } }
    
    // --- PEMILIHAN KELAS ---
    if (targetId === 'class-warrior') selectCharacterClass(db, currentUserUid, 'Warrior', () => showScreen('screen-game'));
    if (targetId === 'class-mage') selectCharacterClass(db, currentUserUid, 'Mage', () => showScreen('screen-game'));

    // --- MODE INVENTORY ---
    if (targetId === 'btn-mode-equip') { inventoryMode = "EQUIP"; clearActiveModeClasses(); target.className = "mode-active"; }
    if (targetId === 'btn-mode-sell') { inventoryMode = "SELL"; clearActiveModeClasses(); target.className = "mode-sell-active"; }
    if (targetId === 'btn-mode-dismantle') { inventoryMode = "DISMANTLE"; clearActiveModeClasses(); target.style.backgroundColor = "#dc3545"; }
    
    // Mode Khusus dengan Panel Cerdas
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

    // --- KONTROL CHAT ---
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

    // --- KONTROL GUILD ---
    if (targetId === 'btn-create-guild') { const name = document.getElementById('input-guild-name').value; if (confirm(`Dirikan Guild [${name}] seharga 100,000 Gold?`)) createGuild(db, currentUserUid, currentPlayerStats, name); }
    if (targetId === 'btn-leave-guild') { if (confirm("Yakin ingin keluar dari Guild? Anda akan kehilangan semua Buff Guild!")) dbLeaveGuild(db, currentUserUid, currentPlayerStats.guildId); }
    if (targetId === 'btn-donate-guild') { const amt = parseInt(document.getElementById('input-donate-gold').value); if (amt > 0) { donateGold(db, currentUserUid, currentPlayerStats.guildId, amt); document.getElementById('input-donate-gold').value = ""; } }
    if (targetId === 'btn-upgrade-guild') { if (confirm("Gunakan Dana Guild untuk naik level?")) upgradeGuild(db, currentUserUid, currentPlayerStats.guildId); }
    if (targetId === 'btn-edit-motd') { const txt = prompt("Masukkan pengumuman baru untuk anggota Guild:"); if (txt) updateMotd(db, currentUserUid, currentPlayerStats.guildId, txt); }
    if (targetId === 'btn-disband-guild') { if (confirm("PERINGATAN KERAS: Yakin membubarkan Guild selamanya? Dana Guild akan hangus!")) disbandGuild(db, currentUserUid, currentPlayerStats.guildId); }

    // --- KONTROL BANK ---
    if (targetId === 'btn-bank-deposit-gold') { const el = document.getElementById('bank-gold-input'); const val = parseInt(el.value); if (val > 0) { depositGold(db, currentUserUid, val); el.value = ""; } }
    if (targetId === 'btn-bank-withdraw-gold') { const el = document.getElementById('bank-gold-input'); const val = parseInt(el.value); if (val > 0) { withdrawGold(db, currentUserUid, val); el.value = ""; } }

    // --- KONTROL DUNGEON & PARTY ---
    if (targetId === 'btn-attack-dungeon') attackMonster(db, currentUserUid, document.getElementById('dungeon-select').value, currentPlayerStats);
    if (targetId === 'btn-create-party') createOrJoinParty(db, document.getElementById('fb-select').value, currentPlayerStats);

    // --- KONTROL MISI (QUEST) ---
    if (targetId === 'btn-take-quest') assignRandomQuests(db, currentUserUid);
    if (targetId === 'btn-claim-daily') claimQuestReward(db, currentUserUid, 'daily');
    if (targetId === 'btn-claim-bounty') claimQuestReward(db, currentUserUid, 'bounty');

    // --- KONTROL TOKO NPC ---
    if (targetId === 'btn-buy-sword') buyEquipment(db, currentUserUid, 'Pedang Besi');
    if (targetId === 'btn-buy-staff') buyEquipment(db, currentUserUid, 'Tongkat Sihir');
    if (targetId === 'btn-buy-armor') buyEquipment(db, currentUserUid, 'Zirah Kulit');
    if (targetId === 'btn-buy-ring') buyEquipment(db, currentUserUid, 'Cincin Akurat');
    if (targetId === 'btn-buy-horse') buyEquipment(db, currentUserUid, 'Kuda Coklat');
    if (targetId === 'btn-buy-bear') buyEquipment(db, currentUserUid, 'Beruang Kutub');
    if (targetId === 'btn-buy-hp') buyPotion(db, currentUserUid, 'HP');
    if (targetId === 'btn-buy-mp') buyPotion(db, currentUserUid, 'MP');

    // --- KONTROL ITEM MALL ---
    if (targetId === 'btn-mall-mirage') buyMallItem(db, currentUserUid, 'Mirage Stone', 5);
    if (targetId === 'btn-mall-heaven') buyMallItem(db, currentUserUid, 'Heaven Stone', 15);
    if (targetId === 'btn-mall-underworld') buyMallItem(db, currentUserUid, 'Underworld Stone', 15);
    if (targetId === 'btn-mall-universal') buyMallItem(db, currentUserUid, 'Universal Stone', 50);
    if (targetId === 'btn-mall-name') buyMallItem(db, currentUserUid, 'Tiket Ganti Nama', 50);
    if (targetId === 'btn-mall-job') buyMallItem(db, currentUserUid, 'Tiket Ubah Job', 100);
    if (targetId === 'btn-mall-stamina') buyMallItem(db, currentUserUid, 'Ramuan Stamina', 10);
    if (targetId === 'btn-mall-dragon') buyMallItem(db, currentUserUid, 'Naga Terbang', 200);
    if (targetId === 'btn-mall-reset') buyMallItem(db, currentUserUid, 'Buku Reset Stats', 100);
});

// GLOBAL WINDOW ROUTERS (UNTUK ITEM KLIK)
window.handleInventoryClick = function(itemName) {
    if (inventoryMode === "EQUIP") {
        if (itemName === "Tiket Ganti Nama") { const inputName = prompt("Masukkan Nama Karakter Baru:"); if (inputName && inputName.trim() !== "") equipFromInventory(db, currentUserUid, itemName, inputName); } 
        else if (itemName === "Tiket Ubah Job") { const inputJob = prompt("Pilih Job Baru (Ketik: Warrior atau Mage):"); if (inputJob === "Warrior" || inputJob === "Mage") equipFromInventory(db, currentUserUid, itemName, inputJob); } 
        else if (itemName === "Buku Reset Stats") { if(confirm("Gunakan Buku Reset Stats? Semua alokasi manual akan dikembalikan.")) equipFromInventory(db, currentUserUid, itemName, null); }
        else { equipFromInventory(db, currentUserUid, itemName, null); }
    } 
    else if (inventoryMode === "SELL") { sellItemToNPC(db, currentUserUid, itemName); } 
    else if (inventoryMode === "BANK") { depositItem(db, currentUserUid, itemName); }
    else if (inventoryMode === "AUCTION") {
        if (itemName.includes("Tiket") || itemName.includes("Buku") || itemName.includes("Ramuan Stamina") || itemName.includes("Naga Terbang")) return alert("Item premium tidak bisa dilelang.");
        const priceStr = prompt(`Masukkan Harga Beli Langsung (Gold) untuk 1x [${itemName}]:`);
        const price = parseInt(priceStr);
        if (price > 0) listAuctionItem(db, currentUserUid, itemName, price, playerUsername);
    }

    else if (inventoryMode === "DISMANTLE") {
        if (DISMANTLE_CONFIG[itemName]) {
            if (confirm(`🔥 Yakin ingin MELEBUR [${itemName}]?\nItem akan hancur menjadi material crafting.`)) {
                dismantleItemAction(db, currentUserUid, itemName);
            }
        } else {
            alert(`❌ [${itemName}] tidak bisa dilebur!`);
        }
    }

    else if (inventoryMode === "BLACKSMITH") {
        // Ekstrak nama asli (Contoh: Mengubah "Pedang Besi [+2]" menjadi "Pedang Besi")
        const baseName = itemName.replace(/\s\[\+\d+\]$/, '');
        const itemInfo = ITEM_DB[baseName];
        
        if (!itemInfo) return alert("Item tidak dikenali sistem.");

        // Ambil icon berdasarkan tipe (Bisa diganti dengan fungsi ikon asli Anda)
        let iconEmoji = "🛡️";
        if (itemInfo.type === 'weapon') iconEmoji = "🗡️";
        if (itemInfo.type === 'accessory') iconEmoji = "💍";
        if (itemInfo.type === 'catalyst') iconEmoji = "💎";

        if (itemInfo.type === 'weapon' || itemInfo.type === 'armor' || itemInfo.type === 'accessory') {
            bsSelectedEquip = itemName; // Menyimpan nama lengkap beserta [+X]
            document.getElementById('bs-icon-equip').innerText = iconEmoji;
            document.getElementById('bs-text-equip').innerText = itemName;
            document.getElementById('bs-text-equip').style.color = "#00d2ff";
            
            const mCost = itemInfo.type === 'weapon' ? 2 : 1;
            document.getElementById('bs-info-cost').innerText = `Biaya: ${mCost}x Mirage Stone & 1,000 Gold`;
        } 
        else if (itemInfo.type === 'catalyst') {
            if (itemName === "Mirage Stone") return alert("Mirage Stone digunakan otomatis. Pilih batu tambahan atau biarkan kosong!");
            bsSelectedCatalyst = itemName;
            document.getElementById('bs-icon-catalyst').innerText = iconEmoji;
            document.getElementById('bs-text-catalyst').innerText = itemName;
            document.getElementById('bs-text-catalyst').style.color = "#ffcc00";
        } 
        else {
            alert("❌ Hanya bisa memasukkan Equip atau Batu Catalyst ke slot tungku!");
        }
    }
};

window.handleBankClick = function(itemName) { withdrawItem(db, currentUserUid, itemName); };
window.claimReward = function(mailId) { claimMailReward(db, currentUserUid, mailId); };
window.deleteMailAction = function(mailId) { if (confirm("Hapus surat ini secara permanen?")) deleteMail(db, currentUserUid, mailId); };
window.buyFromAuction = function(id, name, price, sellerId) { if (confirm(`Beli Langsung ${name} seharga ${price} Gold?`)) buyAuctionItem(db, currentUserUid, id, name, price, sellerId); };
window.cancelAuction = function(id) { if (confirm("Tarik barang dari pasar?")) cancelAuction(db, currentUserUid, id); };

window.placeBid = function(id, name, currentBid) {
    const minBid = currentBid > 0 ? currentBid + 10 : 10;
    const bidStr = prompt(`Masukkan tawaran (Bid) untuk ${name}\n(Minimal: ${minBid} Gold):`);
    const bidAmt = parseInt(bidStr);
    if (bidAmt >= minBid) { placeBid(db, currentUserUid, playerUsername, id, bidAmt); } else if (bidStr) { alert(`Tawaran terlalu rendah! Minimal tawaran adalah ${minBid} Gold.`); }
};
window.actionBid = function(id, action) {
    if (action === 'accept' && confirm("Terima tawaran ini?")) acceptBid(db, currentUserUid, id);
    if (action === 'reject' && confirm("Tolak tawaran ini?")) rejectBid(db, currentUserUid, id);
};

window.addStat = function(statName) { addCharacterStat(db, currentUserUid, statName); };
window.leaveParty = function(partyId) { leaveParty(db, partyId, currentUserUid); };
window.startFb = function(partyId) { startFbBattle(db, currentUserUid, partyId); };
window.joinGuildAction = function(guildId) { if (confirm("Bergabung dengan Guild ini?")) joinGuild(db, currentUserUid, currentPlayerStats, guildId); };
window.kickMemberAction = function(targetUid) { if (confirm("Keluarkan anggota ini dari Guild?")) kickMember(db, currentUserUid, currentPlayerStats.guildId, targetUid); };
window.actionCraftItem = function(recipeName) {
    if(confirm(`Siap menempa [${recipeName}]?\nSemua material dan Gold yang disyaratkan akan dikonsumsi.`)) {
        craftItemAction(db, currentUserUid, recipeName);
    }
};

// --- FUNGSI TOGGLE PANEL PINTAR ---
window.bukaPanelKhusus = function(panelId) {
    // 👇 Tambahkan 'panel-crafting' di dalam kurung siku ini 👇
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

// --- KONTROL PANDAI BESI (TANPA POPUP) ---
window.addBlacksmithLog = function(msg, color) {
    const logPanel = document.getElementById('bs-log-panel');
    if (logPanel) {
        const time = new Date().toLocaleTimeString('id-ID', { hour12: false });
        logPanel.innerHTML += `<div style="color: ${color}; margin-bottom: 3px;">[${time}] ${msg}</div>`;
        logPanel.scrollTop = logPanel.scrollHeight; // Auto-scroll ke paling bawah
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
        btnTempa.innerText = "⚒️ TEMPA (+1) ⚒️";
        btnTempa.style.background = "#28a745";
        btnTempa.style.cursor = "pointer";
    }
    
    isForging = false;
};

window.resetEquip = function() {
    bsSelectedEquip = null;
    const elIcon = document.getElementById('bs-icon-equip');
    const elText = document.getElementById('bs-text-equip');
    if (elIcon) elIcon.innerText = "🛡️";
    if (elText) { elText.innerText = "Pilih Equip"; elText.style.color = "#aaa"; }
    
    const costText = document.getElementById('bs-info-cost');
    if (costText) costText.innerText = "Silakan pilih Equipment.";
    
    window.addBlacksmithLog("[SISTEM] Equipment dikeluarkan dari tungku.", "#aaa");
};

window.resetCatalyst = function() {
    bsSelectedCatalyst = "Tanpa Batu Tambahan";
    const elIcon = document.getElementById('bs-icon-catalyst');
    const elText = document.getElementById('bs-text-catalyst');
    if (elIcon) elIcon.innerText = "💎";
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
        alert("Sistem gagal menemukan panel tungku!");
    }
};

// =========================================================
// SISTEM PEMILIHAN KARAKTER BARU (EVENT DELEGATION)
// =========================================================

// 1. Eksekusi Tombol Buat Karakter
document.addEventListener('click', async function(e) {
    if (e.target && e.target.id === 'btn-create-char') {
        const charNameInput = document.getElementById('char-name-input');
        const classRadio = document.querySelector('input[name="char-class"]:checked');
        
        if (!charNameInput || !charNameInput.value.trim()) {
            return alert("❌ Nama karakter tidak boleh kosong!");
        }
        if (!classRadio) {
            return alert("❌ Silakan pilih Class/Job karakter Anda!");
        }

        const charName = charNameInput.value.trim();
        const charClass = classRadio.value;

        try {
            // Ubah tombol jadi loading agar tidak di-spam
            e.target.innerText = "⏳ MENEMPA TAKDIR...";
            e.target.style.background = "#555";
            e.target.disabled = true;

            // Panggil fungsi bawaan untuk mengatur stats awal Job
            await selectCharacterClass(db, currentUserUid, charClass);

            // Simpan nama karakter yang diketik ke Firebase
            const userRef = doc(db, "users", currentUserUid);
            await updateDoc(userRef, { username: charName });

            // (Layar akan otomatis berganti ke dalam game karena sistem onSnapshot)

        } catch (error) {
            alert("Gagal membuat karakter: " + error.message);
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