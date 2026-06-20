import { getVipStats } from './vip.js';
import { CRAFTING_RECIPES } from './crafting.js';
import { ITEM_DB } from '../data/items.js';

export function escapeHTML(str) { 
    return str ? str.toString().replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])) : ""; 
}

let ITEM_ICONS = { "default": { col: 0, row: 0 } };

fetch('./data/items.json')
    .then(response => response.json())
    .then(data => {
        ITEM_ICONS = data;
        console.log("✅ Kamus Ikon berhasil dimuat!");
    })
    .catch(err => console.error("❌ Gagal memuat items.json:", err));

export function getIconHTML(itemName) {
    const pos = ITEM_ICONS[itemName] || ITEM_ICONS["default"];
    const posX = -(pos.col * 32);
    const posY = -(pos.row * 32);
    return `<i class="pw-icon" style="background-position: ${posX}px ${posY}px;"></i>`;
}

// 1. RENDER PROFIL & STATUS
export function renderPlayerUI(d, uid, globalGuilds, guildUpgradesMap) {
    const btnAdmin = document.getElementById('btn-admin-panel');
    if (btnAdmin) btnAdmin.style.display = (d.role === 'admin') ? 'inline-block' : 'none';

    if (!document.getElementById('player-name')) return null;

    const vipHtml = (d.vipLevel && d.vipLevel > 0) ? `<span class="vip-badge">VIP ${d.vipLevel}</span>` : "";
    document.getElementById('player-name').innerHTML = `${vipHtml}${escapeHTML(d.username || "Hero Anonim")}`;
    document.getElementById('player-class').innerText = d.characterClass;
    document.getElementById('player-level').innerText = d.level || 1;
    document.getElementById('header-gold').innerText = (d.gold || 0).toLocaleString();
    document.getElementById('header-coin').innerText = (d.coin || 0).toLocaleString();
    document.getElementById('player-bank').innerText = (d.bankGold || 0).toLocaleString();
    
    const elUid = document.getElementById('player-uid');
    if (elUid) elUid.innerText = uid;

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

    const effectiveMaxHp = (d.maxHp || 1000) + gBuff.hp;

    const maxExp = (d.level || 1) * 100;
    document.getElementById('exp-text').innerText = `${d.exp || 0} / ${maxExp}`;
    document.getElementById('exp-bar').style.width = `${Math.min(((d.exp || 0) / maxExp) * 100, 100)}%`;

    let curHp = Number(d.currentHp);
    if (isNaN(curHp) || curHp === undefined) curHp = effectiveMaxHp;

    document.getElementById('char-hp-text').innerText = `${curHp} / ${effectiveMaxHp}`;
    document.getElementById('char-hp-bar').style.width = `${Math.min((curHp / effectiveMaxHp) * 100, 100)}%`;

    document.getElementById('char-mp-text').innerText = `${d.currentMp} / ${d.maxMp}`;
    document.getElementById('char-mp-bar').style.width = `${Math.min((d.currentMp / d.maxMp) * 100, 100)}%`;
    
    // --- STAMINA & VIP (BERSIH) ---
    const vipStats = getVipStats(d.vipLevel);
    const maxStam = (d.maxStamina || 100) + (vipStats?.extraMaxStamina || 0); 
    
    let curStam = d.currentStamina || 0;
    if (curStam > maxStam) curStam = maxStam;
    
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
    
    document.getElementById('stat-patk').innerText = patk; 
    document.getElementById('stat-matk').innerText = matk;
    document.getElementById('stat-def').innerText = def; 
    document.getElementById('stat-crit').innerText = (d.dex * 0.5).toFixed(1) + "%";
    document.getElementById('stat-eva').innerText = (d.dex * 0.2).toFixed(1) + "%"; 
    document.getElementById('stat-acc').innerText = (80 + (d.dex * 0.5) + Math.floor((eq.accessory?.accBonus || 0) * cBonus)).toFixed(1) + "%";

    return { 
        uid: uid, username: d.username, 
        level: d.level, currentHp: curHp, maxHp: effectiveMaxHp, currentStamina: curStam,
        str: d.str, con: d.con, int: d.int, dex: d.dex,
        patk: patk, matk: matk, def: def, equipment: eq,
        guildId: d.guildId, gold: d.gold
    };
}

