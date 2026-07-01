import { db, auth } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, getDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Pemuatan Modul Inti UI dan Sistem Interaktif
import { loadUIComponents } from './ui-loader.js';
loadUIComponents();

// Import Fungsi Render UI
import { renderPlayerUI, renderInventoryUI, renderBankUI, renderMailboxUI, renderAuctionUI, renderPartyUI, renderGuildUI, renderChatUI, renderShopAndMall } from './modules/ui-renderer.js';
import { startStaminaRegeneration } from './modules/character.js';
import { listenToChat } from './modules/chat.js';
import { listenToAuction } from './modules/auction.js';
import { listenToParties } from './modules/party.js';
import { listenToGuilds } from './modules/guild.js';
import { listenToMailbox } from './modules/mailbox.js';
import { listenToCoinMarket } from './modules/coin-market.js';
import { listenToWorldBoss } from './modules/world-boss.js';
import { renderTowerUI } from './modules/tower.js';
import { renderExpeditionUI } from './modules/expedition.js';

// 🔥 PENGEMBALIAN IMPORT EKSEKUSI (SELF-EXECUTING MODULES) 🔥
import './modules/quest.js';
import './modules/coin-market.js';
import './modules/world-boss.js';
import './modules/tower.js';
import './modules/expedition.js';
import './modules/game-state.js';
import './modules/refine-transfer.js';
import './modules/inventory-modes.js';

// 🔥 IMPORT 4 MODUL BARU YANG TELAH DIPECAH 🔥
import './modules/system-ui.js';
import './modules/private-chat.js';
import './modules/pk-zone.js';
import './modules/action-routers.js';

window.inventoryMode = "EQUIP";
window.showScreen = function (screenId) {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    document.getElementById(screenId).style.display = 'block';
};

window.startDynamicChat = function () {
    if (window.unsubChatListener) window.unsubChatListener();
    let targetId = null;
    if (window.currentChatChannel === 'guild') targetId = window.currentPlayerStats.guildId;
    if (window.currentChatChannel === 'party') targetId = window.currentPartyId;
    window.unsubChatListener = listenToChat(db, window.currentChatChannel, targetId, (messages) => renderChatUI(messages, window.currentChatChannel));
};

window.updateMyLocation = function (locationName) {
    if (window.currentUserUid) updateDoc(doc(db, "users", window.currentUserUid), { currentLocation: locationName }).catch(e => console.error(e));
};

onAuthStateChanged(auth, async (user) => {
    if (user) {
        window.currentUserUid = user.uid;
        await loadUIComponents();

        const docSnap = await getDoc(doc(db, "users", window.currentUserUid));
        if (!docSnap.exists() || !docSnap.data().characterClass) {
            window.showScreen('screen-char-select');
        } else {
            window.showScreen('screen-game');
            renderShopAndMall();
            window.startLiveGameSync();
            
            if (window.staminaRegenInterval) clearInterval(window.staminaRegenInterval);
            window.staminaRegenInterval = startStaminaRegeneration(db, window.currentUserUid);

            updateDoc(doc(db, "users", window.currentUserUid), { lastActive: Date.now(), currentLocation: "Kota Aman (Idle)" }).catch(e => console.error(e));
            if (window.heartbeatInterval) clearInterval(window.heartbeatInterval);
            window.heartbeatInterval = setInterval(() => {
                if (window.currentUserUid) updateDoc(doc(db, "users", window.currentUserUid), { lastActive: Date.now() }).catch(e => console.log(e));
            }, 60000);

            window.addEventListener('beforeunload', () => {
                updateDoc(doc(db, "users", window.currentUserUid), { lastActive: 0, currentLocation: "Offline" });
            });
        }
    } else {
        if (window.heartbeatInterval) clearInterval(window.heartbeatInterval);
        if (window.currentUserUid) updateDoc(doc(db, "users", window.currentUserUid), { lastActive: 0, currentLocation: "Offline" }).catch(e => console.log(e));
        
        window.currentUserUid = null;
        if (window.staminaRegenInterval) clearInterval(window.staminaRegenInterval);
        if (window.activeUnsubscribeListeners) { window.activeUnsubscribeListeners.forEach(unsub => unsub()); window.activeUnsubscribeListeners = []; }
        if (window.unsubChatListener) window.unsubChatListener();
        window.showScreen('screen-auth');
    }
});

