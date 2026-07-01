import { db } from '../firebase-config.js';
import { doc, getDoc, updateDoc, collection, getDocs, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { sendFriendRequest, acceptFriendRequest, rejectFriendRequest, removeFriend } from './friends.js';
import { getIconHTML } from './ui-renderer.js';

// ==========================================
// SISTEM UNIVERSAL RPG MODAL
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

        if (!modal) { console.error("HTML Modal belum dipasang!"); return resolve(type === 'prompt' ? null : (type !== 'confirm')); }

        let colorTheme = '#00d2ff';
        if (type === 'alert') colorTheme = '#ffcc00';
        if (type === 'confirm') colorTheme = '#ff9800';

        elTitle.innerText = title; elTitle.style.color = colorTheme;
        box.style.borderColor = colorTheme; btnOk.style.background = colorTheme;
        elMsg.innerHTML = String(msg).replace(/\n/g, '<br>');

        const newBtnOk = btnOk.cloneNode(true);
        const newBtnCancel = btnCancel.cloneNode(true);
        btnOk.parentNode.replaceChild(newBtnOk, btnOk);
        btnCancel.parentNode.replaceChild(newBtnCancel, btnCancel);

        if (type === 'prompt') {
            elInput.style.display = 'block'; elInput.type = inputType; elInput.value = ''; newBtnCancel.style.display = 'block';
        } else if (type === 'confirm') {
            elInput.style.display = 'none'; newBtnCancel.style.display = 'block';
        } else {
            elInput.style.display = 'none'; newBtnCancel.style.display = 'none';
        }

        modal.style.display = 'flex';
        if (type === 'prompt') elInput.focus();

        newBtnOk.addEventListener('click', () => { modal.style.display = 'none'; resolve(type === 'prompt' ? elInput.value : true); });
        newBtnCancel.addEventListener('click', () => { modal.style.display = 'none'; resolve(type === 'prompt' ? null : false); });
    });
};

window.rpgAlert = (msg, title = "Pesan Sistem") => window.showModal({ type: 'alert', msg, title });
window.rpgConfirm = (msg, title = "Konfirmasi") => window.showModal({ type: 'confirm', msg, title });
window.rpgPrompt = (msg, title = "Input", inputType = "text") => window.showModal({ type: 'prompt', msg, title, inputType });
window.alert = function (msg) { window.rpgAlert(msg); };

