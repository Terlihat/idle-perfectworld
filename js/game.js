/* ===================================================
   PUSAT KENDALI UTAMA (UI CONTROLLER)
   Versi Code: 2.0.0 (Bidding System)
   =================================================== */
import { db, auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, getDoc, onSnapshot, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

import { selectCharacterClass } from './modules/character.js';
import { equipFromInventory, sellItemToNPC } from './modules/inventory.js';
import { refineEquipment } from './modules/blacksmith.js';
import { attackMonster } from './modules/battle.js'; 
import { buyEquipment } from './modules/shop.js';
import { listenToChat, sendChat } from './modules/chat.js';
import { buyPotion } from './modules/apothecary.js';
import { listenToMailbox, claimMailReward } from './modules/mailbox.js'; 
import { buyMallItem } from './modules/mall.js'; 
import { depositGold, withdrawGold, depositItem, withdrawItem } from './modules/bank.js';

// IMPORT AUCTION SYSTEM BARU
import { listenToAuction, listAuctionItem, buyAuctionItem, placeBid, acceptBid, rejectBid, cancelAuction } from './modules/auction.js';

let currentUserUid = null;
let activeUnsubscribeListeners = [];
let inventoryMode = "EQUIP"; 
let playerUsername = "Hero Anonim";
let currentPlayerStats = {}; 
let staminaRegenInterval = null;

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.style.display = 'none');
    document.getElementById(screenId).style.display = 'block';
}

function escapeHTML(str) {
    return str ? str.toString().replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])) : "";
}

function startStaminaRegen() {
    if (staminaRegenInterval) clearInterval(staminaRegenInterval);
    staminaRegenInterval = setInterval(async () => {
        if (!currentUserUid) return;
        const userRef = doc(db, "users", currentUserUid);
        try {
            await runTransaction(db, async (ts) => {
                const snap = await ts.get(userRef);
                if (!snap.exists()) return;
                const d = snap.data();
                if ((d.currentStamina || 0) < (d.maxStamina || 100)) {
                    ts.update(userRef, { currentStamina: (d.currentStamina || 0) + 1 });
                }
            });
        } catch (err) { console.error("Regen stamina error:", err); }
    }, 60000); 
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
            startStaminaRegen(); 
        }
    } else {
        currentUserUid = null;
        if (staminaRegenInterval) clearInterval(staminaRegenInterval);
        activeUnsubscribeListeners.forEach(unsub => unsub());
        activeUnsubscribeListeners = [];
        showScreen('screen-auth');
    }
});