window.startLiveGameSync = function () {
    if (window.activeUnsubscribeListeners) window.activeUnsubscribeListeners.forEach(unsub => { if (typeof unsub === 'function') unsub(); });
    window.activeUnsubscribeListeners = [];

    const unsubGuilds = listenToGuilds(db, (guildsData, upgradesData) => {
        window.globalGuilds = guildsData; window.guildUpgradesMap = upgradesData;
        renderGuildUI(window.currentPlayerStats, window.globalGuilds, window.guildUpgradesMap);
    });

    const unsubData = onSnapshot(doc(db, "users", window.currentUserUid), (docSnap) => {
        if (!docSnap.exists()) return; const d = docSnap.data();

        if (d.banned === true) {
            document.body.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background-color: #0d1117; color: white; font-family: sans-serif; text-align: center; padding: 20px;">
                    <h1 style="color: #ff4c4c; margin-bottom: 10px;">🚫 AKSES DITOLAK</h1>
                    <p style="color: #ccc; margin-bottom: 30px; max-width: 400px;">Akun Anda diblokir oleh Administrator.<br>Hubungi dukungan jika ini adalah kesalahan.</p>
                    <button id="btn-banned-logout" style="padding: 12px 25px; background: #ff4c4c; color: white; border: none; border-radius: 4px; cursor: pointer;">Kembali ke Utama</button>
                </div>`;
            document.getElementById('btn-banned-logout').addEventListener('click', () => { signOut(auth).then(() => window.location.href = 'index.html'); });
            return;
        }

        let curLevel = d.level || 1; let curExp = d.exp || 0; let maxExp = curLevel * 100; let isLevelUp = false;
        while (curExp >= maxExp) { curExp -= maxExp; curLevel += 1; maxExp = curLevel * 100; isLevelUp = true; }
        if (isLevelUp) { updateDoc(doc(db, "users", window.currentUserUid), { level: curLevel, exp: curExp }); return; }

        window.playerUsername = d.username || "Hero Anonim";
        const baseTotal = d.characterClass === 'Warrior' ? 42 : 45; const expectedTotal = baseTotal + ((d.level || 1) - 1) * 5;
        const currentTotal = (d.str || 0) + (d.con || 0) + (d.dex || 0) + (d.int || 0) + (d.statPoints || 0);
        if (currentTotal < expectedTotal) { updateDoc(doc(db, "users", window.currentUserUid), { statPoints: (d.statPoints || 0) + (expectedTotal - currentTotal) }); return; }

        if (d.guildId && window.globalGuilds && window.globalGuilds[d.guildId]) {
            const myGuild = window.globalGuilds[d.guildId]; const myDataInGuild = myGuild.members.find(m => m.uid === window.currentUserUid);
            if (myDataInGuild && myDataInGuild.level !== (d.level || 1)) {
                const updatedMembers = myGuild.members.map(m => m.uid === window.currentUserUid ? { ...m, level: (d.level || 1) } : m);
                updateDoc(doc(db, "guilds", d.guildId), { members: updatedMembers });
            }
        }

        if (!d.guildId && window.currentChatChannel === 'guild') {
            window.currentChatChannel = 'world'; const sel = document.getElementById('chat-channel-select'); if (sel) sel.value = 'world'; window.startDynamicChat();
        }

        const elCmCoin = document.getElementById('cm-balance-coin'); const elCmGold = document.getElementById('cm-balance-gold');
        if (elCmCoin) elCmCoin.innerText = d.auctionBalanceCoin || 0; if (elCmGold) elCmGold.innerText = d.auctionBalanceGold || 0;

        const newStats = renderPlayerUI(d, window.currentUserUid, window.globalGuilds, window.guildUpgradesMap);
        if (newStats) window.currentPlayerStats = newStats;

        if (typeof window.renderQuestUI === 'function') window.renderQuestUI(d.quests);
        renderInventoryUI(d.inventory); renderBankUI(d.bankInventory);
        renderGuildUI(window.currentPlayerStats, window.globalGuilds, window.guildUpgradesMap);
        if (typeof window.renderCraftingUI === 'function') window.renderCraftingUI(d.inventory || {}, d.level || 1, d.gold || 0);
        renderTowerUI(d); renderExpeditionUI(d);

        // Render Live Teman
        const friends = d.friends || {}; const reqs = d.friendRequests || {}; const friendUids = Object.keys(friends);
        if (friendUids.length === 0) { document.getElementById('tab-friend-list').innerHTML = `<div style="text-align: center; color: #aaa; margin-top: 20px;">Belum ada teman.</div>`; } 
        else {
            const loadLiveFriends = async () => {
                let fHtml = "";
                for (let uid of friendUids) {
                    const fSnap = await getDoc(doc(db, "users", uid)); let isOnline = false; let loc = "Tidak diketahui";
                    if (fSnap.exists()) {
                        const fdata = fSnap.data(); const timeDiff = Date.now() - (fdata.lastActive || 0);
                        if (timeDiff < 120000 && (fdata.lastActive || 0) !== 0) { isOnline = true; loc = fdata.currentLocation || "Kota Aman (Idle)"; } 
                        else { isOnline = false; loc = "Offline"; }
                    }
                    const statusDot = isOnline ? `<span style="color:#28a745; text-shadow: 0 0 5px #28a745;">●</span>` : `<span style="color:#666;">●</span>`;
                    const locText = isOnline ? `<span style="font-size:10px; color:#ffca28;">📍 [${loc}]</span>` : `<span style="font-size:10px; color:#666;">[Offline]</span>`;
                    const hasUnread = (d.unreadMessages || {})[uid] === true;
                    const badgeHtml = hasUnread ? `<span style="background:#dc3545; color:white; border-radius:50%; padding:2px 6px; font-size:9px; position:absolute; top:-5px; right:-5px; font-weight:bold; box-shadow:0 0 5px red; animation:pm-blink 1s infinite;">!</span>` : '';
                    fHtml += `<div style="display:flex; justify-content:space-between; align-items:center; background:#161b22; padding:8px; margin-bottom:5px; border-radius:4px; border-left: 3px solid ${isOnline ? '#28a745' : '#444'};"><div style="display:flex; flex-direction:column;"><span>${statusDot} <b style="color:#58a6ff;">${friends[uid].username}</b> <span style="color:#aaa; font-size:12px;">(Lv.${friends[uid].level})</span></span>${locText}</div><div style="display:flex; gap: 5px;"><button onclick="window.openPrivateChat('${uid}', '${friends[uid].username}')" style="background:#0366d6; color:white; border:none; padding:4px 8px; border-radius:3px; cursor:pointer; position:relative;">💬 Pesan ${badgeHtml}</button><button onclick="window.delFriend('${uid}')" style="background:#dc3545; color:white; border:none; padding:4px 8px; border-radius:3px; cursor:pointer;">Hapus</button></div></div>`;
                }
                document.getElementById('tab-friend-list').innerHTML = fHtml;
            };
            loadLiveFriends();
        }

        let rHtml = ""; let reqCount = 0;
        for (let uid in reqs) {
            reqCount++; rHtml += `<div style="display:flex; flex-direction:column; background:#161b22; padding:8px; margin-bottom:5px; border-radius:4px;"><span style="margin-bottom:5px;"><b style="color:#ffca28;">${reqs[uid].username}</b> ingin berteman.</span><div style="display:flex; gap:5px;"><button onclick="window.accFriend('${uid}', '${reqs[uid].username}', ${reqs[uid].level})" style="flex:1; background:#28a745; color:white; border:none; padding:4px; border-radius:3px;">Terima</button><button onclick="window.rejFriend('${uid}')" style="flex:1; background:#dc3545; color:white; border:none; padding:4px; border-radius:3px;">Tolak</button></div></div>`;
        }
        document.getElementById('tab-friend-req').innerHTML = rHtml || `<div style="text-align: center; color: #aaa; margin-top: 20px;">Tidak ada permintaan.</div>`;
        const badge = document.getElementById('badge-friend-req'); if (badge) { badge.innerText = reqCount; badge.style.display = reqCount > 0 ? 'inline-block' : 'none'; }

        window.currentInventoryData = d.inventory || {};
        const elOwnedStone = document.getElementById('transfer-owned-stone');
        if (elOwnedStone) elOwnedStone.innerText = d.inventory && d.inventory['Universal Stone'] ? d.inventory['Universal Stone'] : 0;
        if (!window.unsubChatListener) window.startDynamicChat();
    });

    const unsubMail = listenToMailbox(db, window.currentUserUid, (mails) => {
        renderMailboxUI(mails); const badge = document.getElementById('mail-badge');
        if (badge) { if (mails && mails.length > 0) { badge.innerText = mails.length; badge.style.display = 'inline-block'; } else badge.style.display = 'none'; }
    });

    const unsubAuction = listenToAuction(db, (items) => renderAuctionUI(items, window.currentUserUid));
    const unsubParties = listenToParties(db, (parties) => {
        let myParty = parties.find(p => p.members.find(m => m.uid === window.currentUserUid));
        let newPartyId = myParty ? myParty.id : null;
        if (window.currentPartyId !== newPartyId) { window.currentPartyId = newPartyId; if (!window.currentPartyId && window.currentChatChannel === 'party') { window.currentChatChannel = 'world'; const sel = document.getElementById('chat-channel-select'); if (sel) sel.value = 'world'; window.startDynamicChat(); } }
        renderPartyUI(parties, window.currentUserUid);
    });

    const unsubCoinMarket = listenToCoinMarket(db, (items) => {
        const container = document.getElementById('cm-market-list'); if (!container) return;
        if (items.length === 0) { container.innerHTML = `<div style="text-align:center; color:#aaa; font-size:12px; margin-top:20px;">Pasar koin sedang kosong...</div>`; return; }
        container.innerHTML = items.map(item => {
            let actionButton = item.sellerUid === window.currentUserUid 
                ? `<button onclick="window.cmCancelSell('${item.id}')" style="background:#dc3545; color:#fff; border:none; border-radius:3px; padding:5px 10px; font-weight:bold; cursor:pointer;">BATAL</button>`
                : `<button onclick="window.cmBuyCoin('${item.id}', '${item.sellerUid}', ${item.amount}, ${item.price})" style="background:#28a745; color:#fff; border:none; border-radius:3px; padding:5px 10px; font-weight:bold; cursor:pointer;">BELI</button>`;
            return `<div style="background:#1a1a1a; border:1px solid #333; padding:10px; margin-bottom:5px; border-radius:5px; display:flex; justify-content:space-between; align-items:center;"><div><div style="font-weight:bold; color:#ffcc00;">🪙 ${item.amount} Coin</div><div style="font-size:11px; color:#aaa;">Dijual oleh: ${item.sellerName}</div></div><div style="text-align:right;"><div style="color:#ffd700; font-weight:bold; margin-bottom:5px;">💰 ${item.price} Gold</div>${actionButton}</div></div>`;
        }).join('');
    });

    const unsubBoss = listenToWorldBoss((bossData) => {
        if (!bossData) return;
        const bossNameEl = document.getElementById('wb-name'); if (bossNameEl) bossNameEl.innerText = bossData.name + (bossData.isActive ? " (AKTIF)" : " (MATI)");
        const hpBar = document.getElementById('wb-hp-bar'); const hpText = document.getElementById('wb-hp-text'); const btnAttack = document.getElementById('wb-btn-attack');
        
        if (bossData.maxHp && hpBar && hpText) {
            let pct = (bossData.currentHp / bossData.maxHp) * 100;
            hpBar.style.width = pct + "%"; hpText.innerText = `${bossData.currentHp.toLocaleString()} / ${bossData.maxHp.toLocaleString()} HP`;
        }

        let myRecord = bossData.participants && bossData.participants[window.currentUserUid] ? bossData.participants[window.currentUserUid] : null;
        let attackCount = myRecord ? (myRecord.attackCount || 0) : 0; let lastTime = myRecord ? (myRecord.lastAttackTime || 0) : 0;

        if (window.wbCooldownTimer) { clearInterval(window.wbCooldownTimer); window.wbCooldownTimer = null; }

        if (!bossData.isActive || bossData.currentHp <= 0) {
            if (btnAttack) { btnAttack.innerText = "BOSS TELAH MATI"; btnAttack.disabled = true; btnAttack.style.background = "#333"; btnAttack.style.borderColor = "#111"; }
        } else {
            if (btnAttack) {
                const now = Date.now(); const ONE_HOUR = 60 * 60 * 1000;
                if (attackCount >= 5) {
                    btnAttack.disabled = true; btnAttack.innerText = "Batas 5x Serangan Tercapai"; btnAttack.style.background = "#555"; btnAttack.style.borderColor = "#333";
                } else if (attackCount > 0 && (now - lastTime < ONE_HOUR)) {
                    btnAttack.disabled = true; btnAttack.style.background = "#b8860b"; btnAttack.style.borderColor = "#daa520";
                    const updateTimer = () => {
                        let sisaWaktu = ONE_HOUR - (Date.now() - lastTime);
                        if (sisaWaktu <= 0) { clearInterval(window.wbCooldownTimer); if (btnAttack) { btnAttack.disabled = false; btnAttack.innerText = `⚔️ SERANG BOSS! (${5 - attackCount}/5)`; btnAttack.style.background = "#8b0000"; btnAttack.style.borderColor = "#ff4c4c"; } } 
                        else {
                            let mStr = Math.floor(sisaWaktu / 60000).toString().padStart(2, '0'); let sStr = Math.floor((sisaWaktu % 60000) / 1000).toString().padStart(2, '0');
                            if (btnAttack) btnAttack.innerText = `⏳ Cooldown (${mStr}:${sStr})`;
                        }
                    };
                    updateTimer(); window.wbCooldownTimer = setInterval(updateTimer, 1000);
                } else {
                    btnAttack.disabled = false; btnAttack.innerText = `⚔️ SERANG BOSS! (${5 - attackCount}/5)`; btnAttack.style.background = "#8b0000"; btnAttack.style.borderColor = "#ff4c4c";
                }
            }
        }

        const lbContainer = document.getElementById('wb-leaderboard');
        if (lbContainer) {
            let participantsArr = Object.entries(bossData.participants || {}).map(([uid, data]) => ({ uid, name: data.name, damage: data.damage })).sort((a, b) => b.damage - a.damage);
            if (participantsArr.length > 0) lbContainer.innerHTML = participantsArr.slice(0, 5).map((p, index) => `<div style="display:flex; justify-content:space-between; padding:3px 0; border-bottom:1px solid #333;"><span><strong style="color:${index === 0 ? '#ffcc00' : (index === 1 ? '#aaa' : '#c08a47')}">#${index + 1}</strong> ${p.name}</span><span style="color:#ff4c4c; font-weight:bold;">${p.damage.toLocaleString()} DMG</span></div>`).join('');
        }
        const myDmgEl = document.getElementById('wb-my-damage');
        if (myDmgEl) myDmgEl.innerText = `Total Damage Anda: ${bossData.participants && bossData.participants[window.currentUserUid] ? bossData.participants[window.currentUserUid].damage.toLocaleString() : 0}`;
    });

    window.activeUnsubscribeListeners.push(unsubData, unsubMail, unsubAuction, unsubParties, unsubGuilds, unsubCoinMarket, unsubBoss);
};