// 2. RENDER SISTEM QUEST
export function renderQuestUI(q) {
    if (!q) return;
    const btnTake = document.getElementById('btn-take-quest');
    const qDailyTitle = document.getElementById('quest-daily-title');
    const qDailyProg = document.getElementById('quest-daily-prog');
    const qBountyTitle = document.getElementById('quest-bounty-title');
    const qBountyProg = document.getElementById('quest-bounty-prog');
    const btnClaimDaily = document.getElementById('btn-claim-daily');
    const btnClaimBounty = document.getElementById('btn-claim-bounty');

    if (!qDailyTitle || !qDailyProg || !qBountyTitle || !qBountyProg) return;

    const today = new Date().toLocaleDateString('id-ID');
    
    if (q.lastReset !== today) {
        if(btnTake) btnTake.style.display = 'block';
        qDailyTitle.innerText = "Belum Diambil";
        qDailyProg.innerText = "0/0";
        qBountyTitle.innerText = "Belum Diambil";
        qBountyProg.innerText = "0/0";
        if(btnClaimDaily) btnClaimDaily.style.display = 'none';
        if(btnClaimBounty) btnClaimBounty.style.display = 'none';
    } else {
        if(btnTake) btnTake.style.display = 'none';
        
        qDailyTitle.innerText = q.daily.title;
        qDailyProg.innerText = `${q.daily.progress}/${q.daily.target}`;
        
        if (q.daily.isClaimed) { 
            qDailyProg.innerText = "✅ Selesai"; 
            if(btnClaimDaily) btnClaimDaily.style.display = 'none'; 
        } else if (q.daily.progress >= q.daily.target) { 
            if(btnClaimDaily) btnClaimDaily.style.display = 'inline-block'; 
        } else { 
            if(btnClaimDaily) btnClaimDaily.style.display = 'none'; 
        }

        qBountyTitle.innerText = q.bounty.title;
        qBountyProg.innerText = `${q.bounty.progress}/${q.bounty.target}`;
        
        if (q.bounty.isClaimed) { 
            qBountyProg.innerText = "✅ Selesai"; 
            if(btnClaimBounty) btnClaimBounty.style.display = 'none'; 
        } else if (q.bounty.progress >= q.bounty.target) { 
            if(btnClaimBounty) btnClaimBounty.style.display = 'inline-block'; 
        } else { 
            if(btnClaimBounty) btnClaimBounty.style.display = 'none'; 
        }
    }
}

// 3. RENDER GRID TAS (INVENTORY) DENGAN BADGE REFINE & STACK LIMIT
export function renderInventoryUI(inventory) {
    const invGrid = document.getElementById('inventory-grid');
    if (!invGrid) return;
    
    let html = "";
    let renderSlots = []; // Antrean kotak yang akan dirender
    
    // Urutkan item berdasarkan abjad
    let items = Object.entries(inventory || {}).sort((a, b) => a[0].localeCompare(b[0]));
    
    // 1. PROSES PEMBELAHAN ITEM BERDASARKAN STACK LIMIT
    for (const [name, totalQty] of items) {
        if (totalQty <= 0) continue;
        
        // Deteksi nama dasar dan level plus untuk UI
        let baseName = name.replace(/\s\[\+\d+\]$/, '');
        let badgeHtml = "";
        const match = name.match(/\[\+(\d+)\]$/);
        
        if (match) { // Jika punya nilai plus (+1, +2, dst)
            badgeHtml = `<div style="position:absolute; top:-5px; right:-5px; background:#dc3545; color:white; font-size:10px; font-weight:bold; padding:2px 4px; border-radius:4px; z-index:10; box-shadow: 0 0 3px black;">+${match[1]}</div>`;
        }
        
        // Cek tipe item dari database untuk menentukan batas tumpukan
        const itemInfo = ITEM_DB[baseName] || { type: 'misc' };
        
        let maxStack = 99; // Default potion/item biasa
        if (['weapon', 'armor', 'accessory', 'mount'].includes(itemInfo.type)) maxStack = 1;
        else if (['catalyst', 'material'].includes(itemInfo.type)) maxStack = 1000;
        else if (['potion'].includes(itemInfo.type)) maxStack = 99;
        
        // Belah item jika melebihi batas maksimal (Stack Limit)
        let remainingQty = totalQty;
        while (remainingQty > 0) {
            let currentSlotQty = Math.min(remainingQty, maxStack);
            
            // Masukkan kotak yang sudah dibelah ke dalam antrean
            renderSlots.push({
                name: name,
                baseName: baseName,
                badgeHtml: badgeHtml,
                qty: currentSlotQty
            });
            
            remainingQty -= currentSlotQty;
        }
    }
    
    // 2. RENDER SEMUA KOTAK YANG TERISI KE DALAM HTML
    for (let i = 0; i < renderSlots.length; i++) {
        const slot = renderSlots[i];
        
        // Jangan tampilkan tulisan x1 jika itemnya adalah equipment (opsional agar lebih rapi)
        const qtyText = (slot.qty > 1) ? `<span class="inv-qty">x${slot.qty}</span>` : "";

        html += `
        <div class="inv-slot filled" onclick="window.handleInventoryClick('${escapeHTML(slot.name)}')">
            ${slot.badgeHtml}
            ${getIconHTML(slot.baseName)} 
            <span style="font-size:10px;">${escapeHTML(slot.baseName)}</span>
            ${qtyText}
        </div>`;
    }
    
    // 3. TAMBAHKAN KOTAK KOSONG (Minimal Tas Selalu Punya 20 Kotak)
    const minSlots = 20;
    const totalSlotsToRender = Math.max(minSlots, renderSlots.length); // Jika item > 20, tas akan memanjang otomatis
    
    for (let i = renderSlots.length; i < totalSlotsToRender; i++) {
        html += `<div class="inv-slot"></div>`;
    }
    
    invGrid.innerHTML = html;
}

