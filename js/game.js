import { db, auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, getDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js"; // TAMBAHKAN updateDoc

import { selectCharacterClass, addCharacterStat, startStaminaRegeneration } from './modules/character.js';
import { equipFromInventory, sellItemToNPC } from './modules/inventory.js';
import { refineEquipment } from './modules/blacksmith.js';
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

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    document.getElementById(screenId).style.display = 'block';
}

function escapeHTML(str) { return str ? str.toString().replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])) : ""; }

function startDynamicChat() {
    if (unsubChatListener) unsubChatListener(); 
    let targetId = null;
    if (currentChatChannel === 'guild') targetId = currentPlayerStats.guildId;
    if (currentChatChannel === 'party') targetId = currentPartyId;

    unsubChatListener = listenToChat(db, currentChatChannel, targetId, (messages) => {
        const chatBox = document.getElementById('chat-box');
        if (chatBox) { 
            chatBox.innerHTML = "";
            let chColor = '#aaa';
            let chLabel = 'DUNIA';
            if (currentChatChannel === 'guild') { chColor = '#28a745'; chLabel = 'GUILD'; }
            if (currentChatChannel === 'party') { chColor = '#00d2ff'; chLabel = 'PARTY'; }

            messages.forEach(m => { chatBox.innerHTML += `<div><strong style="color:${chColor}; font-size:9px;">[${chLabel}]</strong> <span class="chat-name">${escapeHTML(m.username)}</span>: ${escapeHTML(m.text)}</div>`; });
            chatBox.scrollTop = chatBox.scrollHeight;
        }
    });
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUserUid = user.uid;
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
    const unsubGuilds = listenToGuilds(db, (guildsData, upgradesData) => {
        globalGuilds = guildsData;
        guildUpgradesMap = upgradesData;
        renderGuildPanel(); 
    });

    const unsubData = onSnapshot(doc(db, "users", currentUserUid), (docSnap) => {
        if (!docSnap.exists()) return;
        const d = docSnap.data();
        playerUsername = d.username || "Hero Anonim";

        const btnAdmin = document.getElementById('btn-admin-panel');
        if (btnAdmin) btnAdmin.style.display = (d.role === 'admin') ? 'inline-block' : 'none';

        // CEK SINKRONISASI STAT POIN OTOMATIS JIKA DATABASE DI-EDIT ADMIN
        const baseTotal = d.characterClass === 'Warrior' ? 42 : 45;
        const expectedTotal = baseTotal + ((d.level || 1) - 1) * 5;
        const currentTotal = (d.str || 0) + (d.con || 0) + (d.dex || 0) + (d.int || 0) + (d.statPoints || 0);

        if (currentTotal < expectedTotal) {
            const missing = expectedTotal - currentTotal;
            updateDoc(doc(db, "users", currentUserUid), { statPoints: (d.statPoints || 0) + missing });
            return; // Berhenti sebentar, snapshot akan refresh otomatis setelah poin ditambahkan!
        }

        if (document.getElementById('player-name')) {
            document.getElementById('player-name').innerText = d.username;
            document.getElementById('player-class').innerText = d.characterClass;
            document.getElementById('player-level').innerText = d.level || 1;
            document.getElementById('header-gold').innerText = (d.gold || 0).toLocaleString();
            document.getElementById('header-coin').innerText = (d.coin || 0).toLocaleString();
            document.getElementById('player-bank').innerText = (d.bankGold || 0).toLocaleString();
            
            const elUid = document.getElementById('player-uid');
            if (elUid) elUid.innerText = currentUserUid;

            const statPoints = d.statPoints || 0;
            document.getElementById('player-stat-points').innerText = statPoints;

            const addStatBtns = document.querySelectorAll('.btn-add-stat');
            addStatBtns.forEach(btn => { btn.style.display = statPoints > 0 ? 'inline-block' : 'none'; });

            let gBuff = { atk: 0, hp: 0, def: 0 };
            if (d.guildId && globalGuilds[d.guildId]) {
                const gLvl = globalGuilds[d.guildId].level;
                gBuff = guildUpgradesMap[gLvl].buff;
                document.getElementById('guild-buff-indicator').innerText = `🛡️ Guild Buff: +${gBuff.atk} ATK, +${gBuff.hp} HP, +${gBuff.def} DEF`;
            } else {
                document.getElementById('guild-buff-indicator').innerText = `🛡️ Guild Buff: Belum bergabung.`;
            }

            if (!d.guildId && currentChatChannel === 'guild') {
                currentChatChannel = 'world';
                const sel = document.getElementById('chat-channel-select');
                if(sel) sel.value = 'world';
                startDynamicChat();
            }

            const effectiveMaxHp = (d.maxHp || 1000) + gBuff.hp;

            const maxExp = (d.level || 1) * 100;
            document.getElementById('exp-text').innerText = `${d.exp || 0} / ${maxExp}`;
            document.getElementById('exp-bar').style.width = `${Math.min(((d.exp || 0) / maxExp) * 100, 100)}%`;
            document.getElementById('char-hp-text').innerText = `${d.currentHp} / ${effectiveMaxHp}`;
            document.getElementById('char-hp-bar').style.width = `${Math.min((d.currentHp / effectiveMaxHp) * 100, 100)}%`;
            document.getElementById('char-mp-text').innerText = `${d.currentMp} / ${d.maxMp}`;
            document.getElementById('char-mp-bar').style.width = `${Math.min((d.currentMp / d.maxMp) * 100, 100)}%`;
            
            const curStam = d.currentStamina || 0;
            const maxStam = d.maxStamina || 100;
            document.getElementById('char-stam-text').innerText = `${curStam} / ${maxStam}`;
            document.getElementById('char-stam-bar').style.width = `${Math.min((curStam / maxStam) * 100, 100)}%`;

            document.getElementById('stat-str').innerText = d.str;
            document.getElementById('stat-con').innerText = d.con;
            document.getElementById('stat-dex').innerText = d.dex;
            document.getElementById('stat-int').innerText = d.int;

            const eq = d.equipment || {};
            document.getElementById('eq-weapon').innerText = eq.weapon ? `${eq.weapon.name}${eq.weapon.refine ? ` (+${eq.weapon.refine})` : ""}` : "Kosong";
            document.getElementById('eq-armor').innerText = eq.armor ? `${eq.armor.name}${eq.armor.refine ? ` (+${eq.armor.refine})` : ""}` : "Kosong";
            document.getElementById('eq-acc').innerText = eq.accessory ? `${eq.accessory.name}${eq.accessory.refine ? ` (+${eq.accessory.refine})` : ""}` : "Kosong";
            document.getElementById('eq-mount').innerText = eq.mount ? `${eq.mount.name}` : "Jalan Kaki";

            let wBonus = 1 + (eq.weapon?.refine || 0) * 0.15; 
            let aBonus = 1 + (eq.armor?.refine || 0) * 0.15;
            let cBonus = 1 + (eq.accessory?.refine || 0) * 0.10;
            
            const patk = 50 + (d.str * 10) + Math.floor((eq.weapon?.patk || 0) * wBonus) + gBuff.atk; 
            const matk = 50 + (d.int * 10) + Math.floor((eq.weapon?.matk || 0) * wBonus) + gBuff.atk;
            const def = 10 + (d.con * 5) + Math.floor((eq.armor?.def || 0) * aBonus) + gBuff.def; 
            
            currentPlayerStats = { 
                uid: currentUserUid, username: d.username, 
                level: d.level, currentHp: d.currentHp, maxHp: effectiveMaxHp, currentStamina: curStam,
                str: d.str, con: d.con, int: d.int, dex: d.dex,
                patk: patk, matk: matk, def: def, equipment: eq,
                guildId: d.guildId, gold: d.gold
            };

            document.getElementById('stat-patk').innerText = patk; 
            document.getElementById('stat-matk').innerText = matk;
            document.getElementById('stat-def').innerText = def; 
            document.getElementById('stat-crit').innerText = (d.dex * 0.5).toFixed(1) + "%";
            document.getElementById('stat-eva').innerText = (d.dex * 0.2).toFixed(1) + "%"; 
            document.getElementById('stat-acc').innerText = (80 + (d.dex * 0.5) + Math.floor((eq.accessory?.accBonus || 0) * cBonus)).toFixed(1) + "%";
            
            const q = d.quests || {};
            const today = new Date().toLocaleDateString('id-ID');
            const btnTake = document.getElementById('btn-take-quest');
            
            if (q.lastReset !== today) {
                btnTake.style.display = 'block';
                document.getElementById('quest-daily-title').innerText = "Belum Diambil";
                document.getElementById('quest-daily-prog').innerText = "0/0";
                document.getElementById('quest-bounty-title').innerText = "Belum Diambil";
                document.getElementById('quest-bounty-prog').innerText = "0/0";
                document.getElementById('btn-claim-daily').style.display = 'none';
                document.getElementById('btn-claim-bounty').style.display = 'none';
            } else {
                btnTake.style.display = 'none';
                document.getElementById('quest-daily-title').innerText = q.daily.title;
                document.getElementById('quest-daily-prog').innerText = `${q.daily.progress}/${q.daily.target}`;
                if (q.daily.isClaimed) { document.getElementById('quest-daily-prog').innerText = "✅ Selesai"; document.getElementById('btn-claim-daily').style.display = 'none'; } 
                else if (q.daily.progress >= q.daily.target) { document.getElementById('btn-claim-daily').style.display = 'inline-block'; } 
                else { document.getElementById('btn-claim-daily').style.display = 'none'; }

                document.getElementById('quest-bounty-title').innerText = q.bounty.title;
                document.getElementById('quest-bounty-prog').innerText = `${q.bounty.progress}/${q.bounty.target}`;
                if (q.bounty.isClaimed) { document.getElementById('quest-bounty-prog').innerText = "✅ Selesai"; document.getElementById('btn-claim-bounty').style.display = 'none'; } 
                else if (q.bounty.progress >= q.bounty.target) { document.getElementById('btn-claim-bounty').style.display = 'inline-block'; } 
                else { document.getElementById('btn-claim-bounty').style.display = 'none'; }
            }
            renderGuildPanel(); 
            if (!unsubChatListener) startDynamicChat();
        }

        const invGrid = document.getElementById('inventory-grid');
        if (invGrid) {
            invGrid.innerHTML = "";
            let items = Object.entries(d.inventory || {});
            for (let i = 0; i < 20; i++) {
                if (i < items.length) {
                    const [name, qty] = items[i];
                    invGrid.innerHTML += `<div class="inv-slot filled" onclick="window.handleInventoryClick('${escapeHTML(name)}')"><span>${escapeHTML(name)}</span><span class="inv-qty">x${qty}</span></div>`;
                } else { invGrid.innerHTML += `<div class="inv-slot">Kosong</div>`; }
            }
        }

        const bankGrid = document.getElementById('bank-grid');
        if (bankGrid) {
            bankGrid.innerHTML = "";
            let bankItems = Object.entries(d.bankInventory || {});
            for (let i = 0; i < 16; i++) { 
                if (i < bankItems.length) {
                    const [name, qty] = bankItems[i];
                    bankGrid.innerHTML += `<div class="bank-slot filled" onclick="window.handleBankClick('${escapeHTML(name)}')"><span>${escapeHTML(name)}</span><span class="inv-qty">x${qty}</span></div>`;
                } else { bankGrid.innerHTML += `<div class="bank-slot">Kosong</div>`; }
            }
        }
    });

    const unsubMail = listenToMailbox(db, currentUserUid, (mails) => {
        const mailDiv = document.getElementById('mailbox-list');
        if (mailDiv) { 
            mailDiv.innerHTML = mails.length === 0 ? "Tidak ada surat." : "";
            mails.forEach(mail => { 
                let attachHtml = "";
                let rewardText = "";
                
                if (mail.attachments) {
                    const rName = mail.attachments.itemName || mail.attachments.name || "Item";
                    const rQty = mail.attachments.qty || 1;
                    rewardText = `<br><span style="color:#28a745; font-size:11px;">🎁 Item Hadiah: [${escapeHTML(rName)}] x${rQty}</span>`;
                    
                    if (!mail.isClaimed) { attachHtml += `<button onclick="window.claimReward('${mail.id}')" style="padding: 2px 6px; font-size: 10px; background: #28a745; float: right; margin-left:4px;">Klaim</button>`; } 
                    else if (mail.isClaimed) { attachHtml += `<span style="font-size:9px; color:#555; float:right; margin-left:4px;">(Klaim Selesai)</span>`; }
                }
                attachHtml += `<button onclick="window.deleteMailAction('${mail.id}')" style="padding: 2px 6px; font-size: 10px; background: #dc3545; float: right;">Hapus</button>`;
                mailDiv.innerHTML += `<div style="border-bottom:1px solid #333; padding:6px 0; overflow:hidden;"><strong style="color:#ffcc00; font-size: 12px;">[Sistem]</strong> <span style="font-size: 12px;">${escapeHTML(mail.title)}</span> ${attachHtml} ${rewardText}</div>`; 
            });
        }
    });

    const unsubAuction = listenToAuction(db, (items) => {
        const auctionList = document.getElementById('auction-list');
        if (auctionList) { 
            auctionList.innerHTML = items.length === 0 ? "Belum ada lelang." : "";
            const now = Date.now();
            items.forEach(item => {
                const isExpired = (item.expiresAt || 0) < now;
                const isMine = item.sellerId === currentUserUid;
                const itemPrice = item.buyoutPrice || item.price || 0; 
                let btnHtml = "";

                if (isMine) {
                    if (item.highestBid) {
                        btnHtml += `<div style="margin-bottom:4px; font-size:10px;">Bid: <strong style="color:#00d2ff">${item.highestBid.amount}G</strong> (${escapeHTML(item.highestBid.buyerName)})</div>`;
                        btnHtml += `<button onclick="window.actionBid('${item.id}', 'accept')" style="padding:2px 5px; font-size:9px; background:#28a745;">Terima</button> `;
                        btnHtml += `<button onclick="window.actionBid('${item.id}', 'reject')" style="padding:2px 5px; font-size:9px; background:#dc3545;">Tolak</button>`;
                        if (isExpired) btnHtml += `<div style="color:#dc3545; font-size:9px; margin-top:3px;">⏰ Habis!</div>`;
                    } else {
                        btnHtml += `<div style="margin-bottom:4px;">${isExpired ? '<span style="color:#dc3545; font-size:9px;">⏰ Kadaluarsa</span>' : '<span style="color:#28a745; font-size:9px;">🟢 Aktif</span>'}</div>`;
                        btnHtml += `<button onclick="window.cancelAuction('${item.id}')" style="padding:2px 5px; font-size:9px; background:#555;">Tarik Barang</button>`;
                    }
                } else {
                    const currentBid = item.highestBid ? item.highestBid.amount : 0;
                    if (!isExpired) {
                        btnHtml += `<div style="font-size:9px; margin-bottom:4px;">Bid: ${currentBid > 0 ? currentBid + 'G' : '-'}</div>`;
                        btnHtml += `<button onclick="window.placeBid('${item.id}', '${escapeHTML(item.itemName)}', ${currentBid})" style="padding:2px 5px; font-size:9px; background:#007bff;">Tawar</button> `;
                        btnHtml += `<button onclick="window.buyFromAuction('${item.id}', '${escapeHTML(item.itemName)}', ${itemPrice}, '${item.sellerId}')" style="padding:2px 5px; font-size:9px; background:#e0a800;">Beli ${itemPrice}G</button>`;
                    } else { btnHtml += `<span style="color:#dc3545; font-size:10px;">Selesai</span>`; }
                }
                auctionList.innerHTML += `<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #333; padding: 6px 0;"><div><strong style="color:#00d2ff;">${escapeHTML(item.itemName)}</strong><br><span style="font-size:10px; color:#aaa;">Penjual: ${escapeHTML(item.sellerName)} | Langsung: 💰 ${itemPrice.toLocaleString()}G</span></div><div style="text-align: right;">${btnHtml}</div></div>`;
            });
        }
    });

    const unsubParties = listenToParties(db, (parties) => {
        const partyList = document.getElementById('party-list');
        
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

        if (partyList) {
            partyList.innerHTML = parties.length === 0 ? "Tidak ada party yang sedang mencari anggota." : "";
            parties.forEach(p => {
                const inParty = p.members.find(m => m.uid === currentUserUid);
                const isLeader = p.leaderId === currentUserUid;
                let memberNames = p.members.map(m => `<span style="color:#a8b2b8;">${escapeHTML(m.username)} (Lv.${m.level})</span>`).join(", ");
                let btnHtml = "";

                if (inParty) {
                    if (isLeader) { btnHtml += `<button onclick="window.startFb('${p.id}')" style="padding: 4px 8px; font-size: 10px; background: #28a745; margin-right:4px;">▶️ MULAI FB</button>`; }
                    btnHtml += `<button onclick="window.leaveParty('${p.id}')" style="padding: 4px 8px; font-size: 10px; background: #dc3545;">Keluar</button>`;
                }
                partyList.innerHTML += `<div style="border-bottom:1px solid #333; padding: 6px 0; display:flex; justify-content:space-between; align-items:center;"><div style="line-height:1.3;"><strong style="color:#d8b4fe; font-size:12px;">${p.fbName}</strong><br><span style="font-size:10px; color:#aaa;">Leader: <span style="color:#ffca28;">${escapeHTML(p.leaderName)}</span> | Anggota (${p.members.length}/4)</span><br><div style="font-size:9px; margin-top:2px;">[ ${memberNames} ]</div></div><div>${btnHtml}</div></div>`;
            });
        }
    });

    activeUnsubscribeListeners.push(unsubData, unsubMail, unsubAuction, unsubParties, unsubGuilds);
}

