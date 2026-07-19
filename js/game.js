import { db, auth } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, getDoc, updateDoc, onSnapshot, runTransaction, collection, getDocs, query, where, writeBatch, addDoc, serverTimestamp, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// IMPORT MODULES UI
import { loadUIComponents } from './ui-loader.js';
loadUIComponents();

import {
    renderPlayerUI, renderQuestUI, renderInventoryUI, renderBankUI,
    renderMailboxUI, renderAuctionUI, renderPartyUI, renderGuildUI,
    renderChatUI, escapeHTML, renderCraftingUI, getIconHTML, renderShopAndMall,
    renderPKUI, setupLeaderboardUI, setupShopModalUI, setupPKUI, setupFriendUI,
    setupPrivateChatUI, setupDungeonUI, setupRedeemUI, setupSupportUI,
    renderCoinMarketUI, renderWorldBossUI, renderLiveFriendsUI, setupRPGModal
} from './modules/ui-renderer.js';

// IMPORT MODULES SISTEM
import { selectCharacterClass, addCharacterStat, startStaminaRegeneration, consumePotion } from './modules/character.js';
import { equipFromInventory, sellItemToNPC, unequipItem } from './modules/inventory.js';
import { attackMonster } from './modules/battle.js';
import { listenToChat, sendChat } from './modules/chat.js';
import { depositGold, withdrawGold, depositItem, withdrawItem } from './modules/bank.js';
import { listenToAuction, listAuctionItem, buyAuctionItem, placeBid, acceptBid, rejectBid, cancelAuction, returnExpiredToMail } from './modules/auction.js';
import { listenToParties, createOrJoinParty, leaveParty, startFbBattle } from './modules/party.js';
import { getUpdatedQuests } from './modules/quest.js';
import './modules/quest.js';
import { listenToGuilds, createGuild, joinGuild, leaveGuild as dbLeaveGuild, donateGold, upgradeGuild, updateMotd, kickMember, disbandGuild } from './modules/guild.js';
import { listenToMailbox, claimMailReward, deleteMail } from './modules/mailbox.js';
import { dismantleItemAction, DISMANTLE_CONFIG, CRAFTING_RECIPES, craftItemAction } from './modules/crafting.js';
import { ITEM_DB, syncItemsFromFirebase } from './data/items.js';
import { executeRefineAction } from './modules/blacksmith.js';

import { MONSTER_DB } from './data/monsters.js';
import './modules/game-state.js';
import './modules/coin-market.js';
import { listenToCoinMarket } from './modules/coin-market.js';
import './modules/refine-transfer.js';
import './modules/world-boss.js';
import { listenToWorldBoss } from './modules/world-boss.js';
import './modules/tower.js';
import { renderTowerUI } from './modules/tower.js';
import './modules/expedition.js';
import { renderExpeditionUI } from './modules/expedition.js';
import { sendFriendRequest, acceptFriendRequest, rejectFriendRequest, removeFriend } from './modules/friends.js';
import './modules/inventory-modes.js';
import { processReincarnation } from './modules/reincarnation.js';
import { executePurchase } from './modules/shop.js';
import { getLeaderboardData } from './modules/leaderboard.js';
import { listenToPKZone, enterPKZone, leavePKZone, executePKBattle } from './modules/pk-system.js';
import { fetchMonsterData, calculateMonsterDrops, getDungeonMonstersList } from './modules/dungeon-system.js';
import { claimGiftCodeTransaction } from './modules/redeem-system.js';
import { loadCloudItems } from './modules/item-system.js';
import { setupMaintenanceMonitor } from './modules/maintenance-system.js';
import { setupActionRouters } from './modules/action-routers.js';

let inventoryMode = "EQUIP";
let unsubMail;

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

// --- FUNGSI GLOBAL UPDATE LOKASI (Panggil ini dari tombol menu) ---
window.updateMyLocation = function (locationName) {
    if (currentUserUid) {
        updateDoc(doc(db, "users", currentUserUid), {
            currentLocation: locationName
        }).catch(err => console.error("Gagal update lokasi:", err));
    }
};

// ==========================================
// INISIALISASI UI & MODAL
// ==========================================
// Aktifkan Sistem RPG Modal (Pop-up)
setupRPGModal();