// 4. RENDER GRID BANK
export function renderBankUI(bankInventory) {
    const bankGrid = document.getElementById('bank-grid');
    if (!bankGrid) return;
    bankGrid.innerHTML = "";
    let bankItems = Object.entries(bankInventory || {}).sort((a, b) => a[0].localeCompare(b[0]));
    for (let i = 0; i < 16; i++) { 
        if (i < bankItems.length) {
            const [name, qty] = bankItems[i];
            bankGrid.innerHTML += `
            <div class="bank-slot filled" onclick="window.handleBankClick('${escapeHTML(name)}')">
                ${getIconHTML(name)}
                <span style="font-size:10px;">${escapeHTML(name)}</span>
                <span class="inv-qty">x${qty}</span>
            </div>`;
        } else { bankGrid.innerHTML += `<div class="bank-slot"></div>`; }
    }
}

// 5. RENDER KOTAK SURAT (DENGAN LOG PERTARUNGAN & HADIAH)
export function renderMailboxUI(mails) {

    const mailboxPanel = document.getElementById('mailbox-list'); 
    if (!mailboxPanel) return;

    // Pastikan mails adalah array
    const mailList = Array.isArray(mails) ? mails : [];
    
    let html = `<h3 style="border-bottom: 1px solid #ffcc00; padding-bottom: 5px; color:#ffcc00;">📬 Kotak Surat</h3>`;
    
    if (mailList.length === 0) {
        html += `<p style="text-align:center; color:#aaa; font-size:11px; margin-top:15px;">Tidak ada surat.</p>`;
    } else {
        // Mengurutkan dari surat terbaru
        const sortedMails = [...mailList].sort((a, b) => b.id.localeCompare(a.id)); 
        
        html += `<div style="max-height: 300px; overflow-y: auto; margin-top:10px; display:flex; flex-direction:column; gap:8px;">`;
        
        sortedMails.forEach(mail => {
            const icon = mail.isRead ? "📭" : "📩";
            const color = mail.isRead ? "#777" : "#fff";
            const border = mail.isRead ? "#333" : "#ffcc00";
            
            // 1. Format Isi Surat (Log Pertarungan / Teks)
            const formattedContent = escapeHTML(mail.content || "").replace(/\n/g, '<br>');

            // 2. Format Lampiran Hadiah (Logika Asli Anda)
            let rewardText = "";
            let btnKlaim = "";
            
            if (mail.attachments) {
                let rewards = [];
                const rName = mail.attachments.itemName || mail.attachments.name;
                if (rName) rewards.push(`[${escapeHTML(rName)}] x${mail.attachments.qty || 1}`);
                if (mail.attachments.gold > 0) rewards.push(`${mail.attachments.gold} Gold`);
                if (mail.attachments.coin > 0) rewards.push(`${mail.attachments.coin} COIN`);

                if (rewards.length > 0) {
                    rewardText = `<div style="color:#28a745; font-size:11px; margin-top:5px; font-weight:bold;">🎁 Hadiah: ${rewards.join(', ')}</div>`;
                }
                
                // Tombol Klaim / Keterangan Selesai
                if (!mail.isClaimed) { 
                    btnKlaim = `<button onclick="event.stopPropagation(); window.claimMail('${mail.id}')" style="flex:1; background: #28a745; color: white; border: none; padding: 6px; border-radius: 3px; cursor: pointer; font-size: 10px; font-weight: bold;">🎁 Klaim Hadiah</button>`; 
                } else {
                    btnKlaim = `<button disabled style="flex:1; background: #555; color: #888; border: none; padding: 6px; border-radius: 3px; font-size: 10px;">✅ Diklaim</button>`;
                }
            }

            // 3. Merakit Tampilan HTML (Bisa di-klik untuk membuka lipatan surat)
            html += `
            <div style="background: #121216; border: 1px solid ${border}; padding: 8px; border-radius: 5px; cursor: pointer;" 
                 onclick="this.querySelector('.mail-body').style.display = this.querySelector('.mail-body').style.display === 'none' ? 'block' : 'none';">
                
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <strong style="color: ${color}; font-size: 12px;">${icon} [Sistem] ${escapeHTML(mail.title || "Pesan")}</strong>
                    <span style="font-size: 9px; color: #888;">${escapeHTML(mail.date || "")}</span>
                </div>
                
                <div class="mail-body" style="display: none; margin-top: 8px; font-size: 10px; color: #ccc; border-top: 1px dashed #444; padding-top: 8px; font-family: monospace; line-height: 1.4;">
                    ${formattedContent}
                    ${rewardText}
                    
                    <div style="margin-top: 10px; display: flex; gap: 5px;">
                        ${btnKlaim}
                        <button onclick="event.stopPropagation(); window.deleteMail('${mail.id}')" style="flex:1; background: #dc3545; color: white; border: none; padding: 6px; border-radius: 3px; cursor: pointer; font-size: 10px;">🗑️ Hapus</button>
                    </div>
                </div>
            </div>`;
        });
        html += `</div>`;
    }
    
    mailboxPanel.innerHTML = html;
}