function renderGuildPanel() {
    const unjoinedView = document.getElementById('guild-unjoined-view');
    const joinedView = document.getElementById('guild-joined-view');
    if (!currentPlayerStats.uid) return;

    if (!currentPlayerStats.guildId || !globalGuilds[currentPlayerStats.guildId]) {
        unjoinedView.style.display = 'block';
        joinedView.style.display = 'none';
        
        const listContainer = document.getElementById('guild-available-list');
        listContainer.innerHTML = "";
        
        const gArray = Object.values(globalGuilds);
        if (gArray.length === 0) { listContainer.innerHTML = "Belum ada klan di server."; }
        else {
            gArray.forEach(g => {
                const maxCap = guildUpgradesMap[g.level].maxMembers;
                const isFull = g.members.length >= maxCap;
                const btn = isFull ? `<span style="color:#dc3545; font-size:10px;">Penuh</span>` : `<button onclick="window.joinGuildAction('${g.id}')" style="padding:2px 6px; font-size:9px; background:#007bff;">Gabung</button>`;
                listContainer.innerHTML += `
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #333; padding:4px 0;">
                    <div><strong style="color:#00d2ff;">${escapeHTML(g.name)}</strong> (Lv.${g.level})<br><span style="color:#aaa; font-size:9px;">Ketua: ${escapeHTML(g.leaderName)} | Anggota: ${g.members.length}/${maxCap}</span></div>
                    <div>${btn}</div>
                </div>`;
            });
        }
    } else {
        unjoinedView.style.display = 'none';
        joinedView.style.display = 'block';

        const myGuild = globalGuilds[currentPlayerStats.guildId];
        const isLeader = myGuild.leaderId === currentPlayerStats.uid;
        const b = guildUpgradesMap[myGuild.level].buff;

        document.getElementById('guild-name-display').innerText = myGuild.name;
        document.getElementById('guild-level-display').innerText = myGuild.level;
        document.getElementById('guild-leader-display').innerText = myGuild.leaderName;
        document.getElementById('guild-vault-display').innerText = (myGuild.vaultGold || 0).toLocaleString();
        document.getElementById('guild-motd-display').innerText = escapeHTML(myGuild.announcement);
        document.getElementById('guild-buff-display').innerText = `+${b.atk} ATK, +${b.hp} HP, +${b.def} DEF`;

        const controls = document.getElementById('guild-management-controls');
        if (isLeader) {
            controls.style.display = 'flex';
            const costNext = myGuild.level < 5 ? guildUpgradesMap[myGuild.level + 1].cost.toLocaleString() + ' G' : 'MAX';
            document.getElementById('btn-upgrade-guild').innerText = `⏫ Level Up (${costNext})`;
        } else {
            controls.style.display = 'none';
        }

        const memberList = document.getElementById('guild-member-list');
        memberList.innerHTML = "";
        myGuild.members.forEach(m => {
            const isMe = m.uid === currentPlayerStats.uid;
            const kickBtn = (isLeader && !isMe) ? `<button onclick="window.kickMemberAction('${m.uid}')" style="padding:1px 4px; font-size:8px; background:#dc3545; margin-left:5px;">Kick</button>` : '';
            memberList.innerHTML += `
            <div style="border-bottom:1px solid #333; padding:3px 0; display:flex; justify-content:space-between; align-items:center;">
                <div><span style="color:${isMe ? '#ffca28' : '#fff'};">${escapeHTML(m.name)}</span> (Lv.${m.level}) ${kickBtn}</div>
                <div style="color:#aaa;">Donasi: ${m.contribution.toLocaleString()} G</div>
            </div>`;
        });
    }
}