// Aktifkan Sistem Shop Modal
setupShopModalUI(db, () => currentUserUid, executePurchase);

// Aktifkan Sistem Leaderboard
setupLeaderboardUI(db, getLeaderboardData);

// Aktifkan Sistem Zona PK
setupPKUI(db, () => currentUserUid, () => currentPlayerStats, {
    listenToPKZone, enterPKZone, leavePKZone, executePKBattle
});

// Aktifkan Sistem Pertemanan
setupFriendUI(db, () => currentUserUid, () => currentPlayerStats, {
    sendFriendRequest, acceptFriendRequest, rejectFriendRequest, removeFriend
});

// Aktifkan Sistem Private Chat / Whisper
setupPrivateChatUI(db, () => currentUserUid, () => playerUsername);

// Aktifkan Sistem Dungeon & Drop Item
setupDungeonUI(db, { fetchMonsterData, calculateMonsterDrops, getDungeonMonstersList });

// Aktifkan Sistem Kode Redeem
setupRedeemUI(db, () => currentUserUid, { claimGiftCodeTransaction });

// Aktifkan Sistem Bantuan / Customer Support
setupSupportUI(db, () => currentUserUid, () => playerUsername);

// Aktifkan Router & Event Listeners Global
setupActionRouters();

// Aktifkan Pemantau Maintenance Server
setupMaintenanceMonitor(db, auth);

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUserUid = user.uid;

        await loadUIComponents();
        await syncItemsFromFirebase(db);
        await loadCloudItems(db);

        const docSnap = await getDoc(doc(db, "users", currentUserUid));
        if (!docSnap.exists() || !docSnap.data().characterClass) {
            showScreen('screen-char-select');
        } else {
            showScreen('screen-game');
            renderShopAndMall();
            startLiveGameSync();
            if (staminaRegenInterval) clearInterval(staminaRegenInterval);
            staminaRegenInterval = startStaminaRegeneration(db, currentUserUid);

            // SISTEM PELACAK STATUS ONLINE
            updateDoc(doc(db, "users", currentUserUid), {
                lastActive: Date.now(),
                currentLocation: "Kota Aman (Idle)"
            }).catch(err => console.error("Gagal set online:", err));

            if (window.heartbeatInterval) clearInterval(window.heartbeatInterval);
            window.heartbeatInterval = setInterval(() => {
                if (currentUserUid) {
                    updateDoc(doc(db, "users", currentUserUid), {
                        lastActive: Date.now()
                    }).catch(e => console.log("Gagal detak jantung:", e));
                }
            }, 60000);

            window.addEventListener('beforeunload', () => {
                updateDoc(doc(db, "users", currentUserUid), {
                    lastActive: 0,
                    currentLocation: "Offline"
                });
            });
        }
    } else {
        if (window.heartbeatInterval) clearInterval(window.heartbeatInterval);

        if (currentUserUid) {
            updateDoc(doc(db, "users", currentUserUid), {
                lastActive: 0,
                currentLocation: "Offline"
            }).catch(e => console.log("Gagal set offline:", e));
        }

        currentUserUid = null;
        if (staminaRegenInterval) clearInterval(staminaRegenInterval);
        activeUnsubscribeListeners.forEach(unsub => unsub());
        if (unsubChatListener) unsubChatListener();
        activeUnsubscribeListeners = [];
        showScreen('screen-auth');
    }
});

