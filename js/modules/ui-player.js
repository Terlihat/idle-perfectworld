import { escapeHTML } from './ui-utils.js';
import { getVipStats } from './vip.js';

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
    if (elUid) {
        const shortUid = uid ? uid.substring(0, 6) + "..." : "-";
        elUid.innerText = shortUid;
    }
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
        if (btnTake) btnTake.style.display = 'block';
        qDailyTitle.innerText = "Belum Diambil";
        qDailyProg.innerText = "0/0";
        qBountyTitle.innerText = "Belum Diambil";
        qBountyProg.innerText = "0/0";
        if (btnClaimDaily) btnClaimDaily.style.display = 'none';
        if (btnClaimBounty) btnClaimBounty.style.display = 'none';
    } else {
        if (btnTake) btnTake.style.display = 'none';
        qDailyTitle.innerText = q.daily.title;
        qDailyProg.innerText = `${q.daily.progress}/${q.daily.target}`;
        if (q.daily.isClaimed) {
            qDailyProg.innerText = "✅ Selesai";
            if (btnClaimDaily) btnClaimDaily.style.display = 'none';
        } else if (q.daily.progress >= q.daily.target) {
            if (btnClaimDaily) btnClaimDaily.style.display = 'inline-block';
        } else {
            if (btnClaimDaily) btnClaimDaily.style.display = 'none';
        }
        qBountyTitle.innerText = q.bounty.title;
        qBountyProg.innerText = `${q.bounty.progress}/${q.bounty.target}`;
        if (q.bounty.isClaimed) {
            qBountyProg.innerText = "✅ Selesai";
            if (btnClaimBounty) btnClaimBounty.style.display = 'none';
        } else if (q.bounty.progress >= q.bounty.target) {
            if (btnClaimBounty) btnClaimBounty.style.display = 'inline-block';
        } else {
            if (btnClaimBounty) btnClaimBounty.style.display = 'none';
        }
    }
}