document.getElementById('chat-channel-select')?.addEventListener('change', (e) => {
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
});

const chatInput = document.getElementById('chat-input');
const btnSendChat = document.getElementById('btn-send-chat');
function executeSendingChat() { 
    if (chatInput && chatInput.value.trim()) { 
        let targetId = null;
        if (currentChatChannel === 'guild') targetId = currentPlayerStats.guildId;
        if (currentChatChannel === 'party') targetId = currentPartyId;
        
        sendChat(db, currentUserUid, playerUsername, chatInput.value, currentChatChannel, targetId); 
        chatInput.value = ""; 
    } 
}
btnSendChat?.addEventListener('click', executeSendingChat);
chatInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); executeSendingChat(); } });

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
window.joinGuildAction = function(guildId) { if (confirm("Bergabung dengan klan ini?")) joinGuild(db, currentUserUid, currentPlayerStats, guildId); };
window.kickMemberAction = function(targetUid) { if (confirm("Keluarkan anggota ini dari klan?")) kickMember(db, currentUserUid, currentPlayerStats.guildId, targetUid); };

document.getElementById('btn-create-guild')?.addEventListener('click', () => {
    const name = document.getElementById('input-guild-name').value;
    if (confirm(`Dirikan Klan [${name}] seharga 100,000 Gold?`)) createGuild(db, currentUserUid, currentPlayerStats, name);
});
document.getElementById('btn-leave-guild')?.addEventListener('click', () => {
    if (confirm("Yakin ingin keluar dari klan? Anda akan kehilangan semua Buff Guild!")) dbLeaveGuild(db, currentUserUid, currentPlayerStats.guildId);
});
document.getElementById('btn-donate-guild')?.addEventListener('click', () => {
    const amt = parseInt(document.getElementById('input-donate-gold').value);
    if (amt > 0) { donateGold(db, currentUserUid, currentPlayerStats.guildId, amt); document.getElementById('input-donate-gold').value = ""; }
});
document.getElementById('btn-upgrade-guild')?.addEventListener('click', () => { if (confirm("Gunakan kas Guild untuk naik level?")) upgradeGuild(db, currentUserUid, currentPlayerStats.guildId); });
document.getElementById('btn-edit-motd')?.addEventListener('click', () => {
    const txt = prompt("Masukkan pengumuman baru untuk anggota klan:");
    if (txt) updateMotd(db, currentUserUid, currentPlayerStats.guildId, txt);
});
document.getElementById('btn-disband-guild')?.addEventListener('click', () => {
    if (confirm("PERINGATAN KERAS: Yakin ingin membubarkan Klan ini selamanya? Kas akan hangus!")) disbandGuild(db, currentUserUid, currentPlayerStats.guildId);
});