function startLiveGameSync() {
    const unsubData = onSnapshot(doc(db, "users", currentUserUid), (docSnap) => {
        if (!docSnap.exists()) return;
        const d = docSnap.data();
        playerUsername = d.username || "Hero Anonim";

        const btnAdmin = document.getElementById('btn-admin-panel');
        if (btnAdmin) btnAdmin.style.display = (d.role === 'admin') ? 'inline-block' : 'none';

        if (document.getElementById('player-name')) {
            document.getElementById('player-name').innerText = d.username;
            document.getElementById('player-class').innerText = d.characterClass;
            document.getElementById('player-level').innerText = d.level || 1;
            document.getElementById('header-gold').innerText = (d.gold || 0).toLocaleString();
            document.getElementById('header-coin').innerText = (d.coin || 0).toLocaleString();
            document.getElementById('player-bank').innerText = (d.bankGold || 0).toLocaleString();
            
            const maxExp = (d.level || 1) * 100;
            document.getElementById('exp-text').innerText = `${d.exp || 0} / ${maxExp}`;
            document.getElementById('exp-bar').style.width = `${Math.min(((d.exp || 0) / maxExp) * 100, 100)}%`;
            document.getElementById('char-hp-text').innerText = `${d.currentHp} / ${d.maxHp}`;
            document.getElementById('char-hp-bar').style.width = `${Math.min((d.currentHp / d.maxHp) * 100, 100)}%`;
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

            let wBonus = 1 + (eq.weapon?.refine || 0) * 0.15; 
            let aBonus = 1 + (eq.armor?.refine || 0) * 0.15;
            let cBonus = 1 + (eq.accessory?.refine || 0) * 0.10;
            
            const patk = 50 + (d.str * 10) + Math.floor((eq.weapon?.patk || 0) * wBonus); 
            const matk = 50 + (d.int * 10) + Math.floor((eq.weapon?.matk || 0) * wBonus);
            const def = 10 + (d.con * 5) + Math.floor((eq.armor?.def || 0) * aBonus); 
            
            currentPlayerStats = { level: d.level, patk: patk, matk: matk, def: def };

            document.getElementById('stat-patk').innerText = patk; 
            document.getElementById('stat-matk').innerText = matk;
            document.getElementById('stat-def').innerText = def; 
            document.getElementById('stat-crit').innerText = (d.dex * 0.5).toFixed(1) + "%";
            document.getElementById('stat-eva').innerText = (d.dex * 0.2).toFixed(1) + "%"; 
            document.getElementById('stat-acc').innerText = (80 + (d.dex * 0.5) + Math.floor((eq.accessory?.accBonus || 0) * cBonus)).toFixed(1) + "%";
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

    const unsubChat = listenToChat(db, (messages) => {
        const chatBox = document.getElementById('chat-box');
        if (chatBox) { 
            chatBox.innerHTML = "";
            messages.forEach(m => { chatBox.innerHTML += `<div><span class="chat-name">${escapeHTML(m.username)}</span>: ${escapeHTML(m.text)}</div>`; });
            chatBox.scrollTop = chatBox.scrollHeight;
        }
    });

    const unsubMail = listenToMailbox(db, currentUserUid, (mails) => {
        const mailDiv = document.getElementById('mailbox-list');
        if (mailDiv) { 
            mailDiv.innerHTML = mails.length === 0 ? "Tidak ada surat." : "";
            mails.forEach(mail => { 
                let attachHtml = "";
                if (mail.attachments && !mail.isClaimed) {
                    attachHtml = `<button onclick="window.claimReward('${mail.id}')" style="padding: 2px 8px; font-size: 10px; background: #28a745; float: right;">Klaim</button>`;
                } else if (mail.isClaimed) {
                    attachHtml = `<span style="font-size:9px; color:#555; float:right;">(Diklaim)</span>`;
                }
                mailDiv.innerHTML += `<div style="border-bottom:1px solid #333; padding:6px 0; overflow:hidden;">
                    <strong style="color:#ffcc00; font-size: 12px;">[Admin]</strong> <span style="font-size: 12px;">${escapeHTML(mail.title)}</span> ${attachHtml}
                </div>`; 
            });
        }
    });

    // E. SINKRONISASI PASAR LELANG TERBARU (UI Tawar / Tolak / Kedaluwarsa)
    const unsubAuction = listenToAuction(db, (items) => {
        const auctionList = document.getElementById('auction-list');
        if (auctionList) { 
            auctionList.innerHTML = items.length === 0 ? "Belum ada lelang." : "";
            const now = Date.now();

            items.forEach(item => {
                const isExpired = (item.expiresAt || 0) < now;
                const isMine = item.sellerId === currentUserUid;
                let btnHtml = "";

                if (isMine) {
                    // TAMPILAN UNTUK PENJUAL
                    if (item.highestBid) {
                        btnHtml += `<div style="margin-bottom:4px; font-size:10px;">Bid: <strong style="color:#00d2ff">${item.highestBid.amount}G</strong> (${escapeHTML(item.highestBid.buyerName)})</div>`;
                        btnHtml += `<button onclick="window.actionBid('${item.id}', 'accept')" style="padding:2px 5px; font-size:9px; background:#28a745;">Terima</button> `;
                        btnHtml += `<button onclick="window.actionBid('${item.id}', 'reject')" style="padding:2px 5px; font-size:9px; background:#dc3545;">Tolak</button>`;
                        if (isExpired) btnHtml += `<div style="color:#dc3545; font-size:9px; margin-top:3px;">⏰ Waktu Habis! Segera ambil tindakan.</div>`;
                    } else {
                        const timeInfo = isExpired ? '<span style="color:#dc3545; font-size:9px;">⏰ Kadaluarsa</span>' : '<span style="color:#28a745; font-size:9px;">🟢 Aktif</span>';
                        btnHtml += `<div style="margin-bottom:4px;">${timeInfo}</div>`;
                        btnHtml += `<button onclick="window.cancelAuction('${item.id}')" style="padding:2px 5px; font-size:9px; background:#555;">Tarik Barang</button>`;
                    }
                } else {
                    // TAMPILAN UNTUK PEMBELI
                    const currentBid = item.highestBid ? item.highestBid.amount : 0;
                    if (!isExpired) {
                        btnHtml += `<div style="font-size:9px; margin-bottom:4px;">Bid Tertinggi: ${currentBid > 0 ? currentBid + 'G' : '-'}</div>`;
                        btnHtml += `<button onclick="window.placeBid('${item.id}', '${escapeHTML(item.itemName)}', ${currentBid})" style="padding:2px 5px; font-size:9px; background:#007bff;">Tawar</button> `;
                        btnHtml += `<button onclick="window.buyFromAuction('${item.id}', '${escapeHTML(item.itemName)}', ${item.buyoutPrice}, '${item.sellerId}')" style="padding:2px 5px; font-size:9px; background:#e0a800;">Beli ${item.buyoutPrice}G</button>`;
                    } else {
                        btnHtml += `<span style="color:#dc3545; font-size:10px;">Lelang Telah Berakhir</span>`;
                    }
                }

                auctionList.innerHTML += `
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #333; padding: 6px 0;">
                    <div><strong style="color:#00d2ff;">${escapeHTML(item.itemName)}</strong><br><span style="font-size:10px; color:#aaa;">Penjual: ${escapeHTML(item.sellerName)} | Langsung: 💰 ${item.buyoutPrice.toLocaleString()}G</span></div>
                    <div style="text-align: right;">${btnHtml}</div>
                </div>`;
            });
        }
    });

    activeUnsubscribeListeners.push(unsubData, unsubChat, unsubMail, unsubAuction);
}

// -------------------------------------------
// 3. WINDOW ROUTING LOGIC (UI INTERAKSI)
// -------------------------------------------
window.handleInventoryClick = function(itemName) {
    if (inventoryMode === "EQUIP") {
        if (itemName === "Tiket Ganti Nama") {
            const inputName = prompt("Masukkan Nama Karakter Baru:");
            if (inputName && inputName.trim() !== "") equipFromInventory(db, currentUserUid, itemName, inputName);
        } else if (itemName === "Tiket Ubah Job") {
            const inputJob = prompt("Pilih Job Baru (Ketik: Warrior atau Mage):");
            if (inputJob === "Warrior" || inputJob === "Mage") equipFromInventory(db, currentUserUid, itemName, inputJob);
        } else { equipFromInventory(db, currentUserUid, itemName, null); }
    } 
    else if (inventoryMode === "SELL") { sellItemToNPC(db, currentUserUid, itemName); } 
    else if (inventoryMode === "BANK") { depositItem(db, currentUserUid, itemName); }
    else if (inventoryMode === "AUCTION") {
        if (itemName.includes("Tiket") || itemName.includes("Ramuan Stamina")) return alert("Item mall premium tidak bisa dilelang.");
        const priceStr = prompt(`Masukkan Harga Beli Langsung (Gold) untuk 1x [${itemName}]:`);
        const price = parseInt(priceStr);
        if (price > 0) listAuctionItem(db, currentUserUid, itemName, price, playerUsername);
    }
};

window.handleBankClick = function(itemName) { withdrawItem(db, currentUserUid, itemName); };
window.claimReward = function(mailId) { claimMailReward(db, currentUserUid, mailId); };

// FUNGSI ROUTING LELANG (AUCTION) BARU
window.buyFromAuction = function(id, name, price, sellerId) { if (confirm(`Beli Langsung ${name} seharga ${price} Gold?`)) buyAuctionItem(db, currentUserUid, id, name, price, sellerId); };
window.cancelAuction = function(id) { if (confirm("Tarik barang dari pasar?")) cancelAuction(db, currentUserUid, id); };

window.placeBid = function(id, name, currentBid) {
    const minBid = currentBid > 0 ? currentBid + 10 : 10;
    const bidStr = prompt(`Masukkan tawaran (Bid) untuk ${name}\n(Minimal: ${minBid} Gold):`);
    const bidAmt = parseInt(bidStr);
    if (bidAmt >= minBid) {
        placeBid(db, currentUserUid, playerUsername, id, bidAmt);
    } else if (bidStr) {
        alert(`Tawaran terlalu rendah! Minimal tawaran adalah ${minBid} Gold.`);
    }
};

window.actionBid = function(id, action) {
    if (action === 'accept' && confirm("Terima tawaran ini? Barang akan diberikan ke penawar dan uang masuk ke tas Anda.")) acceptBid(db, currentUserUid, id);
    if (action === 'reject' && confirm("Tolak tawaran ini? Uang akan dikembalikan ke penawar.")) rejectBid(db, currentUserUid, id);
};

// -------------------------------------------
// 4. BINDING HANDLER BUTTONS EVENT LISTENERS
// -------------------------------------------
document.getElementById('class-warrior')?.addEventListener('click', () => selectCharacterClass(db, currentUserUid, 'Warrior', () => showScreen('screen-game')));
document.getElementById('class-mage')?.addEventListener('click', () => selectCharacterClass(db, currentUserUid, 'Mage', () => showScreen('screen-game')));

function clearActiveModeClasses() {
    ['btn-mode-equip', 'btn-mode-sell', 'btn-mode-bank', 'btn-mode-auction'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.className = "";
        if (el && id !== 'btn-mode-equip') el.style.backgroundColor = "#495057";
    });
}
document.getElementById('btn-mode-equip')?.addEventListener('click', () => { inventoryMode = "EQUIP"; clearActiveModeClasses(); document.getElementById('btn-mode-equip').className = "mode-active"; });
document.getElementById('btn-mode-sell')?.addEventListener('click', () => { inventoryMode = "SELL"; clearActiveModeClasses(); document.getElementById('btn-mode-sell').className = "mode-sell-active"; });
document.getElementById('btn-mode-bank')?.addEventListener('click', () => { inventoryMode = "BANK"; clearActiveModeClasses(); document.getElementById('btn-mode-bank').className = "mode-active"; });
document.getElementById('btn-mode-auction')?.addEventListener('click', () => { inventoryMode = "AUCTION"; clearActiveModeClasses(); document.getElementById('btn-mode-auction').className = "mode-auction-active"; });

// Battle Arena Dungeon Click
document.getElementById('btn-attack-dungeon')?.addEventListener('click', () => {
    const selectedMonster = document.getElementById('dungeon-select').value;
    attackMonster(db, currentUserUid, selectedMonster, currentPlayerStats);
});

// Blacksmith Refine Click
document.getElementById('btn-refine-weapon')?.addEventListener('click', () => refineEquipment(db, currentUserUid, 'weapon', document.getElementById('refine-catalyst').value));
document.getElementById('btn-refine-armor')?.addEventListener('click', () => refineEquipment(db, currentUserUid, 'armor', document.getElementById('refine-catalyst').value));
document.getElementById('btn-refine-accessory')?.addEventListener('click', () => refineEquipment(db, currentUserUid, 'accessory', document.getElementById('refine-catalyst').value));

// Shop Normal Click
document.getElementById('btn-buy-sword')?.addEventListener('click', () => buyEquipment(db, currentUserUid, 'Pedang Besi'));
document.getElementById('btn-buy-staff')?.addEventListener('click', () => buyEquipment(db, currentUserUid, 'Tongkat Sihir'));
document.getElementById('btn-buy-armor')?.addEventListener('click', () => buyEquipment(db, currentUserUid, 'Zirah Kulit'));
document.getElementById('btn-buy-ring')?.addEventListener('click', () => buyEquipment(db, currentUserUid, 'Cincin Akurat'));
document.getElementById('btn-buy-hp')?.addEventListener('click', () => buyPotion(db, currentUserUid, 'HP'));
document.getElementById('btn-buy-mp')?.addEventListener('click', () => buyPotion(db, currentUserUid, 'MP'));

// Bank Gold Action Click
document.getElementById('btn-bank-deposit-gold')?.addEventListener('click', () => { const el = document.getElementById('bank-gold-input'); const val = parseInt(el.value); if (val > 0) { depositGold(db, currentUserUid, val); el.value = ""; } });
document.getElementById('btn-bank-withdraw-gold')?.addEventListener('click', () => { const el = document.getElementById('bank-gold-input'); const val = parseInt(el.value); if (val > 0) { withdrawGold(db, currentUserUid, val); el.value = ""; } });

// Premium Item Mall Click
document.getElementById('btn-mall-mirage')?.addEventListener('click', () => buyMallItem(db, currentUserUid, 'Mirage Stone', 5));
document.getElementById('btn-mall-heaven')?.addEventListener('click', () => buyMallItem(db, currentUserUid, 'Heaven Stone', 15));
document.getElementById('btn-mall-underworld')?.addEventListener('click', () => buyMallItem(db, currentUserUid, 'Underworld Stone', 15));
document.getElementById('btn-mall-universal')?.addEventListener('click', () => buyMallItem(db, currentUserUid, 'Universal Stone', 50));
document.getElementById('btn-mall-name')?.addEventListener('click', () => buyMallItem(db, currentUserUid, 'Tiket Ganti Nama', 50));
document.getElementById('btn-mall-job')?.addEventListener('click', () => buyMallItem(db, currentUserUid, 'Tiket Ubah Job', 100));
document.getElementById('btn-mall-stamina')?.addEventListener('click', () => buyMallItem(db, currentUserUid, 'Ramuan Stamina', 10));

// Chat Action
const chatInput = document.getElementById('chat-input');
const btnSendChat = document.getElementById('btn-send-chat');
function executeSendingChat() { if (chatInput && chatInput.value.trim()) { sendChat(db, currentUserUid, playerUsername, chatInput.value); chatInput.value = ""; } }
btnSendChat?.addEventListener('click', executeSendingChat);
chatInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); executeSendingChat(); } });

// Admin Control Panel Redirect
document.getElementById('btn-admin-panel')?.addEventListener('click', () => window.location.href = './admin/index.html');