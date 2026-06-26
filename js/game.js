import { db, auth } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, getDoc, updateDoc, onSnapshot, runTransaction, collection, getDocs, query, where, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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
import { listenToAuction, listAuctionItem, buyAuctionItem, placeBid, acceptBid, rejectBid, cancelAuction } from './modules/auction.js';
import { listenToParties, createOrJoinParty, leaveParty, startFbBattle } from './modules/party.js';
import { getUpdatedQuests } from './modules/quest.js';
import './modules/quest.js';
import { listenToGuilds, createGuild, joinGuild, leaveGuild as dbLeaveGuild, donateGold, upgradeGuild, updateMotd, kickMember, disbandGuild } from './modules/guild.js';
import { listenToMailbox, claimMailReward, deleteMail } from './modules/mailbox.js';
import { dismantleItemAction, DISMANTLE_CONFIG, craftItemAction } from './modules/crafting.js';
import { ITEM_DB } from './data/items.js';
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

        // --- RENDER SISTEM PERTEMANAN ---
        const friends = d.friends || {};
        const reqs = d.friendRequests || {};

        // Render Daftar Teman
        let fHtml = "";
        for (let uid in friends) {
            fHtml += `<div style="display:flex; justify-content:space-between; align-items:center; background:#161b22; padding:8px; margin-bottom:5px; border-radius:4px;">
                        <span><b style="color:#58a6ff;">${friends[uid].username}</b> (Lv.${friends[uid].level})</span>
                        <button onclick="window.delFriend('${uid}')" style="background:#dc3545; color:white; border:none; padding:4px 8px; border-radius:3px; cursor:pointer;">Hapus</button>
                      </div>`;
        }
        document.getElementById('tab-friend-list').innerHTML = fHtml || `<div style="text-align: center; color: #aaa; margin-top: 20px;">Belum ada teman.</div>`;

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

    // --- TOMBOL KATEGORI LEADERBOARD ---
    if (targetId === 'btn-lb-level') window.fetchLeaderboard('level');
    if (targetId === 'btn-lb-gold') window.fetchLeaderboard('gold');
    if (targetId === 'btn-lb-tower') window.fetchLeaderboard('tower');

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
window.handleInventoryClick = async function (itemName) {
    if (inventoryMode === "transfer" || inventoryMode === "TRANSFER") {
        window.putItemToTransferSlot(itemName);
        return;
    }

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
            if (await window.rpgConfirm("Gunakan Buku Reset Stats? Semua alokasi manual akan dikembalikan.", "Reset Stats")) equipFromInventory(db, currentUserUid, itemName, null);
        }
        else if (itemName === "Ramuan HP" || itemName === "Ramuan MP") {
            const sukses = await consumePotion(db, currentUserUid, itemName, currentPlayerStats.maxHp, currentPlayerStats.maxMp);
            if (sukses) window.rpgAlert(`Glug glug glug...\nAnda meminum [${itemName}]! Nyawa/Mana kembali penuh.`, "Berhasil Diteguk");
        }
        else { equipFromInventory(db, currentUserUid, itemName, null); }
    }
    else if (inventoryMode === "SELL") { sellItemToNPC(db, currentUserUid, itemName); }
    else if (inventoryMode === "BANK") {
        const qtyStr = await window.rpgPrompt(`Berapa banyak [${itemName}] yang ingin disimpan?`, "Simpan ke Bank", "number");
        const qty = parseInt(qtyStr);
        if (qty > 0) depositItem(db, currentUserUid, itemName, qty);
    }
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