document.getElementById('btn-take-quest')?.addEventListener('click', () => assignRandomQuests(db, currentUserUid));
document.getElementById('btn-claim-daily')?.addEventListener('click', () => claimQuestReward(db, currentUserUid, 'daily'));
document.getElementById('btn-claim-bounty')?.addEventListener('click', () => claimQuestReward(db, currentUserUid, 'bounty'));

document.getElementById('btn-copy-uid')?.addEventListener('click', () => { if (currentUserUid) { navigator.clipboard.writeText(currentUserUid); alert("📋 UID disalin!"); } });
document.getElementById('class-warrior')?.addEventListener('click', () => selectCharacterClass(db, currentUserUid, 'Warrior', () => showScreen('screen-game')));
document.getElementById('class-mage')?.addEventListener('click', () => selectCharacterClass(db, currentUserUid, 'Mage', () => showScreen('screen-game')));

function clearActiveModeClasses() { ['btn-mode-equip', 'btn-mode-sell', 'btn-mode-bank', 'btn-mode-auction'].forEach(id => { const el = document.getElementById(id); if (el) el.className = ""; if (el && id !== 'btn-mode-equip') el.style.backgroundColor = "#495057"; }); }
document.getElementById('btn-mode-equip')?.addEventListener('click', () => { inventoryMode = "EQUIP"; clearActiveModeClasses(); document.getElementById('btn-mode-equip').className = "mode-active"; });
document.getElementById('btn-mode-sell')?.addEventListener('click', () => { inventoryMode = "SELL"; clearActiveModeClasses(); document.getElementById('btn-mode-sell').className = "mode-sell-active"; });
document.getElementById('btn-mode-bank')?.addEventListener('click', () => { inventoryMode = "BANK"; clearActiveModeClasses(); document.getElementById('btn-mode-bank').className = "mode-active"; });
document.getElementById('btn-mode-auction')?.addEventListener('click', () => { inventoryMode = "AUCTION"; clearActiveModeClasses(); document.getElementById('btn-mode-auction').className = "mode-auction-active"; });