// 6. RENDER PASAR LELANG
export function renderAuctionUI(items, currentUserUid) {
    const auctionList = document.getElementById('auction-list');
    if (!auctionList) return; 
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
                btnHtml += `<button onclick="window.cancelAuction('${item.id}')" style="padding:2px 5px; font-size:9px; background:#555;">Tarik</button>`;
            }
        } else {
            const currentBid = item.highestBid ? item.highestBid.amount : 0;
            if (!isExpired) {
                btnHtml += `<div style="font-size:9px; margin-bottom:4px;">Bid: ${currentBid > 0 ? currentBid + 'G' : '-'}</div>`;
                btnHtml += `<button onclick="window.placeBid('${item.id}', '${escapeHTML(item.itemName)}', ${currentBid})" style="padding:2px 5px; font-size:9px; background:#007bff;">Tawar</button> `;
                btnHtml += `<button onclick="window.buyFromAuction('${item.id}', '${escapeHTML(item.itemName)}', ${itemPrice}, '${item.sellerId}')" style="padding:2px 5px; font-size:9px; background:#e0a800;">Beli ${itemPrice}G</button>`;
            } else { btnHtml += `<span style="color:#dc3545; font-size:10px;">Selesai</span>`; }
        }
        auctionList.innerHTML += `<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #333; padding: 6px 0;"><div><strong style="color:#00d2ff;">${escapeHTML(item.itemName)}</strong><br><span style="font-size:10px; color:#aaa;">Penjual: ${escapeHTML(item.sellerName)} | 💰 ${itemPrice.toLocaleString()}G</span></div><div style="text-align: right;">${btnHtml}</div></div>`;
    });
}