window.activateBlacksmithMode = function () {
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

window.activateTransferMode = function () {
    const panelTransfer = document.getElementById('panel-refine-transfer');

    // LOGIKA MATIKAN (OFF): Jika diklik saat sedang aktif
    if (window.inventoryMode === 'waris') {
        window.inventoryMode = 'EQUIP'; // Kembalikan ke mode default (Pakai)

        if (panelTransfer) panelTransfer.style.display = 'none'; // Sembunyikan panel Waris

        // Kembalikan warna tombol Waris ke abu-abu
        const btnWaris = document.getElementById('btn-mode-transfer');
        if (btnWaris) btnWaris.style.background = '#495057';

        // Nyalakan kembali tombol Equip (Pakai) sebagai indikator default
        const btnEquip = document.getElementById('btn-mode-equip');
        if (btnEquip) {
            btnEquip.classList.add('mode-active');
            btnEquip.style.background = ''; // Menghapus style inline agar kembali ke CSS default
        }
        return; // Eksekusi berhenti di sini (Panel berhasil ditutup)
    }

    // LOGIKA NYALAKAN (ON): Jika diklik saat sedang mati
    window.inventoryMode = 'waris';

    // 1. Matikan dan ubah warna semua tombol menjadi abu-abu
    const modes = ['equip', 'sell', 'dismantle', 'bank', 'auction', 'blacksmith', 'crafting', 'transfer'];
    modes.forEach(m => {
        const btn = document.getElementById('btn-mode-' + m);
        if (btn) {
            btn.classList.remove('mode-active');
            btn.style.background = '#495057';
        }
    });

    // 2. Nyalakan hanya tombol WARIS menjadi aktif (misal: warna pink/ungu)
    const btnWarisActive = document.getElementById('btn-mode-transfer');
    if (btnWarisActive) {
        btnWarisActive.style.background = '#e83e8c';
    }

    // 3. Tampilkan panel Waris
    if (panelTransfer) {
        panelTransfer.style.display = 'block';
        panelTransfer.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // 4. Sembunyikan panel Pandai Besi & Crafting lain agar tidak tumpuk
    const panelBs = document.getElementById('panel-blacksmith');
    if (panelBs) panelBs.style.display = 'none';

    const panelCraft = document.getElementById('panel-crafting');
    if (panelCraft) panelCraft.style.display = 'none';
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
// SISTEM MODAL PEMBELIAN TOKO & MALL
// ==========================================
let currentBuyItem = null;
let currentBuyPrice = 0;
let currentBuyCurrency = 'Gold';

window.openBuyModal = function (itemName, price, currency) {
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
// SISTEM GLOBAL LEADERBOARD 
// ==========================================
window.fetchLeaderboard = async function (type) {
    const lbContent = document.getElementById('leaderboard-content');
    if (!lbContent) return;

    lbContent.innerHTML = '<div style="text-align:center; color:#aaa; margin-top:20px;">⏳ Memindai data seluruh pemain...</div>';

    try {
        const usersRef = collection(db, "users");
        const snap = await getDocs(usersRef);
        let usersData = [];

        snap.forEach(docSnap => {
            const d = docSnap.data();
            if (d.username) {
                usersData.push({
                    name: d.username,
                    level: d.level || 1,
                    gold: d.gold || 0,
                    class: d.characterClass || '-',
                    // PERUBAHAN: Tarik data lantai menara pemain (default: Lantai 1)
                    tower: d.towerFloor || 1
                });
            }
        });

        // Urutkan data berdasarkan tombol yang diklik
        if (type === 'level') usersData.sort((a, b) => b.level - a.level);
        if (type === 'gold') usersData.sort((a, b) => b.gold - a.gold);
        // PERUBAHAN: Urutkan berdasarkan lantai tertinggi
        if (type === 'tower') usersData.sort((a, b) => b.tower - a.tower);

        // Render HTML Tabel Leaderboard
        let html = '<table style="width:100%; border-collapse:collapse; font-size:12px; text-align:center;">';
        html += '<tr style="background:#222; color:#fff; border-bottom:2px solid #555;">';
        html += '<th style="padding:8px 5px;">Rank</th><th style="padding:8px 5px; text-align:left;">Nama</th><th style="padding:8px 5px;">Class</th><th style="padding:8px 5px;">Pencapaian</th></tr>';

        // Ambil maksimal Top 10
        for (let i = 0; i < Math.min(10, usersData.length); i++) {
            const u = usersData[i];
            let valStr = "";
            let valColor = "#fff";

            // Format angka dan ikon berdasar kategori
            if (type === 'level') { valStr = `Lv. ${u.level}`; valColor = '#00d2ff'; }
            if (type === 'gold') { valStr = `💰 ${u.gold.toLocaleString()}`; valColor = '#ffcc00'; }
            // PERUBAHAN: Format teks untuk Menara Ilusi
            if (type === 'tower') { valStr = `🗼 Lantai ${u.tower}`; valColor = '#e040fb'; }

            // Dekorasi Medali Top 3
            let rankColor = '#aaa';
            let rankIcon = `#${i + 1}`;
            if (i === 0) { rankColor = '#ffcc00'; rankIcon = '🥇 1'; }
            else if (i === 1) { rankColor = '#c0c0c0'; rankIcon = '🥈 2'; }
            else if (i === 2) { rankColor = '#cd7f32'; rankIcon = '🥉 3'; }

            html += `<tr style="border-bottom:1px solid #333; background: ${i % 2 === 0 ? '#1a1a24' : '#121216'}; transition:0.2s;">
                <td style="padding:8px 5px; color:${rankColor}; font-weight:bold; font-size:14px;">${rankIcon}</td>
                <td style="padding:8px 5px; color:#fff; font-weight:bold; text-align:left;">${window.escapeHTML ? window.escapeHTML(u.name) : u.name}</td>
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
    const targetUid = document.getElementById('input-add-friend').value.trim();
    if (!targetUid) return window.rpgAlert("Masukkan UID target!");
    try {
        await sendFriendRequest(db, currentUserUid, currentPlayerStats, targetUid);
        window.rpgAlert("Permintaan berhasil dikirim!", "Sukses");
        document.getElementById('input-add-friend').value = "";
    } catch (err) { window.rpgAlert(err, "Gagal"); }
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