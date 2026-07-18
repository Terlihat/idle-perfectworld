import { db, auth } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, getDoc, updateDoc, onSnapshot, runTransaction, collection, getDocs, query, where, writeBatch, addDoc, serverTimestamp, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// IMPORT MODULES UI
import { loadUIComponents } from './ui-loader.js';
loadUIComponents();

import {
    renderPlayerUI, renderQuestUI, renderInventoryUI, renderBankUI,
    renderMailboxUI, renderAuctionUI, renderPartyUI, renderGuildUI, renderChatUI, escapeHTML, renderCraftingUI, getIconHTML, renderShopAndMall, renderPKUI
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
import { setupShopModalUI } from './modules/ui-world.js';
import { setupLeaderboardUI } from './modules/ui-social.js';
import { getLeaderboardData } from './modules/leaderboard.js';

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

// INISIALISASI UI TOKO & MALL
setupShopModalUI(db, () => currentUserUid, executePurchase);
// INISIALISASI UI Leaderboard
setupLeaderboardUI(db, getLeaderboardData);

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUserUid = user.uid;

        await loadUIComponents();
        await syncItemsFromFirebase(db);

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

// ==========================================
// SISTEM DARK FOREST (ZONA PK & LOOT DROP)
// ==========================================

// 1. LIVE TRACKER UNTUK RADAR ZONA PK
const qPk = query(collection(db, "users"), where("inPkZone", "==", true));
onSnapshot(qPk, (snap) => {
    let pkPlayers = [];
    snap.forEach(docSnap => {
        if (docSnap.data().currentHp > 0) { // Hanya lacak yang masih hidup
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

// --- MESIN PENCETAK LOG DARK FOREST ---
window.addPKLog = function (msg, color) {
    const logPanel = document.getElementById('pk-log-panel');
    if (logPanel) {
        const time = new Date().toLocaleTimeString('id-ID', { hour12: false });
        logPanel.innerHTML += `<div style="color: ${color}; margin-bottom: 6px; border-bottom: 1px dashed #222; padding-bottom: 4px;">[${time}] ${msg.replace(/\n/g, '<br>')}</div>`;
        logPanel.scrollTop = logPanel.scrollHeight; // Auto-scroll ke bawah
    }
};

// 3. LOGIKA PERTARUNGAN (BATTLE TRANSACTION)
window.attackPK = async function (targetUid, targetName) {
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

            // --- IMPLEMENTASI POIN 3: BRACKET LEVEL ---
            const levelDiff = Math.abs((me.level || 1) - (enemy.level || 1));
            if (levelDiff > 10) throw "Selisih level terlalu jauh (Maks 10 Level)! Hutan ini melarang pembantaian yang terlalu tidak seimbang.";

            // Kalkulasi Kekuatan Dasar (BP)
            let myBP = (me.level || 1) * 50 + (me.str || 0) * 10 + (me.dex || 0) * 10 + (me.con || 0) * 10 + (me.int || 0) * 10;
            let enemyBP = (enemy.level || 1) * 50 + (enemy.str || 0) * 10 + (enemy.dex || 0) * 10 + (enemy.con || 0) * 10 + (enemy.int || 0) * 10;

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
                let exclusiveDropMsg = "";

                // Penentuan Drop Item Curian (Red Name = 20%, Normal = 5%)
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

                // --- IMPLEMENTASI POIN 2: HARTA KARUN EKSKLUSIF (HIGH REWARD) ---
                // Peluang 30% mendapatkan material langka khusus Zona PK tiap kali menang
                if (Math.random() <= 0.30) {
                    myInv["Kristal Hutan Gelap"] = (myInv["Kristal Hutan Gelap"] || 0) + 1;
                    exclusiveDropMsg = `\n\n🌲 MYSTIC DROP: Tanah berdarah memberikan Anda [Kristal Hutan Gelap]!`;
                }

                ts.update(targetRef, {
                    currentHp: 0,
                    gold: Math.max(0, (enemy.gold || 0) - goldStolen),
                    inventory: enemyInv,
                    inPkZone: false
                });

                ts.update(myRef, {
                    gold: (me.gold || 0) + goldStolen,
                    inventory: myInv,
                    pkKills: (me.pkKills || 0) + 1
                });

                const enemyMailRef = doc(collection(db, "users", targetUid, "mailbox"));
                ts.set(enemyMailRef, {
                    title: "☠️ Terbunuh di Dark Forest!",
                    message: `Anda telah dibantai oleh [${me.username}] di Zona PK!\n\nKehilangan: ${goldStolen.toLocaleString()} Gold.` + (stolenItem ? `\nBarang dirampas: 1x ${stolenItem}` : ""),
                    date: new Date().toLocaleString('id-ID'),
                    timestamp: Date.now()
                });

                logMsg = `🔥 KEMENANGAN!\nAnda membantai ${targetName}.\nMencuri 💰 ${goldStolen.toLocaleString()} Gold.` + (stolenItem ? `\n🎁 RAMPASAN: Anda mendapat [${stolenItem}] dari mayatnya!` : "") + exclusiveDropMsg;
                return { success: true, log: logMsg };

            } else {
                // --- MUSUH MENANG (AKU KALAH) ---
                let goldLost = Math.floor((me.gold || 0) * 0.05);
                let myInv = me.inventory || {};
                let enemyInv = enemy.inventory || {};
                let lostItem = null;
                let exclusiveDropMsg = "";

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

                // --- IMPLEMENTASI POIN 2 UNTUK MUSUH ---
                // MUSUH mendapatkan reward eksklusif karena berhasil bertahan dan membunuh Anda
                if (Math.random() <= 0.30) {
                    enemyInv["Kristal Hutan Gelap"] = (enemyInv["Kristal Hutan Gelap"] || 0) + 1;
                    exclusiveDropMsg = `\n🌲 MYSTIC DROP: Pertahanan berdarah ini memberikan Anda [Kristal Hutan Gelap]!`;
                }

                ts.update(myRef, {
                    currentHp: 0,
                    gold: Math.max(0, (me.gold || 0) - goldLost),
                    inventory: myInv,
                    inPkZone: false
                });

                ts.update(targetRef, {
                    gold: (enemy.gold || 0) + goldLost,
                    inventory: enemyInv,
                    pkKills: (enemy.pkKills || 0) + 1
                });

                const enemyMailRef = doc(collection(db, "users", targetUid, "mail"));
                ts.set(enemyMailRef, {
                    title: "🛡️ Pertahanan PK Berhasil!",
                    message: `[${me.username}] mencoba menyerang Anda di Dark Forest, namun tewas oleh pertahanan Anda!\n\nAnda menjarah: ${goldLost.toLocaleString()} Gold.` + (lostItem ? `\nBarang dijarah: 1x ${lostItem}` : "") + exclusiveDropMsg,
                    date: new Date().toLocaleString('id-ID'),
                    timestamp: Date.now()
                });

                logMsg = `💀 KEKALAHAN!\nAnda dibunuh oleh ${targetName}.\nKehilangan 💰 ${goldLost.toLocaleString()} Gold.` + (lostItem ? `\n\n🚨 RAMPASAN: [${lostItem}] Anda terlempar dan diambil musuh!` : "");
                return { success: false, log: logMsg };
            }
        });

        window.rpgAlert(result.log, result.success ? "🏆 PK BERHASIL" : "💀 TRAGEDI");
        window.addPKLog(result.log, result.success ? "#28a745" : "#dc3545");

    } catch (err) {
        window.rpgAlert(err, "Pertarungan Batal");
        window.addPKLog(`Batal menyerang: ${err}`, "#aaa"); // Catat juga jika gagal
    }
};

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

// ==========================================
// FITUR: Render UI Misi Harian & Bounty
// ==========================================
window.renderQuestUI = function (questData) {
    const btnTake = document.getElementById('btn-take-quest');
    const dTitle = document.getElementById('quest-daily-title');
    const dProg = document.getElementById('quest-daily-prog');
    const btnClaimD = document.getElementById('btn-claim-daily');

    const bTitle = document.getElementById('quest-bounty-title');
    const bProg = document.getElementById('quest-bounty-prog');
    const btnClaimB = document.getElementById('btn-claim-bounty');

    if (!btnTake) return; // Mencegah error jika HTML belum termuat

    const today = new Date().toLocaleDateString('id-ID');

    // JIKA PEMAIN SUDAH PUNYA MISI HARI INI
    if (questData && questData.lastReset === today) {
        btnTake.style.display = 'none'; // Sembunyikan tombol ambil misi

        // Render Misi Harian (Daily)
        if (questData.daily) {
            const dq = questData.daily;
            if (dTitle) dTitle.innerText = dq.title;
            if (dProg) dProg.innerText = `${dq.progress} / ${dq.target}`;

            if (dq.isClaimed) {
                if (btnClaimD) { btnClaimD.style.display = 'inline-block'; btnClaimD.innerText = "Selesai"; btnClaimD.disabled = true; btnClaimD.style.background = "#555"; btnClaimD.style.color = "#888"; }
            } else if (dq.progress >= dq.target) {
                if (btnClaimD) { btnClaimD.style.display = 'inline-block'; btnClaimD.innerText = "Klaim Hadiah"; btnClaimD.disabled = false; btnClaimD.style.background = "#ffca28"; btnClaimD.style.color = "#000"; }
            } else {
                if (btnClaimD) btnClaimD.style.display = 'none';
            }
        }

        // Render Misi Bounty
        if (questData.bounty) {
            const bq = questData.bounty;
            if (bTitle) bTitle.innerText = bq.title;
            if (bProg) bProg.innerText = `${bq.progress} / ${bq.target}`;

            if (bq.isClaimed) {
                if (btnClaimB) { btnClaimB.style.display = 'inline-block'; btnClaimB.innerText = "Selesai"; btnClaimB.disabled = true; btnClaimB.style.background = "#555"; btnClaimB.style.color = "#888"; }
            } else if (bq.progress >= bq.target) {
                if (btnClaimB) { btnClaimB.style.display = 'inline-block'; btnClaimB.innerText = "Klaim Hadiah"; btnClaimB.disabled = false; btnClaimB.style.background = "#ffca28"; btnClaimB.style.color = "#000"; }
            } else {
                if (btnClaimB) btnClaimB.style.display = 'none';
            }
        }
    }
    // JIKA PEMAIN BARU ATAU HARI SUDAH BERGANTI
    else {
        btnTake.style.display = 'block'; // Tampilkan tombol ambil misi
        if (dTitle) dTitle.innerText = "-";
        if (dProg) dProg.innerText = "0/0";
        if (btnClaimD) btnClaimD.style.display = 'none';
        if (bTitle) bTitle.innerText = "-";
        if (bProg) bProg.innerText = "0/0";
        if (btnClaimB) btnClaimB.style.display = 'none';
    }
};

// --- JEMBATAN UI SISTEM PERTEMANAN ---
window.toggleFriendTab = function (tab) {
    document.getElementById('tab-friend-list').style.display = tab === 'list' ? 'block' : 'none';
    document.getElementById('tab-friend-req').style.display = tab === 'req' ? 'block' : 'none';
    document.getElementById('btn-tab-list').style.background = tab === 'list' ? '#238636' : '#333';
    document.getElementById('btn-tab-req').style.background = tab === 'req' ? '#8957e5' : '#333';
};

window.sendFriendReqManual = async function () {
    const inputVal = document.getElementById('input-add-friend').value.trim();
    if (!inputVal) return window.rpgAlert("Masukkan Nickname");

    // Konversi nama inputan menjadi sensitif terhadap huruf besar/kecil (karena Firebase exact match)
    let targetUid = inputVal;

    try {
        // Import fungsi query tambahan dari Firestore
        const { collection, query, where, getDocs, doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js');

        // 1. Coba cari berdasarkan Nickname (Username) terlebih dahulu
        const usersRef = collection(db, "users");
        const q = query(usersRef, where("username", "==", inputVal));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            // Jika Nickname ketemu, sistem otomatis "mencuri" UID-nya dari balik layar
            targetUid = querySnapshot.docs[0].id;
        } else {
            // Jika Nickname tidak ketemu, sistem mengecek apakah input ini adalah UID langsung
            const docSnap = await getDoc(doc(db, "users", inputVal));
            if (!docSnap.exists()) {
                return window.rpgAlert(`Pemain dengan nama atau UID [${inputVal}] tidak ditemukan! Pastikan huruf besar/kecil sesuai.`, "Gagal");
            }
        }

        // 2. Eksekusi pengiriman undangan menggunakan UID yang sudah divalidasi
        await sendFriendRequest(db, currentUserUid, currentPlayerStats, targetUid);
        window.rpgAlert(`Permintaan pertemanan berhasil dikirim!`, "Sukses");
        document.getElementById('input-add-friend').value = "";

    } catch (err) {
        // Tangkap pesan error spesifik jika mencoba add diri sendiri atau sudah berteman
        const errorMsg = typeof err === 'string' ? err : "Terjadi kesalahan sistem.";
        window.rpgAlert(errorMsg, "Gagal");
    }
};

window.accFriend = async function (reqUid, reqName, reqLevel) {
    try { await acceptFriendRequest(db, currentUserUid, currentPlayerStats, reqUid, { username: reqName, level: reqLevel }); }
    catch (err) { console.error(err); }
};

window.rejFriend = async function (reqUid) {
    try { await rejectFriendRequest(db, currentUserUid, reqUid); }
    catch (err) { console.error(err); }
};

window.delFriend = async function (targetUid) {
    if (await window.rpgConfirm("Yakin ingin menghapus teman ini?", "Hapus Teman")) {
        try { await removeFriend(db, currentUserUid, targetUid); }
        catch (err) { console.error(err); }
    }
};

// --- SISTEM PESAN PRIBADI (WHISPER) ---
let unsubPrivateChat = null;

// Tambahkan Animasi Berkedip (Blinking) untuk Notifikasi via JavaScript
if (!document.getElementById('pm-custom-styles')) {
    const style = document.createElement('style');
    style.id = 'pm-custom-styles';
    style.innerHTML = `
        @keyframes pm-blink {
            0% { background-color: #161b22; }
            50% { background-color: #2ea043; } /* Hijau Terang */
            100% { background-color: #161b22; }
        }
        .pm-alert { animation: pm-blink 1.5s infinite !important; }
    `;
    document.head.appendChild(style);
}

window.openPrivateChat = function (targetUid, targetName) {
    let chatModal = document.getElementById('modal-private-chat');

    // Siapkan ID Chat
    const chatId = [currentUserUid, targetUid].sort().join('_');

    if (!chatModal) {
        chatModal = document.createElement('div');
        chatModal.id = 'modal-private-chat';
        chatModal.setAttribute('data-state', 'maximized');
        chatModal.style.cssText = "position:fixed; top:20%; left:30%; width:300px; background:#0d1117; border:1px solid #30363d; border-radius:8px; z-index:1000; display:flex; flex-direction:column; box-shadow: 0 5px 25px rgba(0,0,0,0.9); transition: width 0.2s, top 0.2s, left 0.2s, bottom 0.2s, right 0.2s;";

        const emojis = ['😀', '😂', '😅', '😍', '😎', '😭', '😡', '👍', '🙏', '🎉', '💀', '🔥', '⚔️', '🛡️', '💰', '🌲'];
        const emojiHtml = emojis.map(e => `<span class="pm-emoji-btn" style="cursor:pointer; font-size:18px; padding:2px;">${e}</span>`).join('');

        chatModal.innerHTML = `
            <div id="pm-drag-handle" style="background:#161b22; padding:10px; border-bottom:1px solid #30363d; border-radius:8px 8px 0 0; display:flex; justify-content:space-between; align-items:center; cursor:grab; user-select:none; transition: background-color 0.3s;">
                <b style="color:#58a6ff; pointer-events:none;">💬 <span id="pm-target-name"></span></b>
                <div style="display:flex; gap:10px; align-items:center;">
                    <button onclick="window.toggleMinimizeChat()" style="background:transparent; border:none; color:#fff; cursor:pointer; font-size:14px;">—</button>
                    <button onclick="window.closePrivateChat()" style="background:transparent; border:none; color:#ff4c4c; cursor:pointer; font-size:14px;">✖</button>
                </div>
            </div>
            
            <div id="pm-body" style="display:flex; flex-direction:column; width:100%;">
                <div id="pm-messages" style="height:250px; overflow-y:auto; padding:10px; display:flex; flex-direction:column; gap:8px; font-size:12px; position:relative;"></div>
                
                <div id="pm-emoji-picker" style="display:none; position:absolute; bottom:55px; left:10px; background:#161b22; border:1px solid #30363d; border-radius:6px; padding:8px; width:220px; flex-wrap:wrap; gap:5px; z-index:1001;">
                    ${emojiHtml}
                </div>

                <div id="pm-item-picker" style="display:none; position:absolute; bottom:55px; left:10px; background:#161b22; border:1px solid #30363d; border-radius:6px; padding:8px; width:260px; max-height:180px; overflow-y:auto; flex-direction:column; gap:5px; z-index:1001;">
                </div>
                
                <div style="padding:10px; border-top:1px solid #30363d; display:flex; gap:5px; align-items:center;">
                    <button id="pm-emoji-toggle" style="background:transparent; border:none; cursor:pointer; font-size:18px; padding:0 2px;">😀</button>
                    <button id="pm-item-toggle" style="background:transparent; border:none; cursor:pointer; font-size:18px; padding:0 2px;" title="Kirim Item">🎁</button>
                    <input type="text" id="pm-input" placeholder="Tulis pesan..." style="flex:1; padding:8px; background:#010409; color:white; border:1px solid #30363d; border-radius:4px; outline:none;">
                    <button id="pm-send-btn" style="background:#238636; color:white; border:none; padding:8px 12px; border-radius:4px; cursor:pointer; font-weight:bold;">Kirim</button>
                </div>
            </div>
        `;
        document.body.appendChild(chatModal);

        // DRAG & DROP LOGIC
        const dragHandle = chatModal.querySelector('#pm-drag-handle');
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

        dragHandle.onmousedown = function (e) {
            if (chatModal.getAttribute('data-state') === 'minimized') return;
            if (e.target.tagName === 'BUTTON') return;
            e.preventDefault();
            pos3 = e.clientX; pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
            dragHandle.style.cursor = 'grabbing';
            chatModal.style.transition = 'none';
        };
        function elementDrag(e) {
            e.preventDefault();
            pos1 = pos3 - e.clientX; pos2 = pos4 - e.clientY;
            pos3 = e.clientX; pos4 = e.clientY;
            chatModal.style.top = (chatModal.offsetTop - pos2) + "px";
            chatModal.style.left = (chatModal.offsetLeft - pos1) + "px";
        }
        function closeDragElement() {
            document.onmouseup = null; document.onmousemove = null;
            if (chatModal.getAttribute('data-state') !== 'minimized') dragHandle.style.cursor = 'grab';
            chatModal.style.transition = 'width 0.2s, top 0.2s, left 0.2s, bottom 0.2s, right 0.2s';
        }

        dragHandle.onclick = function (e) {
            if (e.target.tagName === 'BUTTON') return;
            if (chatModal.getAttribute('data-state') === 'minimized') window.toggleMinimizeChat();
        };

        // EMOJI & ITEM TOGGLE LOGIC
        const emojiToggle = chatModal.querySelector('#pm-emoji-toggle');
        const emojiPicker = chatModal.querySelector('#pm-emoji-picker');
        const itemToggle = chatModal.querySelector('#pm-item-toggle');
        const itemPicker = chatModal.querySelector('#pm-item-picker');
        const inputField = chatModal.querySelector('#pm-input');

        emojiToggle.onclick = () => {
            itemPicker.style.display = 'none';
            emojiPicker.style.display = emojiPicker.style.display === 'none' ? 'flex' : 'none';
        };

        chatModal.querySelectorAll('.pm-emoji-btn').forEach(btn => {
            btn.onclick = (e) => {
                inputField.value += e.target.innerText;
                emojiPicker.style.display = 'none';
                inputField.focus();
            };
        });

        itemToggle.onclick = () => {
            emojiPicker.style.display = 'none';
            if (itemPicker.style.display === 'flex') {
                itemPicker.style.display = 'none';
                return;
            }
            itemPicker.style.display = 'flex';

            const inv = window.currentInventoryData || {};
            const itemKeys = Object.keys(inv).filter(k => inv[k] > 0);

            if (itemKeys.length === 0) {
                itemPicker.innerHTML = `<div style="text-align:center; color:#aaa;">Tas Anda Kosong.</div>`;
                return;
            }

            let invHtml = `<div style="font-weight:bold; color:#ffca28; margin-bottom:5px; text-align:center;">Pilih Item untuk Dikirim</div>`;
            itemKeys.forEach(itemName => {
                invHtml += `
                    <div style="display:flex; justify-content:space-between; align-items:center; background:#0d1117; padding:5px; border-radius:4px; border:1px solid #30363d;">
                        <span style="color:white; font-size:12px;">${itemName} (x${inv[itemName]})</span>
                        <button onclick="window.processSendItem('${targetUid}', '${itemName}', ${inv[itemName]})" style="background:#0366d6; color:white; border:none; padding:3px 6px; border-radius:3px; cursor:pointer; font-size:11px;">Kirim</button>
                    </div>
                `;
            });
            itemPicker.innerHTML = invHtml;
        };
    }

    // Simpan UID target dan Chat ID di elemen modal untuk keperluan minimize/maximize
    chatModal.setAttribute('data-target-uid', targetUid);
    chatModal.setAttribute('data-chat-id', chatId);

    if (chatModal.getAttribute('data-state') === 'minimized') window.toggleMinimizeChat();

    document.getElementById('pm-target-name').innerText = targetName;
    chatModal.style.display = 'flex';
    document.getElementById('pm-emoji-picker').style.display = 'none';
    document.getElementById('pm-item-picker').style.display = 'none';

    // FIREBASE LOGIC & RENDER PESAN
    const msgContainer = document.getElementById('pm-messages');
    msgContainer.innerHTML = '<div style="color:#aaa; text-align:center;">Memuat pesan...</div>';

    import('https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js').then((firestore) => {
        const { collection, query, orderBy, onSnapshot, addDoc, doc, getDoc, updateDoc } = firestore;

        // Matikan saklar badge pesan baru di akun kita saat chat dibuka
        updateDoc(doc(db, "users", currentUserUid), {
            [`unreadMessages.${targetUid}`]: false
        }).catch(err => console.log("Gagal menghapus badge:", err));

        window.processSendItem = async function (tUid, itemName, maxAmount) {
            const amountStr = prompt(`Berapa banyak ${itemName} yang ingin dikirim? (Maks: ${maxAmount})`, "1");
            if (!amountStr) return;
            const amount = parseInt(amountStr);
            if (isNaN(amount) || amount <= 0 || amount > maxAmount) return window.rpgAlert("Jumlah tidak valid!");

            try {
                const userRef = doc(db, "users", currentUserUid);
                const userSnap = await getDoc(userRef);
                let currentInv = userSnap.data().inventory || {};

                if (!currentInv[itemName] || currentInv[itemName] < amount) return window.rpgAlert("Item tidak mencukupi!");

                currentInv[itemName] -= amount;
                if (currentInv[itemName] <= 0) delete currentInv[itemName];
                await updateDoc(userRef, { inventory: currentInv });

                await addDoc(collection(db, "privateChats", chatId, "messages"), {
                    senderUid: currentUserUid,
                    senderName: playerUsername,
                    type: "gift",
                    gift: { name: itemName, amount: amount },
                    isClaimed: false,
                    isRead: false, // Status Centang Biru
                    timestamp: Date.now()
                });

                updateDoc(doc(db, "users", tUid), { [`unreadMessages.${currentUserUid}`]: true }).catch(err => console.log(err));
                document.getElementById('pm-item-picker').style.display = 'none';
            } catch (err) { console.error(err); window.rpgAlert("Gagal mengirim item."); }
        };

        const q = query(collection(db, "privateChats", chatId, "messages"), orderBy("timestamp", "asc"));
        if (unsubPrivateChat) unsubPrivateChat();
        let isFirstLoad = true;

        unsubPrivateChat = onSnapshot(q, (snapshot) => {
            msgContainer.innerHTML = '';
            if (snapshot.empty) msgContainer.innerHTML = '<div style="color:#aaa; text-align:center;">Belum ada pesan. Sapa temanmu!</div>';

            let unreadDocsToUpdate = [];

            snapshot.forEach((docSnap) => {
                const msg = docSnap.data();
                const isMe = msg.senderUid === currentUserUid;

                // Jika pesan dari teman belum dibaca dan jendela kita sedang terbuka lebar (maximized), tandai sebagai terbaca
                if (!isMe && msg.isRead === false) {
                    const modalState = document.getElementById('modal-private-chat').getAttribute('data-state');
                    if (modalState === 'maximized') {
                        unreadDocsToUpdate.push(docSnap.ref);
                    }
                }

                // 🌟 FORMAT TANGGAL DAN WAKTU (Contoh: 27 Jun, 13:51)
                const dateObj = new Date(msg.timestamp);
                const timeString = dateObj.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

                // 🌟 LOGIKA CENTANG BIRU (Read Receipt)
                // Jika isMe (pesan kita), cek status isRead. Jika true: centang dua biru, jika false: centang satu abu
                const readIcon = isMe ? (msg.isRead ? `<span style="color:#58a6ff; margin-left:4px; font-size:10px;">✔✔</span>` : `<span style="color:#aaa; margin-left:4px; font-size:10px;">✔</span>`) : '';

                let contentHtml = "";
                if (msg.type === "gift") {
                    const isClaimed = msg.isClaimed;
                    if (isMe) {
                        contentHtml = `
                            <div style="border:1px dashed #e3b341; background:rgba(227,179,65,0.1); padding:8px; border-radius:4px; text-align:center;">
                                <div style="font-size:16px;">🎁</div>
                                Mengirim <b>${msg.gift.amount}x ${msg.gift.name}</b><br>
                                <span style="font-size:10px; color:${isClaimed ? '#a6e3a1' : '#aaa'};">${isClaimed ? '✔ Telah Diambil' : 'Menunggu Diambil...'}</span>
                            </div>`;
                    } else {
                        if (isClaimed) {
                            contentHtml = `
                                <div style="border:1px dashed #58a6ff; background:rgba(88,166,255,0.1); padding:8px; border-radius:4px; text-align:center; color:#aaa;">
                                    🎁 <b>${msg.gift.amount}x ${msg.gift.name}</b><br><span style="font-size:10px;">(Telah Anda Ambil)</span>
                                </div>`;
                        } else {
                            contentHtml = `
                                <div style="border:1px dashed #2ea043; background:rgba(46,160,67,0.1); padding:8px; border-radius:4px; text-align:center;">
                                    <div style="font-size:16px;">🎁</div>
                                    <b>${msg.gift.amount}x ${msg.gift.name}</b><br>
                                    <button onclick="window.claimChatGift('${chatId}', '${docSnap.id}')" style="margin-top:5px; background:#2ea043; color:white; border:none; padding:4px 8px; border-radius:3px; cursor:pointer; font-weight:bold; width:100%;">Ambil Item</button>
                                </div>`;
                        }
                    }
                } else {
                    contentHtml = `<span style="color:white; font-size:13px;">${msg.text}</span>`;
                }

                msgContainer.innerHTML += `
                    <div style="align-self: ${isMe ? 'flex-end' : 'flex-start'}; background: ${isMe ? '#238636' : '#1f2428'}; padding:6px 10px; border-radius:8px; max-width:80%; word-wrap:break-word; box-shadow:0 2px 5px rgba(0,0,0,0.2);">
                        ${contentHtml}
                        <div style="font-size:9px; color:${isMe ? '#a6e3a1' : '#aaa'}; display:flex; justify-content:${isMe ? 'flex-end' : 'flex-start'}; align-items:center; margin-top:4px;">
                            <span>${timeString}</span> ${readIcon}
                        </div>
                    </div>
                `;
            });

            // Eksekusi update "Sudah Dibaca" ke database (Trigger centang biru di layar lawan)
            unreadDocsToUpdate.forEach(ref => updateDoc(ref, { isRead: true }).catch(e => console.log(e)));

            if (!isFirstLoad) {
                snapshot.docChanges().forEach((change) => {
                    if (change.type === "added" && change.doc.data().senderUid !== currentUserUid) {
                        const modalState = document.getElementById('modal-private-chat').getAttribute('data-state');
                        if (modalState === 'minimized') document.getElementById('pm-drag-handle').classList.add('pm-alert');
                    }
                });
            }
            isFirstLoad = false;
            msgContainer.scrollTop = msgContainer.scrollHeight;
        });

        const sendBtn = document.getElementById('pm-send-btn');
        const inputField = document.getElementById('pm-input');
        const newSendBtn = sendBtn.cloneNode(true);
        sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);

        newSendBtn.addEventListener('click', async () => {
            const text = inputField.value.trim();
            if (!text) return;
            inputField.value = '';
            document.getElementById('pm-emoji-picker').style.display = 'none';
            document.getElementById('pm-item-picker').style.display = 'none';

            await addDoc(collection(db, "privateChats", chatId, "messages"), {
                senderUid: currentUserUid,
                senderName: playerUsername,
                type: "text",
                text: text,
                isRead: false, // Status Centang Biru
                timestamp: Date.now()
            });

            updateDoc(doc(db, "users", targetUid), { [`unreadMessages.${currentUserUid}`]: true }).catch(err => console.log(err));
        });

        inputField.onkeypress = function (e) { if (e.key === 'Enter') newSendBtn.click(); };
    });
};

window.toggleMinimizeChat = function () {
    const chatModal = document.getElementById('modal-private-chat');
    if (!chatModal) return;

    const state = chatModal.getAttribute('data-state');
    const body = document.getElementById('pm-body');
    const dragHandle = document.getElementById('pm-drag-handle');

    if (state === 'maximized') {
        chatModal.setAttribute('data-last-top', chatModal.style.top);
        chatModal.setAttribute('data-last-left', chatModal.style.left);

        body.style.display = 'none';
        chatModal.style.top = 'auto'; chatModal.style.left = 'auto';
        chatModal.style.bottom = '10px'; chatModal.style.right = '10px';
        chatModal.style.width = '200px';
        chatModal.setAttribute('data-state', 'minimized');

        dragHandle.style.cursor = 'pointer';
        dragHandle.title = "Klik untuk membuka pesan";
    } else {
        body.style.display = 'flex';
        chatModal.style.bottom = 'auto'; chatModal.style.right = 'auto';
        chatModal.style.top = chatModal.getAttribute('data-last-top') || '20%';
        chatModal.style.left = chatModal.getAttribute('data-last-left') || '30%';
        chatModal.style.width = '300px';
        chatModal.setAttribute('data-state', 'maximized');

        dragHandle.classList.remove('pm-alert');
        dragHandle.style.cursor = 'grab';
        dragHandle.title = "";

        const msgContainer = document.getElementById('pm-messages');
        msgContainer.scrollTop = msgContainer.scrollHeight;

        // 🌟 KODE BARU: Saat jendela di-maximize, matikan notifikasi badge dan picu baca pesan
        const tUid = chatModal.getAttribute('data-target-uid');
        const cId = chatModal.getAttribute('data-chat-id');
        if (tUid && cId) {
            import('https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js').then(async ({ doc, updateDoc, collection, query, where, getDocs }) => {
                // Hapus badge merah di tombol
                updateDoc(doc(db, "users", currentUserUid), { [`unreadMessages.${tUid}`]: false }).catch(e => console.log(e));

                // Cari pesan yang belum dibaca dan ubah jadi terbaca (Memicu centang biru di layar teman)
                const qUnread = query(collection(db, "privateChats", cId, "messages"), where("isRead", "==", false));
                const snaps = await getDocs(qUnread);
                snaps.forEach(d => {
                    if (d.data().senderUid === tUid) updateDoc(d.ref, { isRead: true });
                });
            });
        }
    }
};

window.closePrivateChat = function () {
    const chatModal = document.getElementById('modal-private-chat');
    if (chatModal) chatModal.style.display = 'none';
    if (unsubPrivateChat) {
        unsubPrivateChat();
        unsubPrivateChat = null;
    }
};

// --- SISTEM KLAIM HADIAH CHAT ---
window.claimChatGift = async function (chatId, msgId) {
    try {
        const { doc, getDoc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js');

        // 1. Cek status pesan hadiah
        const msgRef = doc(db, "privateChats", chatId, "messages", msgId);
        const msgSnap = await getDoc(msgRef);
        if (!msgSnap.exists()) return window.rpgAlert("Pesan tidak ditemukan!");

        const msgData = msgSnap.data();
        if (msgData.isClaimed) return window.rpgAlert("Hadiah ini sudah diambil!");
        if (msgData.senderUid === currentUserUid) return window.rpgAlert("Anda tidak bisa mengklaim hadiah sendiri!");

        // 2. Tambahkan item ke inventory penerima (Anda)
        const userRef = doc(db, "users", currentUserUid);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.data();

        let currentInv = userData.inventory || {};
        const itemName = msgData.gift.name;
        const itemAmount = msgData.gift.amount;

        currentInv[itemName] = (currentInv[itemName] || 0) + itemAmount;

        // 3. Update database: Tas bertambah & Pesan jadi 'Claimed'
        await updateDoc(userRef, { inventory: currentInv });
        await updateDoc(msgRef, { isClaimed: true });

        window.rpgAlert(`Berhasil mengambil ${itemAmount}x ${itemName}!`, "Hadiah Diterima");
    } catch (err) {
        console.error("Gagal klaim hadiah:", err);
        window.rpgAlert("Terjadi kesalahan saat mengambil hadiah.");
    }
};

// Pastikan fungsi aksi terpasang ke window agar bisa dipanggil dari HTML
window.craftItemAction = craftItemAction;

// ===================================================
// SISTEM RENDER UI CRAFTING (VERSI BEBAS BENTROK)
// ===================================================

window.renderCraftingUI = function (playerInvData, playerLevel, playerGold) {
    const grid = document.getElementById('crafting-recipe-grid');
    if (!grid) return;
    if (typeof CRAFTING_RECIPES === 'undefined') return;

    window._craftingCache = { inv: playerInvData || {}, lvl: playerLevel || 1, gold: playerGold || 0 };

    let html = "";

    for (const recipeName in CRAFTING_RECIPES) {
        const recipe = CRAFTING_RECIPES[recipeName];
        const itemName = recipe.resultItem;

        let iconHtml = "📦";
        try {
            iconHtml = (typeof getIconHTML === 'function') ? getIconHTML(itemName) : window.getIconHTML(itemName);
        } catch (e) { }

        // KITA HAPUS KOTAK BUATAN. Cukup gunakan pembungkus transparan agar ikon asli Anda bebas bernapas!
        html += `
        <div title="${recipeName}" 
             onclick="window.showCraftingDetails('${recipeName}')"
             style="cursor: pointer; display: inline-block; margin: 2px; transition: 0.2s; filter: drop-shadow(0 0 2px rgba(0,0,0,0.5));"
             onmouseover="this.style.filter='drop-shadow(0 0 6px #ffca28)'"
             onmouseout="this.style.filter='drop-shadow(0 0 2px rgba(0,0,0,0.5))'">
             ${iconHtml}
        </div>`;
    }

    grid.innerHTML = html;

    const activeRecipe = document.getElementById('crafting-details').getAttribute('data-active-recipe');
    if (activeRecipe && CRAFTING_RECIPES[activeRecipe]) {
        window.showCraftingDetails(activeRecipe);
    }
};

window.showCraftingDetails = function (recipeName) {
    const detailsContainer = document.getElementById('crafting-details');
    if (!detailsContainer) return;

    detailsContainer.setAttribute('data-active-recipe', recipeName);

    const recipe = CRAFTING_RECIPES[recipeName];
    if (!recipe) return;

    const cache = window._craftingCache || { inv: {}, lvl: 1, gold: 0 };
    const playerInvData = cache.inv;
    const playerLevel = cache.lvl;
    const playerGold = cache.gold;

    const safeGetIcon = (name) => {
        try { return (typeof getIconHTML === 'function') ? getIconHTML(name) : window.getIconHTML(name); }
        catch (e) { return "📦"; }
    };

    let mainIconHtml = safeGetIcon(recipe.resultItem);
    let matsHtml = "";

    for (const [matName, qtyNeeded] of Object.entries(recipe.materials)) {
        const playerHas = playerInvData[matName] || 0;
        const qtyColor = playerHas >= qtyNeeded ? "#a6e3a1" : "#ff4c4c";
        let matIconHtml = safeGetIcon(matName);

        // Angka material kini diposisikan mengambang indah di atas ikon asli Anda
        matsHtml += `
            <div title="${matName}" style="position: relative; display: inline-block; margin: 0 4px;">
                ${matIconHtml}
                <div style="position: absolute; bottom: -5px; right: -5px; font-size: 11px; font-weight: bold; color: ${qtyColor}; background: rgba(0,0,0,0.85); padding: 2px 5px; border-radius: 4px; border: 1px solid #444; z-index: 10;">
                    ${playerHas}/${qtyNeeded}
                </div>
            </div>
        `;
    }

    const lvlColor = playerLevel >= recipe.reqLevel ? "#fff" : "#ff4c4c";
    const goldColor = playerGold >= recipe.reqGold ? "#ffca28" : "#ff4c4c";

    detailsContainer.innerHTML = `
        <div title="${recipeName}" style="margin-bottom: 20px; display: flex; justify-content: center; align-items: center; filter: drop-shadow(0 0 10px rgba(255, 202, 40, 0.4));">
            <div style="transform: scale(1.3); pointer-events: none;">
                ${mainIconHtml}
            </div>
        </div>
        
        <h4 style="color: #ffca28; margin: 0 0 10px 0;">${recipeName}</h4>
        
        <div style="display: flex; gap: 10px; margin-bottom: 15px;">
            <div style="font-size: 11px; background: #1f2428; padding: 4px 10px; border-radius: 3px; border: 1px solid #444; color: ${lvlColor};">🎯 Lv.${recipe.reqLevel}</div>
            <div style="font-size: 11px; background: #1f2428; padding: 4px 10px; border-radius: 3px; border: 1px solid #444; color: ${goldColor};">💰 ${recipe.reqGold.toLocaleString()}</div>
        </div>

        <div style="font-size: 11px; color: #aaa; margin-bottom: 12px;">Dibutuhkan:</div>
        <div style="display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; margin-bottom: 20px;">
            ${matsHtml}
        </div>

        <button onclick="window.craftItemAction(db, currentUserUid, '${recipeName}')" 
                style="background: #238636; color: white; border: none; padding: 10px 20px; border-radius: 4px; font-weight: bold; cursor: pointer; width: 90%; transition: 0.2s; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">
            ⚒️ TEMPA SEKARANG
        </button>
    `;
};

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

// ==========================================
// SISTEM DATABASE MONSTER DINAMIS (FIRESTORE)
// ==========================================

// 1. Fungsi untuk mengambil data monster sebelum bertarung
window.fetchMonsterData = async function (monsterId) {
    try {
        const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
        const docRef = doc(db, "monsters", monsterId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            return docSnap.data(); // Mengembalikan data dari Firestore
        } else {
            console.warn(`[SISTEM] Monster ID: ${monsterId} tidak ditemukan di Live Database.`);
            // Fallback (Cadangan): Jika admin belum melakukan Sync, ambil dari file lokal
            if (typeof MONSTER_DB !== 'undefined' && MONSTER_DB[monsterId]) {
                return MONSTER_DB[monsterId];
            }
            return null;
        }
    } catch (error) {
        console.error("Gagal menarik data monster:", error);
        return null;
    }
};

// 2. Fungsi RNG untuk memproses Drop Item sesuai persentase Admin
window.calculateMonsterDrops = function (dropsArray) {
    let obtainedItems = [];
    if (!dropsArray || dropsArray.length === 0) return obtainedItems;

    // Loop setiap item yang diatur oleh Admin
    dropsArray.forEach(drop => {
        // Hasilkan angka acak dari 0.00 hingga 100.00
        const roll = Math.random() * 100;

        // Jika angka acak lebih kecil atau sama dengan persentase drop admin, pemain dapat itemnya!
        if (roll <= drop.chance) {
            obtainedItems.push(drop.item);
        }
    });

    return obtainedItems; // Mengembalikan array nama item (contoh: ["Ramuan HP", "Pedang Besi"])
};

// 3. Fungsi untuk memuat daftar monster ke UI Dropdown Dungeon
window.loadDungeonMonstersList = async function () {
    const selectBox = document.getElementById('dungeon-select');
    if (!selectBox) return;

    try {
        const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
        const querySnapshot = await getDocs(collection(db, "monsters"));

        if (querySnapshot.empty) {
            selectBox.innerHTML = '<option value="">❌ Belum ada monster di database</option>';
            return;
        }

        // Tampung data ke dalam array agar bisa kita urutkan
        let monstersArray = [];
        querySnapshot.forEach(doc => {
            const data = doc.data();
            const id = doc.id;

            // 🔥 LOGIKA PENYARINGAN (FILTER): Deteksi dan abaikan Boss Fuben
            const isFubenBoss = id.startsWith("fb") || (data.name && data.name.includes("[FB"));

            // Masukkan ke daftar HANYA jika bukan Boss Fuben
            if (!isFubenBoss) {
                monstersArray.push({ id: id, ...data });
            }
        });

        // Urutkan monster berdasarkan Level (dari terkecil ke terbesar) agar progresi rapi
        monstersArray.sort((a, b) => (a.levelReq || 1) - (b.levelReq || 1));

        // Bersihkan tulisan "Memuat..." dan masukkan data asli
        selectBox.innerHTML = '';
        monstersArray.forEach(m => {
            const levelText = m.levelReq ? `(Lv. ${m.levelReq})` : '';
            // Tampilkan Nama, Level, dan Rekomendasi HP
            selectBox.innerHTML += `<option value="${m.id}">💀 ${m.name} ${levelText} - HP: ${m.hp}</option>`;
        });

    } catch (err) {
        console.error("Gagal memuat daftar monster untuk UI:", err);
        selectBox.innerHTML = '<option value="">⚠️ Gagal terhubung ke server</option>';
    }
};

// ==========================================
// SISTEM KLAIM KODE REDEEM (GIFT CODE)
// ==========================================
window.claimGiftCode = async function () {
    const inputEl = document.getElementById('input-redeem-code');
    if (!inputEl) return;

    let codeName = inputEl.value.trim().toUpperCase();
    codeName = codeName.replace(/\s+/g, ''); // Hapus spasi jika pemain tidak sengaja mengetiknya

    if (!codeName) return window.rpgAlert("❌ Silakan masukkan kode redeem terlebih dahulu!");

    // Konfirmasi Firebase Firestore (Pastikan import runTransaction dan doc sudah ada di atas file)
    const { runTransaction, doc } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");

    try {
        // Mengubah kursor jadi loading agar pemain tidak klik berkali-kali
        inputEl.disabled = true;

        await runTransaction(db, async (transaction) => {
            const codeRef = doc(db, "giftCodes", codeName);
            const userRef = doc(db, "users", currentUserUid); // Pastikan variabel currentUserUid milik Anda benar

            const codeSnap = await transaction.get(codeRef);
            if (!codeSnap.exists()) {
                throw new Error("❌ Kode tidak valid atau tidak ditemukan.");
            }

            const codeData = codeSnap.data();
            const claimedArray = codeData.claimedBy || [];

            // 1. Cek apakah pemain sudah pernah mengklaim kode ini
            if (claimedArray.includes(currentUserUid)) {
                throw new Error("⚠️ Anda sudah pernah menukarkan kode ini!");
            }

            // 2. Cek apakah kuota kode sudah habis
            if (claimedArray.length >= codeData.limit) {
                throw new Error("😭 Yah, kuota untuk kode ini sudah habis diklaim pemain lain.");
            }

            // 3. Ambil data pemain saat ini
            const userSnap = await transaction.get(userRef);
            if (!userSnap.exists()) throw new Error("Gagal membaca data pemain.");
            const userData = userSnap.data();

            // 4. Proses pemberian hadiah
            let newGold = (userData.gold || 0) + (codeData.gold || 0);
            let newCoin = (userData.coin || 0) + (codeData.coin || 0);
            let newInv = userData.inventory || {};

            let rewardMsg = [];
            if (codeData.gold > 0) rewardMsg.push(`💰 ${codeData.gold.toLocaleString()} Gold`);
            if (codeData.coin > 0) rewardMsg.push(`🪙 ${codeData.coin.toLocaleString()} Coin`);

            if (codeData.itemName && codeData.itemQty > 0) {
                newInv[codeData.itemName] = (newInv[codeData.itemName] || 0) + codeData.itemQty;
                rewardMsg.push(`📦 ${codeData.itemName} (x${codeData.itemQty})`);
            }

            // 5. Update array claimedBy di dokumen kode (Tambahkan UID pemain ke daftar)
            claimedArray.push(currentUserUid);
            transaction.update(codeRef, { claimedBy: claimedArray });

            // 6. Update data pemain (Berikan hadiahnya)
            transaction.update(userRef, {
                gold: newGold,
                coin: newCoin,
                inventory: newInv
            });

            // Simpan pesan sukses untuk ditampilkan setelah transaksi selesai
            window._tempGiftRewardMsg = `🎉 SELAMAT! Anda berhasil menukarkan kode.\n\nMendapatkan:\n${rewardMsg.join('\n')}`;
        });

        // Tampilkan pesan sukses dari transaksi
        window.rpgAlert(window._tempGiftRewardMsg, "Klaim Berhasil");
        inputEl.value = ""; // Kosongkan input

    } catch (err) {
        // Menangkap error dari validasi transaksi
        window.rpgAlert(err.message, "Gagal Klaim");
    } finally {
        inputEl.disabled = false;
    }
};

// ==========================================
// SISTEM TIKET BANTUAN (CUSTOMER SUPPORT)
// ==========================================
window.submitSupportTicket = async function () {
    const category = document.getElementById('ticket-category').value;
    const message = document.getElementById('ticket-message').value.trim();

    if (!message) return window.rpgAlert("Pesan laporan tidak boleh kosong!", "Peringatan");
    if (message.length < 10) return window.rpgAlert("Pesan terlalu singkat. Mohon jelaskan secara detail.", "Peringatan");

    const btn = document.querySelector('button[onclick="window.submitSupportTicket()"]');
    btn.disabled = true; btn.innerText = "⏳ Mengirim...";

    try {
        // Menggunakan addDoc & serverTimestamp langsung dari import Firestore Anda
        const { addDoc, collection, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");

        await addDoc(collection(db, "supportTickets"), {
            senderUid: window.currentUserUid,
            senderName: window.playerUsername,
            category: category,
            message: message,
            status: "open",
            timestamp: serverTimestamp()
        });

        window.rpgAlert("✅ Tiket berhasil dikirim ke Meja Admin! Jika ada kompensasi, Admin akan mengirimkannya ke Kotak Surat Anda.", "Laporan Terkirim");
        document.getElementById('ticket-message').value = "";
    } catch (err) {
        window.rpgAlert("Gagal mengirim tiket: " + err.message, "Error");
    } finally {
        btn.disabled = false; btn.innerText = "✉️ Kirim Tiket";
    }
};

window.listenToMyTickets = async function () {
    const listDiv = document.getElementById('my-ticket-list');
    if (!listDiv || !window.currentUserUid) return;

    const { query, collection, where, orderBy, onSnapshot } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");

    const q = query(collection(db, "supportTickets"), where("senderUid", "==", window.currentUserUid), orderBy("timestamp", "desc"));

    if (window.unsubMyTickets) window.unsubMyTickets();

    window.unsubMyTickets = onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            listDiv.innerHTML = `<div style="text-align: center; color: #aaa; padding: 15px; font-size: 12px; background: #1a1a24; border-radius: 4px;">Anda belum pernah membuat laporan bantuan.</div>`;
            return;
        }

        listDiv.innerHTML = "";
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const time = data.timestamp ? data.timestamp.toDate().toLocaleString('id-ID') : 'Baru saja';

            const isOpen = data.status === "open";
            const statusHtml = isOpen
                ? `<span style="background: #e67e22; color: #fff; font-size: 9px; padding: 2px 6px; border-radius: 3px; font-weight: bold;">⏳ Menunggu Admin</span>`
                : `<span style="background: #28a745; color: #fff; font-size: 9px; padding: 2px 6px; border-radius: 3px; font-weight: bold;">✅ Selesai</span>`;

            let adminReplyHtml = "";
            if (!isOpen && data.adminReply) {
                adminReplyHtml = `<div style="margin-top: 8px; padding: 8px; background: #121216; border-left: 3px solid #28a745; font-size: 11px; color: #a6e3a1; font-style: italic;">Admin: "${data.adminReply}"</div>`;
            }

            let catColor = "#00d2ff";
            if (data.category === "BUG") catColor = "#dc3545";
            if (data.category === "REPORT") catColor = "#ffca28";

            listDiv.innerHTML += `
                <div style="background: #1a1a24; padding: 10px; border-radius: 4px; border-left: 3px solid ${catColor}; border-bottom: 1px solid #333; margin-bottom: 8px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px; align-items: center;">
                        <span style="color: ${catColor}; font-size: 11px; font-weight: bold;">[${data.category}]</span>
                        ${statusHtml}
                    </div>
                    <div style="color: #ccc; font-size: 12px; margin-bottom: 5px;">"${data.message}"</div>
                    <div style="color: #777; font-size: 10px;">Dibuat: ${time}</div>
                    ${adminReplyHtml}
                </div>
            `;
        });
    });
};

// Tempat menyimpan data item dari Cloud
window.CLOUD_ITEM_DB = {};

// Fungsi untuk menarik semua item dari Firestore ke memori lokal pemain
window.loadCloudItems = async function (db) {
    try {
        const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
        const querySnapshot = await getDocs(collection(db, "items"));

        querySnapshot.forEach(doc => {
            window.CLOUD_ITEM_DB[doc.id] = doc.data();
        });

        console.log("🎒 Data Item Cloud berhasil dimuat ke memori pemain!");

        // 🔥 PERBAIKAN: Paksa sistem menggambar ulang UI Tas dan Bank 
        // SETELAH data Cloud benar-benar selesai diunduh.
        if (typeof window.renderInventoryUI === 'function' && window.currentInventoryData) {
            window.renderInventoryUI(window.currentInventoryData);
        }

        // (Opsional) Panggil ulang fungsi update utama game Anda jika ada
        if (typeof window.updateUI === 'function') {
            window.updateUI();
        }

    } catch (err) {
        console.error("Gagal menarik data item dari Cloud:", err);
    }
};

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