// 7. RENDER PARTY
export function renderPartyUI(parties, currentUserUid) {
    const partyList = document.getElementById('party-list');
    if (!partyList) return;
    partyList.innerHTML = parties.length === 0 ? "Tidak ada party yang mencari anggota." : "";
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

// 8. RENDER GUILD
export function renderGuildUI(stats, globalGuilds, guildUpgradesMap) {
    const unjoinedView = document.getElementById('guild-unjoined-view');
    const joinedView = document.getElementById('guild-joined-view');
    if (!stats || !stats.uid || !unjoinedView || !joinedView) return; 

    if (!stats.guildId || !globalGuilds[stats.guildId]) {
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

        const myGuild = globalGuilds[stats.guildId];
        const isLeader = myGuild.leaderId === stats.uid;
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
            const isMe = m.uid === stats.uid;
            const kickBtn = (isLeader && !isMe) ? `<button onclick="window.kickMemberAction('${m.uid}')" style="padding:1px 4px; font-size:8px; background:#dc3545; margin-left:5px;">Kick</button>` : '';
            memberList.innerHTML += `
            <div style="border-bottom:1px solid #333; padding:3px 0; display:flex; justify-content:space-between; align-items:center;">
                <div><span style="color:${isMe ? '#ffca28' : '#fff'};">${escapeHTML(m.name)}</span> (Lv.${m.level}) ${kickBtn}</div>
                <div style="color:#aaa;">Donasi: ${m.contribution.toLocaleString()} G</div>
            </div>`;
        });
    }
}

// 9. RENDER OBROLAN CHAT
export function renderChatUI(messages, currentChatChannel) {
    const chatBox = document.getElementById('chat-box');
    if (!chatBox) return; 
    chatBox.innerHTML = "";
    let chColor = '#aaa';
    let chLabel = 'DUNIA';
    if (currentChatChannel === 'guild') { chColor = '#28a745'; chLabel = 'GUILD'; }
    if (currentChatChannel === 'party') { chColor = '#00d2ff'; chLabel = 'PARTY'; }

    messages.forEach(m => { 
        const vipBadge = (m.vipLevel && m.vipLevel > 0) ? `<span class="vip-badge vip-chat">V${m.vipLevel}</span>` : "";
        chatBox.innerHTML += `<div><strong style="color:${chColor}; font-size:9px;">[${chLabel}]</strong> ${vipBadge} <span class="chat-name">${escapeHTML(m.username)}</span>: ${escapeHTML(m.text)}</div>`; 
    });
}

// 10. RENDER TUNGKU TEMPA (CRAFTING)
export function renderCraftingUI(inventory, playerLevel, playerGold) {
    const craftList = document.getElementById('crafting-list');
    if (!craftList) return;
    craftList.innerHTML = "";

    for (const [recipeName, recipe] of Object.entries(CRAFTING_RECIPES)) {
        let reqHtml = `Lv.${recipe.reqLevel} | 💰 ${recipe.reqGold.toLocaleString()} Gold<br>`;
        let canCraft = (playerLevel >= recipe.reqLevel) && (playerGold >= recipe.reqGold);

        let matHtml = "";
        for (const [matName, qtyNeeded] of Object.entries(recipe.materials)) {
            const hasQty = inventory[matName] || 0;
            const color = hasQty >= qtyNeeded ? "#28a745" : "#dc3545"; // Hijau jika cukup, Merah jika kurang
            if (hasQty < qtyNeeded) canCraft = false; // Jika ada 1 saja yang kurang, tombol tempa mati
            matHtml += `<span style="color:${color}; font-size:10px;">[${matName}] ${hasQty}/${qtyNeeded}</span><br>`;
        }

        let btnHtml = canCraft
            ? `<button onclick="window.actionCraftItem('${escapeHTML(recipeName)}')" style="background:#00d2ff; color:#000; font-weight:bold; padding:4px 8px; font-size:10px;">🔨 TEMPA</button>`
            : `<button disabled style="background:#555; padding:4px 8px; font-size:10px; cursor:not-allowed; border:1px solid #333;">Syarat Kurang</button>`;

        craftList.innerHTML += `
        <div style="border-bottom:1px solid #333; padding: 8px 0; display:flex; justify-content:space-between; align-items:center;">
            <div>
                <strong style="color:#ff9800; font-size:13px;">${escapeHTML(recipe.resultItem)}</strong><br>
                <span style="font-size:10px; color:#aaa;">Syarat: ${reqHtml}</span>
                <div style="margin-top:4px; padding-left:4px; border-left: 2px solid #555;">
                    ${matHtml}
                </div>
            </div>
            <div>${btnHtml}</div>
        </div>`;
    }
}

// ==========================================
// 11. SISTEM RENDER TOKO & ITEM MALL (REAL ICON)
// ==========================================

