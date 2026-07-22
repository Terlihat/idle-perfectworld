import { escapeHTML, getIconHTML } from './ui-utils.js';

export function renderMailboxUI(mails) {
    const mailboxPanel = document.getElementById('mailbox-list') || document.getElementById('panel-mailbox');
    if (!mailboxPanel) return;
    const mailList = Array.isArray(mails) ? mails : [];
    let html = `
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #ffcc00; padding-bottom: 5px; margin-bottom: 10px;">
        <h3 style="margin: 0; color:#ffcc00; font-size: 16px;">📬 Daftar Surat</h3>
        <button onclick="window.deleteAllMails()" style="background: #dc3545; color: #fff; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold;">🗑️ Hapus Semua</button>
    </div>`;
    if (mailList.length === 0) {
        html += `<p style="text-align:center; color:#aaa; font-size:11px; margin-top:15px;">Tidak ada surat.</p>`;
    } else {
        const sortedMails = [...mailList].sort((a, b) => b.id.localeCompare(a.id));
        html += `<div style="max-height: 300px; overflow-y: auto; display:flex; flex-direction:column; gap:8px;">`;
        sortedMails.forEach(mail => {
            const icon = mail.isRead ? "📭" : "📩";
            const color = mail.isRead ? "#777" : "#fff";
            const border = mail.isRead ? "#333" : "#ffcc00";
            const formattedContent = escapeHTML(mail.content || mail.message || "").replace(/\n/g, '<br>');
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
                if (!mail.isClaimed) {
                    btnKlaim = `<button onclick="event.stopPropagation(); window.claimMail('${mail.id}')" style="flex:1; background: #28a745; color: white; border: none; padding: 6px; border-radius: 3px; cursor: pointer; font-size: 10px; font-weight: bold;">🎁 Klaim Hadiah</button>`;
                } else {
                    btnKlaim = `<button disabled style="flex:1; background: #555; color: #888; border: none; padding: 6px; border-radius: 3px; font-size: 10px;">✅ Diklaim</button>`;
                }
            }
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

        const memberList = document.getElementById('guild-member-table-body');
        if (!memberList) return;
        memberList.innerHTML = "";

        function toRoman(num) {
            const roman = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
            return roman[num] || num;
        }

        const roleWeight = { "Ketua": 5, "Wakil": 4, "Deputy": 3, "Kapten": 2, "Member": 1 };
        const getRole = (member) => member.uid === myGuild.leaderId ? "Ketua" : (member.role || "Member");
        const sortedMembers = [...myGuild.members].sort((a, b) => {
            const weightA = roleWeight[getRole(a)] || 0;
            const weightB = roleWeight[getRole(b)] || 0;
            if (weightA !== weightB) return weightB - weightA;
            return (b.contribution || 0) - (a.contribution || 0);
        });

        sortedMembers.forEach(m => {
            const isMe = m.uid === stats.uid;
            const memberRole = getRole(m);

            let roleColor = "#aaa";
            if (memberRole === "Ketua") roleColor = "#ffcc00";
            if (memberRole === "Wakil") roleColor = "#00d2ff";
            if (memberRole === "Deputy") roleColor = "#e83e8c";
            if (memberRole === "Kapten") roleColor = "#28a745";

            let actionHTML = `<span style="color:#555;">-</span>`;
            if (isLeader && !isMe) {
                actionHTML = `
                    <select onchange="window.changeRoleAction('${m.uid}', this.value)" style="background:#0d1117; color:#fff; font-size:10px; padding:2px; border:1px solid #333; border-radius:3px; outline:none;">
                        <option value="" disabled selected>Jabatan</option>
                        <option value="Wakil">Wakil</option>
                        <option value="Deputy">Deputy</option>
                        <option value="Kapten">Kapten</option>
                        <option value="Member">Member</option>
                    </select>
                    <button onclick="window.kickMemberAction('${m.uid}')" style="background:#dc3545; color:#fff; border:none; padding:3px 6px; font-size:10px; border-radius:3px; cursor:pointer; margin-left:3px; font-weight:bold;">X</button>
                `;
            }

            const rebirthCount = m.rebirth || 0;
            const rwBadge = rebirthCount > 0
                ? `<span style="color: #ff5722; font-weight: bold; font-size: 11px; margin-left: 5px;">[RW ${toRoman(rebirthCount)}]</span>`
                : "";

            memberList.innerHTML += `
            <tr style="border-bottom: 1px solid #222; background: ${isMe ? '#1a1a24' : 'transparent'};">
                <td style="padding: 6px;">
                    <strong style="color: ${isMe ? '#ffca28' : '#fff'};">${escapeHTML(m.name)}</strong>${rwBadge} 
                    <span style="color:#aaa; font-size:10px;">(Lv.${m.level})</span>
                </td>
                <td style="padding: 6px; color: ${roleColor}; font-weight: bold;">${memberRole}</td>
                <td style="padding: 6px; text-align: right; color: #ffd700;">${(m.contribution || 0).toLocaleString()} G</td>
                <td style="padding: 6px; text-align: center;">${actionHTML}</td>
            </tr>`;
        });
    }
}

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

        // 🔥 LOGIKA RENDER GM
        let displayName = escapeHTML(m.username);
        let textColor = "#ccc"; // Warna chat standar

        // Jika statusnya isAdmin (Thecakepz), ubah namanya jadi tulisan merah
        if (m.isAdmin) {
            displayName = `<strong style="color: #f84747;">GM</strong>`;
            textColor = "#fc1c1c"; // Buat isi pesannya berwarna emas agar menonjol
        }

        chatBox.innerHTML += `<div style="margin-bottom: 4px; line-height: 1.3;"><strong style="color:${chColor}; font-size:9px;">[${chLabel}]</strong> ${vipBadge} <span class="chat-name">${displayName}</span>: <span style="color: ${textColor};">${escapeHTML(m.text)}</span></div>`;
    });

    // Otomatis scroll layar chat ke pesan paling bawah setiap kali ada chat baru
    chatBox.scrollTop = chatBox.scrollHeight;
}

