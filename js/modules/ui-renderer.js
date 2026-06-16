/* ===================================================
   MODUL UI RENDERER (Mesin Penggambar Tampilan)
   =================================================== */

// Fungsi untuk mencegah serangan XSS (Cross-Site Scripting)
export function escapeHTML(str) { 
    return str ? str.toString().replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])) : ""; 
}

// 1. RENDER PROFIL & STATUS
export function renderPlayerUI(d, uid, globalGuilds, guildUpgradesMap) {
    const btnAdmin = document.getElementById('btn-admin-panel');
    if (btnAdmin) btnAdmin.style.display = (d.role === 'admin') ? 'inline-block' : 'none';

    if (!document.getElementById('player-name')) return null;

    document.getElementById('player-name').innerText = d.username || "Hero Anonim";
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

    // Kalkulasi Buff Guild
    let gBuff = { atk: 0, hp: 0, def: 0 };
    if (d.guildId && globalGuilds[d.guildId]) {
        const gLvl = globalGuilds[d.guildId].level;
        gBuff = guildUpgradesMap[gLvl].buff;
        document.getElementById('guild-buff-indicator').innerText = `🛡️ Guild Buff: +${gBuff.atk} ATK, +${gBuff.hp} HP, +${gBuff.def} DEF`;
    } else {
        document.getElementById('guild-buff-indicator').innerText = `🛡️ Guild Buff: Belum bergabung.`;
    }

    const effectiveMaxHp = (d.maxHp || 1000) + gBuff.hp;

    // Render Bar
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

    // Render Raw Stats
    document.getElementById('stat-str').innerText = d.str;
    document.getElementById('stat-con').innerText = d.con;
    document.getElementById('stat-dex').innerText = d.dex;
    document.getElementById('stat-int').innerText = d.int;

    // Render Equipment Text
    const eq = d.equipment || {};
    document.getElementById('eq-weapon').innerText = eq.weapon ? `${eq.weapon.name}${eq.weapon.refine ? ` (+${eq.weapon.refine})` : ""}` : "Kosong";
    document.getElementById('eq-armor').innerText = eq.armor ? `${eq.armor.name}${eq.armor.refine ? ` (+${eq.armor.refine})` : ""}` : "Kosong";
    document.getElementById('eq-acc').innerText = eq.accessory ? `${eq.accessory.name}${eq.accessory.refine ? ` (+${eq.accessory.refine})` : ""}` : "Kosong";
    document.getElementById('eq-mount').innerText = eq.mount ? `${eq.mount.name}` : "Jalan Kaki";

    // Kalkulasi Total Power
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

    // Kembalikan objek stat untuk digunakan oleh sistem pertarungan
    return { 
        uid: uid, username: d.username, 
        level: d.level, currentHp: d.currentHp, maxHp: effectiveMaxHp, currentStamina: curStam,
        str: d.str, con: d.con, int: d.int, dex: d.dex,
        patk: patk, matk: matk, def: def, equipment: eq,
        guildId: d.guildId, gold: d.gold
    };
}

// 2. RENDER SISTEM QUEST
export function renderQuestUI(q) {
    if (!q) return;
    const today = new Date().toLocaleDateString('id-ID');
    const btnTake = document.getElementById('btn-take-quest');
    
    if (q.lastReset !== today) {
        if(btnTake) btnTake.style.display = 'block';
        document.getElementById('quest-daily-title').innerText = "Belum Diambil";
        document.getElementById('quest-daily-prog').innerText = "0/0";
        document.getElementById('quest-bounty-title').innerText = "Belum Diambil";
        document.getElementById('quest-bounty-prog').innerText = "0/0";
        document.getElementById('btn-claim-daily').style.display = 'none';
        document.getElementById('btn-claim-bounty').style.display = 'none';
    } else {
        if(btnTake) btnTake.style.display = 'none';
        
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
}

// 3. RENDER GRID TAS (INVENTORY)
export function renderInventoryUI(inventory) {
    const invGrid = document.getElementById('inventory-grid');
    if (!invGrid) return;
    invGrid.innerHTML = "";
    let items = Object.entries(inventory || {});
    for (let i = 0; i < 20; i++) {
        if (i < items.length) {
            const [name, qty] = items[i];
            invGrid.innerHTML += `<div class="inv-slot filled" onclick="window.handleInventoryClick('${escapeHTML(name)}')"><span>${escapeHTML(name)}</span><span class="inv-qty">x${qty}</span></div>`;
        } else { invGrid.innerHTML += `<div class="inv-slot">Kosong</div>`; }
    }
}

// 4. RENDER GRID BANK
export function renderBankUI(bankInventory) {
    const bankGrid = document.getElementById('bank-grid');
    if (!bankGrid) return;
    bankGrid.innerHTML = "";
    let bankItems = Object.entries(bankInventory || {});
    for (let i = 0; i < 16; i++) { 
        if (i < bankItems.length) {
            const [name, qty] = bankItems[i];
            bankGrid.innerHTML += `<div class="bank-slot filled" onclick="window.handleBankClick('${escapeHTML(name)}')"><span>${escapeHTML(name)}</span><span class="inv-qty">x${qty}</span></div>`;
        } else { bankGrid.innerHTML += `<div class="bank-slot">Kosong</div>`; }
    }
}