document.getElementById('btn-create-party')?.addEventListener('click', () => { createOrJoinParty(db, document.getElementById('fb-select').value, currentPlayerStats); });
document.getElementById('btn-attack-dungeon')?.addEventListener('click', () => attackMonster(db, currentUserUid, document.getElementById('dungeon-select').value, currentPlayerStats));
document.getElementById('btn-refine-weapon')?.addEventListener('click', () => refineEquipment(db, currentUserUid, 'weapon', document.getElementById('refine-catalyst').value));
document.getElementById('btn-refine-armor')?.addEventListener('click', () => refineEquipment(db, currentUserUid, 'armor', document.getElementById('refine-catalyst').value));
document.getElementById('btn-refine-accessory')?.addEventListener('click', () => refineEquipment(db, currentUserUid, 'accessory', document.getElementById('refine-catalyst').value));

document.getElementById('btn-buy-sword')?.addEventListener('click', () => buyEquipment(db, currentUserUid, 'Pedang Besi'));
document.getElementById('btn-buy-staff')?.addEventListener('click', () => buyEquipment(db, currentUserUid, 'Tongkat Sihir'));
document.getElementById('btn-buy-armor')?.addEventListener('click', () => buyEquipment(db, currentUserUid, 'Zirah Kulit'));
document.getElementById('btn-buy-ring')?.addEventListener('click', () => buyEquipment(db, currentUserUid, 'Cincin Akurat'));
document.getElementById('btn-buy-hp')?.addEventListener('click', () => buyPotion(db, currentUserUid, 'HP'));
document.getElementById('btn-buy-mp')?.addEventListener('click', () => buyPotion(db, currentUserUid, 'MP'));

