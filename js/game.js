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
    setupPrivateChatUI, setupDungeonUI, setupRedeemUI, setupSupportUI
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

// ==========================================
// SISTEM UNIVERSAL RPG MODAL (Pengganti Alert/Confirm/Prompt)
// ==========================================
window.showModal = function ({ type, msg, title, inputType = 'text' }) {
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
window.rpgAlert = (msg, title = "Pesan Sistem") => window.showModal({ type: 'alert', msg, title });
window.rpgConfirm = (msg, title = "Konfirmasi") => window.showModal({ type: 'confirm', msg, title });
window.rpgPrompt = (msg, title = "Input", inputType = "text") => window.showModal({ type: 'prompt', msg, title, inputType });

// OVERRIDE ALERT BAWAAN BROWSER AGAR MODUL LAIN OTOMATIS KEREN
window.alert = function (msg) { window.rpgAlert(msg); };

// ==========================================

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
setupShopModalUI(db, () => currentUserUid, executePurchase);
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

            // ==========================================
            // SISTEM PELACAK STATUS ONLINE (HEARTBEAT)
            // ==========================================
            // 1. Set status saat baru masuk
            updateDoc(doc(db, "users", currentUserUid), {
                lastActive: Date.now(),
                currentLocation: "Kota Aman (Idle)"
            }).catch(err => console.error("Gagal set online:", err));

            // 2. Kirim Detak Jantung setiap 60 detik (1 Menit)
            if (window.heartbeatInterval) clearInterval(window.heartbeatInterval);
            window.heartbeatInterval = setInterval(() => {
                if (currentUserUid) {
                    updateDoc(doc(db, "users", currentUserUid), {
                        lastActive: Date.now()
                    }).catch(e => console.log("Gagal detak jantung:", e));
                }
            }, 60000);

            // 3. Tetap simpan beforeunload sebagai cadangan (jika sempat terkirim)
            window.addEventListener('beforeunload', () => {
                updateDoc(doc(db, "users", currentUserUid), {
                    lastActive: 0, // Set 0 agar langsung dianggap offline
                    currentLocation: "Offline"
                });
            });
            // ==========================================
        }
    } else {
        // Hentikan detak jantung saat Logout
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

                signOut(auth).then(() => {
                    window.location.href = 'index.html';
                }).catch((error) => {
                    console.error("Gagal memutus sesi:", error);
                    window.location.href = 'index.html';
                });
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
            updateDoc(doc(db, "users", currentUserUid), {
                level: curLevel,
                exp: curExp
            });
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
                const updatedMembers = myGuild.members.map(m =>
                    m.uid === currentUserUid ? { ...m, level: (d.level || 1) } : m
                );
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

        // --- RENDER DAFTAR TEMAN (LIVE STATUS) ---
        const friends = d.friends || {};
        const reqs = d.friendRequests || {};
        const friendUids = Object.keys(friends);

        if (friendUids.length === 0) {
            document.getElementById('tab-friend-list').innerHTML = `<div style="text-align: center; color: #aaa; margin-top: 20px;">Belum ada teman.</div>`;
        } else {
            // Kita buat fungsi async kecil agar bisa fetch data teman
            const loadLiveFriends = async () => {
                let fHtml = "";
                for (let uid of friendUids) {
                    const fSnap = await getDoc(doc(db, "users", uid));
                    let isOnline = false;
                    let loc = "Tidak diketahui";

                    if (fSnap.exists()) {
                        const fdata = fSnap.data();

                        // --- SISTEM DETAK JANTUNG (HEARTBEAT) ---
                        // Cek apakah detak jantung terakhir kurang dari 2 menit (120.000 ms)
                        const lastActive = fdata.lastActive || 0;
                        const timeDiff = Date.now() - lastActive;

                        // Jika selisih waktu di bawah 2 menit dan tidak logout manual
                        if (timeDiff < 120000 && lastActive !== 0) {
                            isOnline = true;
                            loc = fdata.currentLocation || "Kota Aman (Idle)";
                        } else {
                            isOnline = false;
                            loc = "Offline";
                        }
                    }

                    // Indikator Warna (Hijau = Online, Abu = Offline)
                    const statusDot = isOnline ? `<span style="color:#28a745; text-shadow: 0 0 5px #28a745;">●</span>` : `<span style="color:#666;">●</span>`;
                    const locText = isOnline ? `<span style="font-size:10px; color:#ffca28;">📍 [${loc}]</span>` : `<span style="font-size:10px; color:#666;">[Offline]</span>`;

                    // 🔥 LOGIKA BADGE PESAN BARU
                    const unreadMsgs = d.unreadMessages || {};
                    const hasUnread = unreadMsgs[uid] === true;
                    // Jika ada pesan belum dibaca, munculkan lingkaran merah berkedip
                    const badgeHtml = hasUnread ? `<span style="background:#dc3545; color:white; border-radius:50%; padding:2px 6px; font-size:9px; position:absolute; top:-5px; right:-5px; font-weight:bold; box-shadow:0 0 5px red; animation:pm-blink 1s infinite;">!</span>` : '';

                    fHtml += `<div style="display:flex; justify-content:space-between; align-items:center; background:#161b22; padding:8px; margin-bottom:5px; border-radius:4px; border-left: 3px solid ${isOnline ? '#28a745' : '#444'};">
                                <div style="display:flex; flex-direction:column;">
                                    <span>${statusDot} <b style="color:#58a6ff;">${friends[uid].username}</b> <span style="color:#aaa; font-size:12px;">(Lv.${friends[uid].level})</span></span>
                                    ${locText}
                                </div>
                                <div style="display:flex; gap: 5px;">
                                    <!-- Tambahkan position:relative agar badge bisa menempel di pojok tombol -->
                                    <button onclick="window.openPrivateChat('${uid}', '${friends[uid].username}')" style="background:#0366d6; color:white; border:none; padding:4px 8px; border-radius:3px; cursor:pointer; position:relative;">
                                        💬 Pesan ${badgeHtml}
                                    </button>
                                    <button onclick="window.delFriend('${uid}')" style="background:#dc3545; color:white; border:none; padding:4px 8px; border-radius:3px; cursor:pointer;">Hapus</button>
                                </div>
                              </div>`;
                }
                document.getElementById('tab-friend-list').innerHTML = fHtml;
            };
            loadLiveFriends();
        }

        // Render Permintaan
        let rHtml = "";
        let reqCount = 0;
        for (let uid in reqs) {
            reqCount++;
            rHtml += `<div style="display:flex; flex-direction:column; background:#161b22; padding:8px; margin-bottom:5px; border-radius:4px;">
                        <span style="margin-bottom:5px;"><b style="color:#ffca28;">${reqs[uid].username}</b> ingin berteman.</span>
                        <div style="display:flex; gap:5px;">
                            <button onclick="window.accFriend('${uid}', '${reqs[uid].username}', ${reqs[uid].level})" style="flex:1; background:#28a745; color:white; border:none; padding:4px; border-radius:3px;">Terima</button>
                            <button onclick="window.rejFriend('${uid}')" style="flex:1; background:#dc3545; color:white; border:none; padding:4px; border-radius:3px;">Tolak</button>
                        </div>
                      </div>`;
        }
        document.getElementById('tab-friend-req').innerHTML = rHtml || `<div style="text-align: center; color: #aaa; margin-top: 20px;">Tidak ada permintaan.</div>`;

        // Update Badge Notifikasi Merah
        const badge = document.getElementById('badge-friend-req');
        if (badge) {
            badge.innerText = reqCount;
            badge.style.display = reqCount > 0 ? 'inline-block' : 'none';
        }

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

    // --- LISTENER LIVE UPDATE BURSA KOIN (TAMBAHAN BARU) ---
    const unsubCoinMarket = listenToCoinMarket(db, (items) => {
        const container = document.getElementById('cm-market-list');
        if (!container) return;

        if (items.length === 0) {
            container.innerHTML = `<div style="text-align:center; color:#aaa; font-size:12px; margin-top:20px;">Pasar koin sedang kosong...</div>`;
            return;
        }

        // Kita gunakan kurung kurawal {} di dalam map agar bisa menggunakan logika IF
        container.innerHTML = items.map(item => {

            // Logika Tombol Dinamis
            let actionButton = "";
            if (item.sellerUid === window.currentUserUid) {
                // Jika ini barang miliknya sendiri, tampilkan tombol BATAL (Merah)
                actionButton = `<button onclick="window.cmCancelSell('${item.id}')" style="background:#dc3545; color:#fff; border:none; border-radius:3px; padding:5px 10px; font-weight:bold; cursor:pointer;">BATAL</button>`;
            } else {
                // Jika ini barang orang lain, tampilkan tombol BELI (Hijau)
                actionButton = `<button onclick="window.cmBuyCoin('${item.id}', '${item.sellerUid}', ${item.amount}, ${item.price})" style="background:#28a745; color:#fff; border:none; border-radius:3px; padding:5px 10px; font-weight:bold; cursor:pointer;">BELI</button>`;
            }

            return `
            <div style="background:#1a1a1a; border:1px solid #333; padding:10px; margin-bottom:5px; border-radius:5px; display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <div style="font-weight:bold; color:#ffcc00;">🪙 ${item.amount} Coin</div>
                    <div style="font-size:11px; color:#aaa;">Dijual oleh: ${item.sellerName}</div>
                </div>
                <div style="text-align:right;">
                    <div style="color:#ffd700; font-weight:bold; margin-bottom:5px;">💰 ${item.price} Gold</div>
                    ${actionButton}
                </div>
            </div>
            `;
        }).join('');
    });

    // --- LISTENER WORLD BOSS (TAMBAHAN BARU) ---
    const unsubBoss = listenToWorldBoss((bossData) => {
        if (!bossData) return;

        const bossNameEl = document.getElementById('wb-name');
        if (bossNameEl) bossNameEl.innerText = bossData.name + (bossData.isActive ? " (AKTIF)" : " (MATI)");

        const hpBar = document.getElementById('wb-hp-bar');
        const hpText = document.getElementById('wb-hp-text');
        const btnAttack = document.getElementById('wb-btn-attack');

        if (bossData.maxHp && hpBar && hpText) {
            let pct = (bossData.currentHp / bossData.maxHp) * 100;
            hpBar.style.width = pct + "%";
            hpText.innerText = `${bossData.currentHp.toLocaleString()} / ${bossData.maxHp.toLocaleString()} HP`;
        }

        // --- LOGIKA TOMBOL & COOLDOWN BARU (DENGAN LIVE TIMER) ---
        let myRecord = bossData.participants && bossData.participants[window.currentUserUid] ? bossData.participants[window.currentUserUid] : null;
        let attackCount = myRecord ? (myRecord.attackCount || 0) : 0;
        let lastTime = myRecord ? (myRecord.lastAttackTime || 0) : 0;

        // Hapus timer lama jika ada agar tidak bentrok (bocor memori)
        if (window.wbCooldownTimer) {
            clearInterval(window.wbCooldownTimer);
            window.wbCooldownTimer = null;
        }

        if (!bossData.isActive || bossData.currentHp <= 0) {
            if (btnAttack) {
                btnAttack.innerText = "BOSS TELAH MATI";
                btnAttack.disabled = true;
                btnAttack.style.background = "#333";
                btnAttack.style.borderColor = "#111";
            }
        } else {
            if (btnAttack) {
                const now = Date.now();
                const ONE_HOUR = 60 * 60 * 1000;

                if (attackCount >= 5) {
                    btnAttack.disabled = true;
                    btnAttack.innerText = "Batas 5x Serangan Tercapai";
                    btnAttack.style.background = "#555";
                    btnAttack.style.borderColor = "#333";
                } else if (attackCount > 0 && (now - lastTime < ONE_HOUR)) {
                    btnAttack.disabled = true;
                    btnAttack.style.background = "#b8860b";
                    btnAttack.style.borderColor = "#daa520";

                    // FUNGSI LIVE TIMER
                    const updateTimer = () => {
                        let waktuSekarang = Date.now();
                        let sisaWaktu = ONE_HOUR - (waktuSekarang - lastTime);

                        if (sisaWaktu <= 0) {
                            // Waktu habis, aktifkan kembali tombol!
                            clearInterval(window.wbCooldownTimer);
                            if (btnAttack) {
                                btnAttack.disabled = false;
                                btnAttack.innerText = `⚔️ SERANG BOSS! (${5 - attackCount}/5)`;
                                btnAttack.style.background = "#8b0000";
                                btnAttack.style.borderColor = "#ff4c4c";
                            }
                        } else {
                            // Ubah milidetik ke format Menit:Detik (MM:SS)
                            let m = Math.floor(sisaWaktu / 60000);
                            let s = Math.floor((sisaWaktu % 60000) / 1000);

                            // Tambahkan angka 0 di depan jika di bawah 10 (misal: 09:05)
                            let mStr = m.toString().padStart(2, '0');
                            let sStr = s.toString().padStart(2, '0');

                            if (btnAttack) btnAttack.innerText = `⏳ Cooldown (${mStr}:${sStr})`;
                        }
                    };

                    // Panggil sekali agar langsung muncul tanpa jeda 1 detik
                    updateTimer();
                    // Set interval agar berjalan mundur setiap 1 detik
                    window.wbCooldownTimer = setInterval(updateTimer, 1000);

                } else {
                    btnAttack.disabled = false;
                    btnAttack.innerText = `⚔️ SERANG BOSS! (${5 - attackCount}/5)`;
                    btnAttack.style.background = "#8b0000";
                    btnAttack.style.borderColor = "#ff4c4c";
                }
            }
        }

        // Render Leaderboard
        const lbContainer = document.getElementById('wb-leaderboard');
        if (lbContainer) {
            let participantsArr = Object.entries(bossData.participants || {}).map(([uid, data]) => ({
                uid, name: data.name, damage: data.damage
            }));

            participantsArr.sort((a, b) => b.damage - a.damage);

            if (participantsArr.length > 0) {
                lbContainer.innerHTML = participantsArr.slice(0, 5).map((p, index) => `
                    <div style="display:flex; justify-content:space-between; padding:3px 0; border-bottom:1px solid #333;">
                        <span><strong style="color:${index === 0 ? '#ffcc00' : (index === 1 ? '#aaa' : '#c08a47')}">#${index + 1}</strong> ${p.name}</span>
                        <span style="color:#ff4c4c; font-weight:bold;">${p.damage.toLocaleString()} DMG</span>
                    </div>
                `).join('');
            }
        }

        // Render My Damage
        const myDmgEl = document.getElementById('wb-my-damage');
        if (myDmgEl) {
            const myDmg = bossData.participants && bossData.participants[window.currentUserUid]
                ? bossData.participants[window.currentUserUid].damage : 0;
            myDmgEl.innerText = `Total Damage Anda: ${myDmg.toLocaleString()}`;
        }
    });



    // Mendaftarkan semua fungsi pembatalan listener termasuk unsubCoinMarket
    activeUnsubscribeListeners.push(unsubData, unsubMail, unsubAuction, unsubParties, unsubGuilds, unsubCoinMarket, unsubBoss);
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

document.addEventListener('click', async (e) => {
    const target = e.target.closest('button') || e.target.closest('.char-card') || e.target;
    const targetId = target.id;

    if (!targetId) return;

    if (targetId === 'btn-admin-panel') window.location.href = './admin/index.html';
    if (targetId === 'btn-copy-uid') { if (currentUserUid) { navigator.clipboard.writeText(currentUserUid); window.rpgAlert("📋 UID disalin!"); } }

    // --- NAVIGASI TOGGLE PANEL ---
    if (targetId === 'btn-toggle-mall') window.togglePanel('panel-mall');
    if (targetId === 'btn-toggle-shop') window.togglePanel('panel-shop');
    if (targetId === 'btn-toggle-coin-market') window.togglePanel('panel-coin-market');
    if (targetId === 'btn-toggle-mail') window.togglePanel('panel-mailbox');
    if (targetId === 'btn-toggle-friends') window.togglePanel('panel-friends');
    if (targetId === 'btn-toggle-boss') window.togglePanel('panel-world-boss');
    if (targetId === 'btn-toggle-tower') window.togglePanel('panel-tower');
    if (targetId === 'btn-toggle-afk') window.togglePanel('panel-afk');
    if (targetId === 'btn-toggle-leaderboard') {
        window.togglePanel('panel-leaderboard');
        const lbContent = document.getElementById('leaderboard-content');
        if (lbContent && lbContent.innerText.includes('Klik kategori')) window.fetchLeaderboard('level');
    }
    if (targetId === 'btn-toggle-tickets') {
        window.togglePanel('panel-tickets');
        if (typeof window.listenToMyTickets === 'function') window.listenToMyTickets();
    }

    // --- TOMBOL KATEGORI LEADERBOARD ---
    if (targetId === 'btn-lb-level') window.fetchLeaderboard('level');
    if (targetId === 'btn-lb-gold') window.fetchLeaderboard('gold');
    if (targetId === 'btn-lb-tower') window.fetchLeaderboard('tower');

    if (targetId === 'class-warrior') selectCharacterClass(db, currentUserUid, 'Warrior', () => showScreen('screen-game'));
    if (targetId === 'class-mage') selectCharacterClass(db, currentUserUid, 'Mage', () => showScreen('screen-game'));

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

// GLOBAL WINDOW ROUTERS ASYNC (PERBAIKAN SINKRONISASI MODE)
window.handleInventoryClick = async function (itemName) {
    // 🔥 PERBAIKAN UTAMA: Memastikan game selalu membaca mode dari master toggle global
    const modeSaatIni = window.inventoryMode || "EQUIP";

    if (modeSaatIni === "transfer" || modeSaatIni === "TRANSFER") {
        window.putItemToTransferSlot(itemName);
        return;
    }

    if (modeSaatIni === "EQUIP") {
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
            if (await window.rpgConfirm("Gunakan Buku Reset Stats? Semua alokasi manual akan dikembalikan.", "Reset Stats")) equipFromInventory(db, currentUserUid, itemName, null);
        }
        else if (itemName === "Ramuan HP" || itemName === "Ramuan MP") {
            const sukses = await consumePotion(db, currentUserUid, itemName, currentPlayerStats.maxHp, currentPlayerStats.maxMp);
            if (sukses) window.rpgAlert(`Glug glug glug...\nAnda meminum [${itemName}]! Nyawa/Mana kembali penuh.`, "Berhasil Diteguk");
        }
        else if (itemName.startsWith("Item Renkarnasi")) {
            window.rpgAlert("Item ini tidak bisa dipakai langsung dari tas. Pergilah ke menu Kuil Reinkarnasi (Rebirth) untuk menggunakannya!", "Info Item");
        }
        else { equipFromInventory(db, currentUserUid, itemName, null); }
    }
    else if (modeSaatIni === "SELL") {
        sellItemToNPC(db, currentUserUid, itemName);
    }
    else if (modeSaatIni === "BANK") {
        const qtyStr = await window.rpgPrompt(`Berapa banyak [${itemName}] yang ingin disimpan?`, "Simpan ke Bank", "number");
        const qty = parseInt(qtyStr);
        if (qty > 0) depositItem(db, currentUserUid, itemName, qty);
    }
    else if (modeSaatIni === "AUCTION") {
        // 1. Daftarkan item yang namanya harus SAMA PERSIS agar diblokir
        const itemDilarangPersis = [
            "Dragon Orb (1 Star)",
            "Dragon Orb (2 Star)",
            "Dragon Orb (3 Star)",
            "Dragon Orb (4 Star)",
            "Dragon Orb (5 Star)",
            "Dragon Orb (6 Star)",
            "Dragon Orb (7 Star)",
            "Dragon Orb (8 Star)",
            "Dragon Orb (9 Star)",
            "Dragon Orb Ocean",
            "Dragon Orb Mirage",
            "Dragon Orb Flame",
            "Mahkota Kaisar Surga",
            "Pedang Kaisar Langit",
            "Senjata Dewa: Ragnarok",
            "Senjata Dewa: Nirvana",
            "Zirah Dewa: Aegis",
            "Naga Terbang",
            "Ramuan Stamina"
        ];

        // 2. Cek apakah item masuk daftar persis ATAU berawalan kata tertentu
        if (
            itemDilarangPersis.includes(itemName) ||
            itemName.startsWith("Tiket") ||
            itemName.startsWith("Buku")
        ) {
            return window.rpgAlert("Item premium ini terikat pada karakter dan tidak bisa dilelang.");
        }

        const priceStr = await window.rpgPrompt(`Masukkan Harga Beli Langsung (Gold) untuk 1x [${itemName}]:`, "Jual ke Lelang", "number");
        const price = parseInt(priceStr);
        if (price > 0) listAuctionItem(db, currentUserUid, itemName, price, playerUsername);
    }
    else if (modeSaatIni === "DISMANTLE") {
        if (DISMANTLE_CONFIG[itemName]) {
            if (await window.rpgConfirm(`🔥 Yakin ingin MELEBUR [${itemName}]?\nItem akan hancur menjadi material crafting.`, "Peleburan Item")) {
                dismantleItemAction(db, currentUserUid, itemName);
            }
        } else {
            window.rpgAlert(`❌ [${itemName}] tidak bisa dilebur!`);
        }
    }
    else if (modeSaatIni === "BLACKSMITH") {
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
            document.getElementById('bs-info-cost').innerText = `Biaya: ${mCost}x Mirage Stone`;
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

window.handleBankClick = async function (itemName) {
    const qtyStr = await window.rpgPrompt(`Berapa banyak [${itemName}] yang ingin ditarik?`, "Tarik dari Bank", "number");
    const qty = parseInt(qtyStr);
    if (qty > 0) withdrawItem(db, currentUserUid, itemName, qty);
};
window.claimMail = function (mailId) { claimMailReward(db, currentUserUid, mailId); };
window.deleteMail = async function (mailId) { if (await window.rpgConfirm("Yakin ingin menghapus surat ini?", "Hapus Surat")) deleteMail(db, currentUserUid, mailId); };
window.deleteAllMails = async function () {
    if (!await window.rpgConfirm("Hapus semua surat?\n(Surat yang berisi Hadiah/Lampiran yang belum diklaim TIDAK akan dihapus).", "Bersihkan Kotak Surat")) return;

    await new Promise(res => setTimeout(res, 200));

    try {
        const mailRef = collection(db, "users", currentUserUid, "mailbox");
        const snap = await getDocs(mailRef);

        const batch = writeBatch(db);
        let deletedCount = 0;

        snap.docs.forEach(docSnap => {
            const data = docSnap.data();

            let isPunyaHadiah = false;
            const att = data.attachments || {};

            const adaItem = att.itemName || att.name;
            const adaGold = (att.gold || 0) > 0;
            const adaCoin = (att.coin || 0) > 0;

            if (adaItem || adaGold || adaCoin || data.reward) {
                isPunyaHadiah = true;
            }

            const isSudahDiKlaim = data.isClaimed === true || data.isClaimed === "true";
            const bisaDihapus = !isPunyaHadiah || isSudahDiKlaim;

            if (bisaDihapus) {
                batch.delete(docSnap.ref);
                deletedCount++;
            }
        });

        if (deletedCount > 0) {
            await batch.commit();
            window.rpgAlert(`🧹 ${deletedCount} surat berhasil dibersihkan!`, "Sukses");
        } else {
            window.rpgAlert("Tidak ada surat yang bisa dihapus.\n(Semua sisa surat masih berisi hadiah yang belum diambil).", "Kotak Bersih");
        }

    } catch (err) {
        window.rpgAlert(`Gagal membersihkan kotak surat: ${err.message}`, "Sistem Error");
    }
};
window.buyFromAuction = async function (id, name, price, sellerId) { if (await window.rpgConfirm(`Beli Langsung ${name} seharga ${price} Gold?`, "Pasar Lelang")) buyAuctionItem(db, currentUserUid, id, name, price, sellerId); };
window.cancelAuction = async function (id) { if (await window.rpgConfirm("Tarik barang dari pasar?", "Batal Lelang")) cancelAuction(db, currentUserUid, id); };

window.placeBid = async function (id, name, currentBid) {
    const minBid = currentBid > 0 ? currentBid + 10 : 10;
    const bidStr = await window.rpgPrompt(`Masukkan tawaran (Bid) untuk ${name}\n(Minimal: ${minBid} Gold):`, "Tawar Lelang", "number");
    const bidAmt = parseInt(bidStr);
    if (bidAmt >= minBid) { placeBid(db, currentUserUid, playerUsername, id, bidAmt); } else if (bidStr) { window.rpgAlert(`Tawaran terlalu rendah! Minimal tawaran adalah ${minBid} Gold.`); }
};
window.actionBid = async function (id, action) {
    if (action === 'accept' && await window.rpgConfirm("Terima tawaran ini?", "Terima Tawaran")) acceptBid(db, currentUserUid, id);
    if (action === 'reject' && await window.rpgConfirm("Tolak tawaran ini?", "Tolak Tawaran")) rejectBid(db, currentUserUid, id);
};

window.processExpiredAuction = function (auctionId) {
    returnExpiredToMail(db, auctionId);
};

window.addStat = function (statName) { addCharacterStat(db, currentUserUid, statName); };
window.leaveParty = function (partyId) { leaveParty(db, partyId, currentUserUid); };
window.startFb = async function (partyId) {
    // 1. Kunci tombol agar tidak di-klik berkali-kali secara tidak sengaja
    if (window.isFbRunning) return;
    window.isFbRunning = true;

    try {
        // 2. Panggil fungsi utama FB
        await startFbBattle(db, currentUserUid, partyId);
    } catch (err) {
        console.error("Gagal memulai FB:", err);
    } finally {
        // 3. Buka kunci setelah jeda agar sistem database sempat menghapus room
        setTimeout(() => { window.isFbRunning = false; }, 1500);
    }
};
window.joinGuildAction = async function (guildId) { if (await window.rpgConfirm("Bergabung dengan Guild ini?", "Gabung Guild")) joinGuild(db, currentUserUid, currentPlayerStats, guildId); };
window.kickMemberAction = async function (targetUid) { if (await window.rpgConfirm("Keluarkan anggota ini dari Guild?", "Keluarkan Anggota")) kickMember(db, currentUserUid, currentPlayerStats.guildId, targetUid); };
window.actionCraftItem = async function (recipeName) {
    if (await window.rpgConfirm(`Siap menempa [${recipeName}]?\nSemua material dan Gold yang disyaratkan akan dikonsumsi.`, "Crafting")) {
        craftItemAction(db, currentUserUid, recipeName);
    }
};

window.bukaPanelKhusus = function (panelId) {
    const panels = ['panel-bank', 'panel-auction', 'panel-blacksmith', 'panel-crafting'];
    const targetPanel = document.getElementById(panelId);

    if (targetPanel && targetPanel.style.display === 'block') {
        targetPanel.style.display = 'none';
        return;
    }

    panels.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    if (targetPanel) {
        targetPanel.style.display = 'block';
        targetPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
};

window.togglePanel = function (panelId) {
    const el = document.getElementById(panelId);
    if (el) {
        el.style.display = el.style.display === 'none' ? 'block' : 'none';
        if (el.style.display === 'block') el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
};

window.addBlacksmithLog = function (msg, color) {
    const logPanel = document.getElementById('bs-log-panel');
    if (logPanel) {
        const time = new Date().toLocaleTimeString('id-ID', { hour12: false });
        logPanel.innerHTML += `<div style="color: ${color}; margin-bottom: 3px;">[${time}] ${msg}</div>`;
        logPanel.scrollTop = logPanel.scrollHeight;
    }
};

window.executeTempa = async function () {
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

    // 1. TANGKAP HASIL TEMPA (NAMA ITEM BARU) DARI BLACKSMITH.JS
    const newEquipName = await executeRefineAction(db, currentUserUid, bsSelectedEquip, bsSelectedCatalyst);

    // 2. JIKA ADA NAMA BARU (Sukses/Gagal turun level), UPDATE SLOT OTOMATIS!
    if (newEquipName && typeof newEquipName === 'string') {
        bsSelectedEquip = newEquipName;
        const elText = document.getElementById('bs-text-equip');
        if (elText) elText.innerText = newEquipName; // Teks di layar langsung berubah!
    }

    if (btnTempa) {
        btnTempa.innerText = "⚒️ TEMPA";
        btnTempa.style.background = "#28a745";
        btnTempa.style.cursor = "pointer";
    }

    isForging = false;
};

window.resetEquip = function () {
    bsSelectedEquip = null;
    const elIcon = document.getElementById('bs-icon-equip');
    const elText = document.getElementById('bs-text-equip');
    if (elIcon) elIcon.innerHTML = "🛡️";
    if (elText) { elText.innerText = "Pilih Equip"; elText.style.color = "#aaa"; }

    const costText = document.getElementById('bs-info-cost');
    if (costText) costText.innerText = "Silakan pilih Equipment.";

    window.addBlacksmithLog("[SISTEM] Equipment dikeluarkan dari tungku.", "#aaa");
};

window.resetCatalyst = function () {
    bsSelectedCatalyst = "Tanpa Batu Tambahan";
    const elIcon = document.getElementById('bs-icon-catalyst');
    const elText = document.getElementById('bs-text-catalyst');
    if (elIcon) elIcon.innerHTML = "💎";
    if (elText) { elText.innerText = "Tanpa Batu"; elText.style.color = "#aaa"; }

    window.addBlacksmithLog("[SISTEM] Batu katalis dikosongkan.", "#aaa");
};

window.actionUnequip = function (slotType) {
    unequipItem(db, currentUserUid, slotType);
};

// MENGUBAH EVENT LISTENER INI AGAR ASYNC AWAIT BERJALAN LANCAR
document.addEventListener('click', async function (e) {
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

document.addEventListener('change', function (e) {
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

// --- SISTEM PEMBACA INFO DROP BOS FB ---
document.addEventListener('change', (e) => {
    if (e.target.id === 'fb-select') {
        const bossKey = e.target.value;
        const boss = MONSTER_DB[bossKey];

        const infoBox = document.getElementById('fb-drop-info');
        const textBox = document.getElementById('fb-drop-text');

        if (boss && infoBox && textBox) {
            let dropsInfo = [];

            if (boss.drop) dropsInfo.push(`[${boss.drop.item}] (${(boss.drop.chance * 100).toFixed(0)}%)`);
            if (boss.drops && Array.isArray(boss.drops)) {
                boss.drops.forEach(d => dropsInfo.push(`[${d.item}] (${(d.chance * 100).toFixed(0)}%)`));
            }

            if (dropsInfo.length > 0) {
                textBox.innerText = dropsInfo.join(' | ');
            } else {
                textBox.innerText = "Hanya EXP & Gold";
            }
            infoBox.style.display = 'block';
        }
    }
});

// Navigasi Tab Bursa Koin
document.addEventListener('click', (e) => {
    if (e.target.id === 'btn-tab-cmb') {
        document.getElementById('tab-cm-buy').style.display = 'block';
        document.getElementById('tab-cm-sell').style.display = 'none';
        document.getElementById('tab-cm-wallet').style.display = 'none';
    } else if (e.target.id === 'btn-tab-cms') {
        document.getElementById('tab-cm-buy').style.display = 'none';
        document.getElementById('tab-cm-sell').style.display = 'block';
        document.getElementById('tab-cm-wallet').style.display = 'none';
    } else if (e.target.id === 'btn-tab-cmw') {
        document.getElementById('tab-cm-buy').style.display = 'none';
        document.getElementById('tab-cm-sell').style.display = 'none';
        document.getElementById('tab-cm-wallet').style.display = 'block';
    }
});

// Pastikan fungsi aksi terpasang ke window agar bisa dipanggil dari HTML
window.craftItemAction = craftItemAction;

// ===================================================
// PEMICU OTOMATIS SAAT TOMBOL MENU DIKLIK
// ===================================================
document.addEventListener('click', function (e) {
    // Memantau jika tombol Craft atau Tempa ditekan
    if (e.target.id === 'btn-mode-crafting' || e.target.id === 'btn-mode-blacksmith' || e.target.innerText.includes('CRAFT')) {
        setTimeout(() => {
            if (typeof window.renderCraftingUI === 'function') {
                const inv = window.currentInventoryData || {};
                const lvl = (typeof currentPlayerStats !== 'undefined' && currentPlayerStats) ? (currentPlayerStats.level || 1) : 1;
                const gold = (typeof currentPlayerStats !== 'undefined' && currentPlayerStats) ? (currentPlayerStats.gold || 0) : 0;
                window.renderCraftingUI(inv, lvl, gold);
            }
        }, 100); // Tunggu sejenak hingga HTML terbuka, lalu SIRAM dengan data resep!
    }
});

// Fungsi untuk melakukan pemantauan status maintenance server secara real-time
function pantauMaintenanceServer() {
    onSnapshot(doc(db, "server", "status"), async (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();

            // 1. Buat elemen Layar Hitam jika belum ada
            let mtOverlay = document.getElementById('maintenance-overlay');
            if (!mtOverlay) {
                mtOverlay = document.createElement('div');
                mtOverlay.id = 'maintenance-overlay';
                mtOverlay.style.cssText = "position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background-color: #0d1117; color: white; display: none; flex-direction: column; align-items: center; justify-content: center; z-index: 999999; text-align: center; padding: 20px;";
                document.body.appendChild(mtOverlay);
            }

            if (data.isMaintenance === true) {
                // 2. Cek apakah pengguna saat ini adalah seorang Admin
                let isAdmin = false;
                if (auth.currentUser) {
                    try {
                        const userSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
                        if (userSnap.exists() && userSnap.data().role === 'admin') {
                            isAdmin = true;
                        }
                    } catch (e) { console.error("Gagal mengecek role:", e); }
                }

                // 3. Jika dia Admin, biarkan lewat!
                if (isAdmin) {
                    mtOverlay.style.display = 'none';
                    return;
                }

                // 4. Jika bukan Admin (atau belum login), jalankan pemblokiran
                if (auth.currentUser) {
                    signOut(auth);
                }

                mtOverlay.innerHTML = `
                    <h1 id="mt-secret-door" style="color: #ffca28; font-size: 36px; margin-bottom: 10px; cursor: default; user-select: none;">🛠️ SERVER MAINTENANCE</h1>
                    <p style="font-size: 16px; color: #ccc; max-width: 400px; line-height: 1.5;">
                        ${data.message || "Server sedang dalam perbaikan rutin. Harap bersabar dan kembali lagi nanti."}
                    </p>
                `;
                mtOverlay.style.display = 'flex';

                // 5. PINTU RAHASIA: Klik judul 5x untuk membuka kunci layar
                let secretClicks = 0;
                const secretBtn = document.getElementById('mt-secret-door');
                if (secretBtn) {
                    secretBtn.addEventListener('click', () => {
                        secretClicks++;
                        if (secretClicks >= 5) {
                            mtOverlay.style.display = 'none'; // Sembunyikan layar
                            secretClicks = 0; // Reset hitungan
                            console.log("Pintu rahasia admin terbuka!");
                        }
                    });
                }

            } else {
                mtOverlay.style.display = 'none';
            }
        }
    });
}

// EKSEKUSI: Panggil fungsinya
pantauMaintenanceServer();

// function untuk memproses reinkarnasi karakter
// Mendaftarkan fungsi ke window agar bisa dipanggil oleh tombol onclick di HTML
window.processReincarnation = function () {
    // Kita mengirimkan db dan auth dari game.js ke dalam modul
    processReincarnation(db, auth);
};