function startLiveGameSync() {
    activeUnsubscribeListeners.forEach(unsub => {
        if (typeof unsub === 'function') unsub();
    });
    activeUnsubscribeListeners = [];

    const unsubGuilds = listenToGuilds(db, (guildsData, upgradesData) => {
        globalGuilds = guildsData;
        guildUpgradesMap = upgradesData;
        renderGuildUI(currentPlayerStats, globalGuilds, guildUpgradesMap);
    });

    const unsubData = onSnapshot(doc(db, "users", currentUserUid), (docSnap) => {
        if (!docSnap.exists()) return;
        const d = docSnap.data();

        if (d.banned === true) {
            document.body.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background-color: #0d1117; color: white; font-family: sans-serif; text-align: center; padding: 20px; box-sizing: border-box;">
                    <h1 style="color: #ff4c4c; font-size: 36px; margin-bottom: 10px;">🚫 AKSES DITOLAK</h1>
                    <p style="font-size: 16px; color: #ccc; margin-bottom: 30px; max-width: 400px; line-height: 1.5;">
                        Akun Anda telah <b>diblokir</b> oleh Administrator karena terindikasi melakukan pelanggaran terhadap aturan game.<br><br>
                        Silakan hubungi dukungan jika Anda merasa ini adalah sebuah kesalahan.
                    </p>
                    <button id="btn-banned-logout" style="padding: 12px 25px; font-size: 16px; font-weight: bold; background: #ff4c4c; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        Kembali ke Halaman Utama
                    </button>
                </div>
            `;
            document.getElementById('btn-banned-logout').addEventListener('click', () => {
                const btn = document.getElementById('btn-banned-logout');
                btn.innerText = "Memutus sesi...";
                btn.disabled = true;
                signOut(auth).then(() => window.location.href = 'index.html').catch(() => window.location.href = 'index.html');
            });
            return;
        }

        let curLevel = d.level || 1;
        let curExp = d.exp || 0;
        let maxExp = curLevel * 100;
        let isLevelUp = false;

        while (curExp >= maxExp) {
            curExp -= maxExp;
            curLevel += 1;
            maxExp = curLevel * 100;
            isLevelUp = true;
        }

        if (isLevelUp) {
            updateDoc(doc(db, "users", currentUserUid), { level: curLevel, exp: curExp });
            return;
        }

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
                const updatedMembers = myGuild.members.map(m => m.uid === currentUserUid ? { ...m, level: (d.level || 1) } : m);
                updateDoc(doc(db, "guilds", d.guildId), { members: updatedMembers });
            }
        }

        if (!d.guildId && currentChatChannel === 'guild') {
            currentChatChannel = 'world';
            const sel = document.getElementById('chat-channel-select');
            if (sel) sel.value = 'world';
            startDynamicChat();
        }

        const elCmCoin = document.getElementById('cm-balance-coin');
        const elCmGold = document.getElementById('cm-balance-gold');
        if (elCmCoin) elCmCoin.innerText = d.auctionBalanceCoin || 0;
        if (elCmGold) elCmGold.innerText = d.auctionBalanceGold || 0;

        const newStats = renderPlayerUI(d, currentUserUid, globalGuilds, guildUpgradesMap);
        if (newStats) currentPlayerStats = newStats;

        renderQuestUI(d.quests);
        renderInventoryUI(d.inventory);
        renderBankUI(d.bankInventory);
        renderGuildUI(currentPlayerStats, globalGuilds, guildUpgradesMap);
        renderCraftingUI(d.inventory || {}, d.level || 1, d.gold || 0);
        renderTowerUI(d);
        renderExpeditionUI(d);

        // --- PANGGIL FILE UI LIVE BARU ---
        renderLiveFriendsUI(db, d, currentUserUid);

        window.currentInventoryData = d.inventory || {};
        const elOwnedStone = document.getElementById('transfer-owned-stone');
        if (elOwnedStone) {
            elOwnedStone.innerText = d.inventory && d.inventory['Universal Stone'] ? d.inventory['Universal Stone'] : 0;
        }

        if (!unsubChatListener) startDynamicChat();
    });

    const unsubMail = listenToMailbox(db, currentUserUid, (mails) => {
        renderMailboxUI(mails);
        const badge = document.getElementById('mail-badge');
        if (badge) {
            if (mails && mails.length > 0) {
                badge.innerText = mails.length;
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
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
                if (sel) sel.value = 'world';
                startDynamicChat();
            }
        }
        renderPartyUI(parties, currentUserUid);
    });

    // --- PANGGIL FILE UI LIVE BARU ---
    const unsubCoinMarket = listenToCoinMarket(db, (items) => renderCoinMarketUI(items, currentUserUid));
    const unsubBoss = listenToWorldBoss((bossData) => renderWorldBossUI(bossData, currentUserUid));

    activeUnsubscribeListeners.push(unsubData, unsubMail, unsubAuction, unsubParties, unsubGuilds, unsubCoinMarket, unsubBoss);
}

// Pastikan fungsi aksi terpasang ke window agar bisa dipanggil dari HTML
window.craftItemAction = craftItemAction;

// function untuk memproses reinkarnasi karakter
window.processReincarnation = function () {
    processReincarnation(db, auth);
};