export const SHOP_ITEMS = [
    { name: 'Pedang Besi', price: 2000, currency: 'Gold' },
    { name: 'Tongkat Sihir', price: 2000, currency: 'Gold' },
    { name: 'Zirah Kulit', price: 2000, currency: 'Gold' },
    { name: 'Cincin Akurat', price: 3000, currency: 'Gold' },
    { name: 'Kuda Coklat', price: 5000, currency: 'Gold' },
    { name: 'Beruang Kutub', price: 25000, currency: 'Gold' },
    { name: 'Ramuan HP', price: 500, currency: 'Gold' },
    { name: 'Ramuan MP', price: 500, currency: 'Gold' }
];

export const MALL_ITEMS = [
    { name: 'Mirage Stone', price: 5, currency: 'Coin' },
    { name: 'Heaven Stone', price: 15, currency: 'Coin' },
    { name: 'Underworld Stone', price: 15, currency: 'Coin' },
    { name: 'Universal Stone', price: 50, currency: 'Coin' },
    { name: 'Tiket Ganti Nama', price: 50, currency: 'Coin' },
    { name: 'Tiket Ubah Job', price: 100, currency: 'Coin' },
    { name: 'Ramuan Stamina', price: 10, currency: 'Coin' },
    { name: 'Naga Terbang', price: 200, currency: 'Coin' },
    { name: 'Buku Reset Stats', price: 100, currency: 'Coin' }
];

export function renderShopAndMall() {
    const shopContainer = document.getElementById('panel-shop-grid');
    const mallContainer = document.getElementById('panel-mall-grid');
    
    function buildGrid(items) {
        let html = '<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(80px, 1fr)); gap:10px; margin-top:10px;">';
        items.forEach(item => {
            const iconHTML = getIconHTML(item.name);
            const colorPrice = item.currency === 'Coin' ? '#ffcc00' : '#e0a800';
            
            html += `
            <div onclick="window.openBuyModal('${escapeHTML(item.name)}', ${item.price}, '${item.currency}')" 
                 style="background:#121216; border:1px solid #333; border-radius:5px; padding:10px; text-align:center; cursor:pointer; transition:0.2s;">
                <div style="font-size:28px; margin-bottom:8px;">${iconHTML}</div>
                <div style="font-size:10px; color:#fff; margin-bottom:5px; line-height:1.2; height:24px;">${escapeHTML(item.name)}</div>
                <div style="font-size:11px; font-weight:bold; color:${colorPrice}; background:#222; padding:2px; border-radius:3px;">💰 ${item.price}</div>
            </div>`;
        });
        return html + '</div>';
    }

    if (shopContainer) shopContainer.innerHTML = buildGrid(SHOP_ITEMS);
    if (mallContainer) mallContainer.innerHTML = buildGrid(MALL_ITEMS);
}

// ==========================================
// 12. SISTEM RENDER ZONA PK (DARK FOREST)
// ==========================================
export function renderPKUI(pkPlayers, currentUid) {
    const container = document.getElementById('pk-player-list');
    if (!container) return;

    let html = '<div style="display:grid; gap:10px;">';
    let targetCount = 0;

    pkPlayers.forEach(p => {
        if (p.id === currentUid) return; // Jangan tampilkan diri sendiri di daftar mangsa
        targetCount++;
        
        let isRed = (p.pkKills || 0) >= 3;
        let nameColor = isRed ? '#ff4c4c' : '#fff';
        let karmaTitle = isRed ? '💀 RED NAME (Drop 20%)' : 'Pengembara (Drop 5%)';

        html += `
        <div style="background:#121216; border:1px solid ${isRed ? '#ff4c4c' : '#555'}; border-radius:5px; padding:10px; display:flex; justify-content:space-between; align-items:center;">
            <div>
                <div style="color:${nameColor}; font-weight:bold; font-size:14px;">${escapeHTML(p.username)} <span style="font-size:10px; color:#aaa;">(Lv. ${p.level || 1})</span></div>
                <div style="font-size:11px; color:#ffcc00;">${karmaTitle}</div>
            </div>
            <button onclick="window.attackPK('${p.id}', '${escapeHTML(p.username)}')" style="background:#dc3545; color:#fff; border:none; padding:8px 15px; border-radius:3px; cursor:pointer; font-weight:bold;">Serang</button>
        </div>`;
    });
    
    html += '</div>';

    if (targetCount === 0) {
        html = '<div style="text-align:center; color:#555; padding:20px;">Hutan sepi. Tidak ada pemain lain di sini.</div>';
    }

    container.innerHTML = html;
}