document.getElementById('btn-buy-horse')?.addEventListener('click', () => buyEquipment(db, currentUserUid, 'Kuda Coklat'));
document.getElementById('btn-buy-bear')?.addEventListener('click', () => buyEquipment(db, currentUserUid, 'Beruang Kutub'));
document.getElementById('btn-mall-dragon')?.addEventListener('click', () => buyMallItem(db, currentUserUid, 'Naga Terbang', 200));

document.getElementById('btn-bank-deposit-gold')?.addEventListener('click', () => { const el = document.getElementById('bank-gold-input'); const val = parseInt(el.value); if (val > 0) { depositGold(db, currentUserUid, val); el.value = ""; } });
document.getElementById('btn-bank-withdraw-gold')?.addEventListener('click', () => { const el = document.getElementById('bank-gold-input'); const val = parseInt(el.value); if (val > 0) { withdrawGold(db, currentUserUid, val); el.value = ""; } });

document.getElementById('btn-mall-mirage')?.addEventListener('click', () => buyMallItem(db, currentUserUid, 'Mirage Stone', 5));
document.getElementById('btn-mall-heaven')?.addEventListener('click', () => buyMallItem(db, currentUserUid, 'Heaven Stone', 15));
document.getElementById('btn-mall-underworld')?.addEventListener('click', () => buyMallItem(db, currentUserUid, 'Underworld Stone', 15));
document.getElementById('btn-mall-universal')?.addEventListener('click', () => buyMallItem(db, currentUserUid, 'Universal Stone', 50));
document.getElementById('btn-mall-name')?.addEventListener('click', () => buyMallItem(db, currentUserUid, 'Tiket Ganti Nama', 50));
document.getElementById('btn-mall-job')?.addEventListener('click', () => buyMallItem(db, currentUserUid, 'Tiket Ubah Job', 100));
document.getElementById('btn-mall-stamina')?.addEventListener('click', () => buyMallItem(db, currentUserUid, 'Ramuan Stamina', 10));

// TOMBOL BARU UNTUK ITEM RESET STATS (DI ITEM MALL)
document.getElementById('btn-mall-reset')?.addEventListener('click', () => buyMallItem(db, currentUserUid, 'Buku Reset Stats', 100));

document.getElementById('btn-admin-panel')?.addEventListener('click', () => window.location.href = './admin/index.html');