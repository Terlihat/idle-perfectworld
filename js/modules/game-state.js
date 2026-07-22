// js/modules/game-state.js

// --- DATA PEMAIN ---
window.currentUserUid = null;
window.playerUsername = "Hero Anonim";
window.currentPlayerStats = {};

// --- SISTEM LISTENER (PENCEGAH KEBOCORAN MEMORI) ---
window.activeUnsubscribeListeners = [];
window.unsubChatListener = null;
window.staminaRegenInterval = null;

// --- SISTEM SOSIAL (PARTY & GUILD) ---
window.globalGuilds = {};
window.guildUpgradesMap = {};
window.currentPartyId = null;
window.currentChatChannel = 'world';

// --- SISTEM PENEMPAAN (BLACKSMITH) ---
window.bsSelectedEquip = null;
window.bsSelectedCatalyst = "Tanpa Batu Tambahan";
window.isForging = false;

// --- SISTEM PERTARUNGAN (FUBEN) ---
window.isFbRunning = false;

console.log("✅ Brankas variabel berhasil dimuat!");