// ==========================================
// SISTEM UI GLOBAL LEADERBOARD 
// ==========================================
export function setupLeaderboardUI(db, getLeaderboardDataFn) {
    window.fetchLeaderboard = async function (type) {
        const lbContent = document.getElementById('leaderboard-content');
        if (!lbContent) return;

        lbContent.innerHTML = '<div style="text-align:center; color:#aaa; margin-top:20px;">⏳ Memindai data seluruh pemain...</div>';

        try {
            // 1. Panggil data dari file leaderboard.js
            const usersData = await getLeaderboardDataFn(db);

            // 2. Urutkan data berdasarkan tombol yang diklik
            if (type === 'level') usersData.sort((a, b) => b.level - a.level);
            if (type === 'gold') usersData.sort((a, b) => b.gold - a.gold);
            if (type === 'tower') usersData.sort((a, b) => b.tower - a.tower);

            // 3. Render HTML Tabel
            let html = '<table style="width:100%; border-collapse:collapse; font-size:12px; text-align:center;">';
            html += '<tr style="background:#222; color:#fff; border-bottom:2px solid #555;">';
            html += '<th style="padding:8px 5px;">Rank</th><th style="padding:8px 5px; text-align:left;">Nama</th><th style="padding:8px 5px;">Class</th><th style="padding:8px 5px;">Pencapaian</th></tr>';

            // Ambil maksimal Top 10
            for (let i = 0; i < Math.min(10, usersData.length); i++) {
                const u = usersData[i];
                let valStr = "";
                let valColor = "#fff";

                if (type === 'level') { valStr = `Lv. ${u.level}`; valColor = '#00d2ff'; }
                if (type === 'gold') { valStr = `💰 ${u.gold.toLocaleString()}`; valColor = '#ffcc00'; }
                if (type === 'tower') { valStr = `🗼 Lantai ${u.tower}`; valColor = '#e040fb'; }

                let rankColor = '#aaa';
                let rankIcon = `#${i + 1}`;
                if (i === 0) { rankColor = '#ffcc00'; rankIcon = '🥇 1'; }
                else if (i === 1) { rankColor = '#c0c0c0'; rankIcon = '🥈 2'; }
                else if (i === 2) { rankColor = '#cd7f32'; rankIcon = '🥉 3'; }

                const safeName = window.escapeHTML ? window.escapeHTML(u.name) : u.name;

                html += `<tr style="border-bottom:1px solid #333; background: ${i % 2 === 0 ? '#1a1a24' : '#121216'}; transition:0.2s;">
                    <td style="padding:8px 5px; color:${rankColor}; font-weight:bold; font-size:14px;">${rankIcon}</td>
                    <td style="padding:8px 5px; color:#fff; font-weight:bold; text-align:left;">${safeName}</td>
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
}