// ==========================================
// SISTEM GLOBAL LEADERBOARD 
// ==========================================
window.fetchLeaderboard = async function (type) {
    const lbContent = document.getElementById('leaderboard-content');
    if (!lbContent) return;
    lbContent.innerHTML = '<div style="text-align:center; color:#aaa; margin-top:20px;">⏳ Memindai data seluruh pemain...</div>';

    try {
        const snap = await getDocs(collection(db, "users"));
        let usersData = [];
        snap.forEach(docSnap => {
            const d = docSnap.data();
            if (d.username) {
                usersData.push({ name: d.username, level: d.level || 1, gold: d.gold || 0, class: d.characterClass || '-', tower: d.towerFloor || 1 });
            }
        });

        if (type === 'level') usersData.sort((a, b) => b.level - a.level);
        if (type === 'gold') usersData.sort((a, b) => b.gold - a.gold);
        if (type === 'tower') usersData.sort((a, b) => b.tower - a.tower);

        let html = '<table style="width:100%; border-collapse:collapse; font-size:12px; text-align:center;"><tr style="background:#222; color:#fff; border-bottom:2px solid #555;"><th style="padding:8px 5px;">Rank</th><th style="padding:8px 5px; text-align:left;">Nama</th><th style="padding:8px 5px;">Class</th><th style="padding:8px 5px;">Pencapaian</th></tr>';

        for (let i = 0; i < Math.min(10, usersData.length); i++) {
            const u = usersData[i];
            let valStr = ""; let valColor = "#fff";
            if (type === 'level') { valStr = `Lv. ${u.level}`; valColor = '#00d2ff'; }
            if (type === 'gold') { valStr = `💰 ${u.gold.toLocaleString()}`; valColor = '#ffcc00'; }
            if (type === 'tower') { valStr = `🗼 Lantai ${u.tower}`; valColor = '#e040fb'; }

            let rankColor = '#aaa'; let rankIcon = `#${i + 1}`;
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
    } catch (err) { lbContent.innerHTML = `<div style="text-align:center; color:#dc3545; margin-top:20px;">Gagal memuat: ${err.message}</div>`; }
};

// ==========================================
// RENDER QUEST UI & PANELS
// ==========================================
window.renderQuestUI = function (questData) {
    const btnTake = document.getElementById('btn-take-quest');
    const dTitle = document.getElementById('quest-daily-title'); const dProg = document.getElementById('quest-daily-prog'); const btnClaimD = document.getElementById('btn-claim-daily');
    const bTitle = document.getElementById('quest-bounty-title'); const bProg = document.getElementById('quest-bounty-prog'); const btnClaimB = document.getElementById('btn-claim-bounty');

    if (!btnTake) return;
    const today = new Date().toLocaleDateString('id-ID');

    if (questData && questData.lastReset === today) {
        btnTake.style.display = 'none';
        if (questData.daily) {
            const dq = questData.daily;
            if (dTitle) dTitle.innerText = dq.title; if (dProg) dProg.innerText = `${dq.progress} / ${dq.target}`;
            if (dq.isClaimed) { if (btnClaimD) { btnClaimD.style.display = 'inline-block'; btnClaimD.innerText = "Selesai"; btnClaimD.disabled = true; btnClaimD.style.background = "#555"; btnClaimD.style.color = "#888"; } }
            else if (dq.progress >= dq.target) { if (btnClaimD) { btnClaimD.style.display = 'inline-block'; btnClaimD.innerText = "Klaim Hadiah"; btnClaimD.disabled = false; btnClaimD.style.background = "#ffca28"; btnClaimD.style.color = "#000"; } }
            else { if (btnClaimD) btnClaimD.style.display = 'none'; }
        }
        if (questData.bounty) {
            const bq = questData.bounty;
            if (bTitle) bTitle.innerText = bq.title; if (bProg) bProg.innerText = `${bq.progress} / ${bq.target}`;
            if (bq.isClaimed) { if (btnClaimB) { btnClaimB.style.display = 'inline-block'; btnClaimB.innerText = "Selesai"; btnClaimB.disabled = true; btnClaimB.style.background = "#555"; btnClaimB.style.color = "#888"; } }
            else if (bq.progress >= bq.target) { if (btnClaimB) { btnClaimB.style.display = 'inline-block'; btnClaimB.innerText = "Klaim Hadiah"; btnClaimB.disabled = false; btnClaimB.style.background = "#ffca28"; btnClaimB.style.color = "#000"; } }
            else { if (btnClaimB) btnClaimB.style.display = 'none'; }
        }
    } else {
        btnTake.style.display = 'block';
        if (dTitle) dTitle.innerText = "-"; if (dProg) dProg.innerText = "0/0"; if (btnClaimD) btnClaimD.style.display = 'none';
        if (bTitle) bTitle.innerText = "-"; if (bProg) bProg.innerText = "0/0"; if (btnClaimB) btnClaimB.style.display = 'none';
    }
};

window.bukaPanelKhusus = function (panelId) {
    const panels = ['panel-bank', 'panel-auction', 'panel-blacksmith', 'panel-crafting'];
    const targetPanel = document.getElementById(panelId);
    if (targetPanel && targetPanel.style.display === 'block') { targetPanel.style.display = 'none'; return; }
    panels.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    if (targetPanel) { targetPanel.style.display = 'block'; targetPanel.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
};

window.togglePanel = function (panelId) {
    const el = document.getElementById(panelId);
    if (el) { el.style.display = el.style.display === 'none' ? 'block' : 'none'; if (el.style.display === 'block') el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
};

// ==========================================
// MODAL SHOP
// ==========================================
let currentBuyItem = null; let currentBuyPrice = 0; let currentBuyCurrency = 'Gold';
window.openBuyModal = function (itemName, price, currency) {
    currentBuyItem = itemName; currentBuyPrice = price; currentBuyCurrency = currency;
    const modal = document.getElementById('buy-modal');
    if (!modal) return window.rpgAlert("Error: HTML Modal Pembelian belum terpasang!");

    document.getElementById('buy-modal-title').innerText = `Beli [${itemName}]`;
    document.getElementById('buy-modal-qty').value = 1;
    document.getElementById('buy-modal-currency').innerText = currency;
    document.getElementById('buy-modal-currency').style.color = currency === 'Coin' ? '#ffcc00' : '#e0a800';

    const iconContainer = document.getElementById('buy-modal-icon');
    if (iconContainer && typeof getIconHTML === 'function') iconContainer.innerHTML = getIconHTML(itemName);
    window.updateModalTotal(); modal.style.display = 'flex';
};

window.updateModalTotal = function() {
    const qty = parseInt(document.getElementById('buy-modal-qty').value) || 1;
    document.getElementById('buy-modal-total').innerText = (currentBuyPrice * qty).toLocaleString();
};

document.addEventListener('input', (e) => {
    if (e.target.id === 'buy-modal-qty') {
        let val = parseInt(e.target.value); if (val < 1) e.target.value = 1; if (val > 999) e.target.value = 999; window.updateModalTotal();
    }
});

document.addEventListener('click', async (e) => {
    if (e.target.id === 'btn-cancel-buy') document.getElementById('buy-modal').style.display = 'none';
    if (e.target.id === 'btn-confirm-buy') {
        const qty = parseInt(document.getElementById('buy-modal-qty').value) || 1;
        const btn = document.getElementById('btn-confirm-buy');
        btn.disabled = true; btn.innerText = "⏳ PROSES..."; btn.style.background = "#555";

        try {
            const userRef = doc(db, "users", window.currentUserUid);
            const totalCost = currentBuyPrice * qty;
            await runTransaction(db, async (ts) => {
                const snap = await ts.get(userRef);
                if (!snap.exists()) throw "User tidak ditemukan.";
                const data = snap.data(); let updates = {};
                if (currentBuyCurrency === 'Gold') { if ((data.gold || 0) < totalCost) throw `Gold tidak cukup! Butuh ${totalCost.toLocaleString()} Gold.`; updates.gold = data.gold - totalCost; }
                else if (currentBuyCurrency === 'Coin') { if ((data.coin || 0) < totalCost) throw `Coin Premium tidak cukup! Butuh ${totalCost.toLocaleString()} Coin.`; updates.coin = data.coin - totalCost; }
                
                let inv = data.inventory || {}; inv[currentBuyItem] = (inv[currentBuyItem] || 0) + qty; updates.inventory = inv;
                ts.update(userRef, updates);
            });
            document.getElementById('buy-modal').style.display = 'none';
        } catch (err) { window.rpgAlert("❌ " + err); } 
        finally { btn.disabled = false; btn.innerText = "BELI"; btn.style.background = "#28a745"; }
    }
});

// ==========================================
// RENDER CRAFTING UI
// ==========================================
window.renderCraftingUI = function (playerInvData, playerLevel, playerGold) {
    const grid = document.getElementById('crafting-recipe-grid');
    if (!grid || typeof CRAFTING_RECIPES === 'undefined') return;
    window._craftingCache = { inv: playerInvData || {}, lvl: playerLevel || 1, gold: playerGold || 0 };
    let html = "";
    for (const recipeName in CRAFTING_RECIPES) {
        const recipe = CRAFTING_RECIPES[recipeName]; const itemName = recipe.resultItem;
        let iconHtml = "📦"; try { iconHtml = getIconHTML(itemName); } catch (e) { }
        html += `<div title="${recipeName}" onclick="window.showCraftingDetails('${recipeName}')" style="cursor: pointer; display: inline-block; margin: 2px; transition: 0.2s; filter: drop-shadow(0 0 2px rgba(0,0,0,0.5));" onmouseover="this.style.filter='drop-shadow(0 0 6px #ffca28)'" onmouseout="this.style.filter='drop-shadow(0 0 2px rgba(0,0,0,0.5))'">${iconHtml}</div>`;
    }
    grid.innerHTML = html;
    const activeRecipe = document.getElementById('crafting-details').getAttribute('data-active-recipe');
    if (activeRecipe && CRAFTING_RECIPES[activeRecipe]) window.showCraftingDetails(activeRecipe);
};

window.showCraftingDetails = function (recipeName) {
    const detailsContainer = document.getElementById('crafting-details'); if (!detailsContainer) return;
    detailsContainer.setAttribute('data-active-recipe', recipeName);
    const recipe = CRAFTING_RECIPES[recipeName]; if (!recipe) return;
    const cache = window._craftingCache || { inv: {}, lvl: 1, gold: 0 };
    const safeGetIcon = (name) => { try { return getIconHTML(name); } catch (e) { return "📦"; } };
    let mainIconHtml = safeGetIcon(recipe.resultItem); let matsHtml = "";

    for (const [matName, qtyNeeded] of Object.entries(recipe.materials)) {
        const playerHas = cache.inv[matName] || 0; const qtyColor = playerHas >= qtyNeeded ? "#a6e3a1" : "#ff4c4c";
        matsHtml += `<div title="${matName}" style="position: relative; display: inline-block; margin: 0 4px;">${safeGetIcon(matName)}<div style="position: absolute; bottom: -5px; right: -5px; font-size: 11px; font-weight: bold; color: ${qtyColor}; background: rgba(0,0,0,0.85); padding: 2px 5px; border-radius: 4px; border: 1px solid #444; z-index: 10;">${playerHas}/${qtyNeeded}</div></div>`;
    }

    const lvlColor = cache.lvl >= recipe.reqLevel ? "#fff" : "#ff4c4c"; const goldColor = cache.gold >= recipe.reqGold ? "#ffca28" : "#ff4c4c";
    detailsContainer.innerHTML = `
        <div title="${recipeName}" style="margin-bottom: 20px; display: flex; justify-content: center; align-items: center; filter: drop-shadow(0 0 10px rgba(255, 202, 40, 0.4));"><div style="transform: scale(1.3); pointer-events: none;">${mainIconHtml}</div></div>
        <h4 style="color: #ffca28; margin: 0 0 10px 0;">${recipeName}</h4>
        <div style="display: flex; gap: 10px; margin-bottom: 15px;">
            <div style="font-size: 11px; background: #1f2428; padding: 4px 10px; border-radius: 3px; border: 1px solid #444; color: ${lvlColor};">🎯 Lv.${recipe.reqLevel}</div>
            <div style="font-size: 11px; background: #1f2428; padding: 4px 10px; border-radius: 3px; border: 1px solid #444; color: ${goldColor};">💰 ${recipe.reqGold.toLocaleString()}</div>
        </div>
        <div style="font-size: 11px; color: #aaa; margin-bottom: 12px;">Dibutuhkan:</div>
        <div style="display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; margin-bottom: 20px;">${matsHtml}</div>
        <button onclick="window.actionCraftItem('${recipeName}')" style="background: #238636; color: white; border: none; padding: 10px 20px; border-radius: 4px; font-weight: bold; cursor: pointer; width: 90%; transition: 0.2s; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">⚒️ TEMPA SEKARANG</button>
    `;
};

// ==========================================
// CLAIM GIFT CODE
// ==========================================
window.claimGiftCode = async function () {
    const inputEl = document.getElementById('input-redeem-code');
    if (!inputEl) return;
    let codeName = inputEl.value.trim().toUpperCase().replace(/\s+/g, '');
    if (!codeName) return window.rpgAlert("❌ Silakan masukkan kode redeem terlebih dahulu!");

    try {
        inputEl.disabled = true;
        await runTransaction(db, async (transaction) => {
            const codeRef = doc(db, "giftCodes", codeName);
            const userRef = doc(db, "users", window.currentUserUid);
            const codeSnap = await transaction.get(codeRef);
            if (!codeSnap.exists()) throw new Error("❌ Kode tidak valid atau tidak ditemukan.");
            
            const codeData = codeSnap.data();
            const claimedArray = codeData.claimedBy || [];
            if (claimedArray.includes(window.currentUserUid)) throw new Error("⚠️ Anda sudah pernah menukarkan kode ini!");
            if (claimedArray.length >= codeData.limit) throw new Error("😭 Yah, kuota untuk kode ini sudah habis diklaim.");

            const userSnap = await transaction.get(userRef);
            if (!userSnap.exists()) throw new Error("Gagal membaca data pemain.");
            const userData = userSnap.data();

            let newGold = (userData.gold || 0) + (codeData.gold || 0); let newCoin = (userData.coin || 0) + (codeData.coin || 0); let newInv = userData.inventory || {};
            let rewardMsg = [];
            if (codeData.gold > 0) rewardMsg.push(`💰 ${codeData.gold.toLocaleString()} Gold`);
            if (codeData.coin > 0) rewardMsg.push(`🪙 ${codeData.coin.toLocaleString()} Coin`);
            if (codeData.itemName && codeData.itemQty > 0) { newInv[codeData.itemName] = (newInv[codeData.itemName] || 0) + codeData.itemQty; rewardMsg.push(`📦 ${codeData.itemName} (x${codeData.itemQty})`); }

            claimedArray.push(window.currentUserUid);
            transaction.update(codeRef, { claimedBy: claimedArray });
            transaction.update(userRef, { gold: newGold, coin: newCoin, inventory: newInv });
            window._tempGiftRewardMsg = `🎉 SELAMAT! Anda berhasil menukarkan kode.\n\nMendapatkan:\n${rewardMsg.join('\n')}`;
        });
        window.rpgAlert(window._tempGiftRewardMsg, "Klaim Berhasil");
        inputEl.value = "";
    } catch (err) { window.rpgAlert(err.message, "Gagal Klaim"); } 
    finally { inputEl.disabled = false; }
};

// ==========================================
// FRIENDS UI ROUTERS & BLACKSMITH
// ==========================================
window.toggleFriendTab = function (tab) {
    document.getElementById('tab-friend-list').style.display = tab === 'list' ? 'block' : 'none';
    document.getElementById('tab-friend-req').style.display = tab === 'req' ? 'block' : 'none';
    document.getElementById('btn-tab-list').style.background = tab === 'list' ? '#238636' : '#333';
    document.getElementById('btn-tab-req').style.background = tab === 'req' ? '#8957e5' : '#333';
};
window.sendFriendReqManual = async function () {
    const inputVal = document.getElementById('input-add-friend').value.trim(); if (!inputVal) return window.rpgAlert("Masukkan Nickname atau UID!");
    try {
        const q = query(collection(db, "users"), where("username", "==", inputVal));
        const querySnapshot = await getDocs(q);
        let targetUid = !querySnapshot.empty ? querySnapshot.docs[0].id : inputVal;
        
        if (querySnapshot.empty) {
            const docSnap = await getDoc(doc(db, "users", inputVal));
            if (!docSnap.exists()) return window.rpgAlert(`Pemain tidak ditemukan!`, "Gagal");
        }
        await sendFriendRequest(db, window.currentUserUid, window.currentPlayerStats, targetUid);
        window.rpgAlert(`Permintaan pertemanan berhasil dikirim!`, "Sukses"); document.getElementById('input-add-friend').value = "";
    } catch (err) { window.rpgAlert(typeof err === 'string' ? err : "Terjadi kesalahan.", "Gagal"); }
};
window.accFriend = async function (reqUid, reqName, reqLevel) { try { await acceptFriendRequest(db, window.currentUserUid, window.currentPlayerStats, reqUid, { username: reqName, level: reqLevel }); } catch (err) { console.error(err); } };
window.rejFriend = async function (reqUid) { try { await rejectFriendRequest(db, window.currentUserUid, reqUid); } catch (err) { console.error(err); } };
window.delFriend = async function (targetUid) { if (await window.rpgConfirm("Yakin ingin menghapus teman ini?", "Hapus Teman")) { try { await removeFriend(db, window.currentUserUid, targetUid); } catch (err) { console.error(err); } } };

window.addBlacksmithLog = function (msg, color) {
    const logPanel = document.getElementById('bs-log-panel');
    if (logPanel) { logPanel.innerHTML += `<div style="color: ${color}; margin-bottom: 3px;">[${new Date().toLocaleTimeString('id-ID', { hour12: false })}] ${msg}</div>`; logPanel.scrollTop = logPanel.scrollHeight; }
};
window.resetEquip = function () {
    window.bsSelectedEquip = null;
    const elIcon = document.getElementById('bs-icon-equip'); const elText = document.getElementById('bs-text-equip'); const costText = document.getElementById('bs-info-cost');
    if (elIcon) elIcon.innerHTML = "🛡️"; if (elText) { elText.innerText = "Pilih Equip"; elText.style.color = "#aaa"; }
    if (costText) costText.innerText = "Silakan pilih Equipment."; window.addBlacksmithLog("[SISTEM] Equipment dikeluarkan dari tungku.", "#aaa");
};
window.resetCatalyst = function () {
    window.bsSelectedCatalyst = "Tanpa Batu Tambahan";
    const elIcon = document.getElementById('bs-icon-catalyst'); const elText = document.getElementById('bs-text-catalyst');
    if (elIcon) elIcon.innerHTML = "💎"; if (elText) { elText.innerText = "Tanpa Batu"; elText.style.color = "#aaa"; }
    window.addBlacksmithLog("[SISTEM] Batu katalis dikosongkan.", "#aaa");
};