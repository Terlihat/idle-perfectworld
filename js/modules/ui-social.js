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
        const memberList = document.getElementById('guild-member-list');
        memberList.innerHTML = "";

        function toRoman(num) {
            const roman = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
            return roman[num] || num;
        }

        myGuild.members.forEach(m => {
            const isMe = m.uid === stats.uid;
            const kickBtn = (isLeader && !isMe) ? `<button onclick="window.kickMemberAction('${m.uid}')" style="padding:1px 4px; font-size:8px; background:#dc3545; margin-left:5px;">Kick</button>` : '';

            // 🔥 3. Logika untuk RW Badge
            const rebirthCount = m.rebirth || 0;
            const rwBadge = rebirthCount > 0
                ? `<span style="color: #ff5722; font-weight: bold; font-size: 11px; margin-left: 5px;">[RW ${toRoman(rebirthCount)}]</span>`
                : "";

            // 🔥 4. Menyisipkan rwBadge di sebelah nama pemain
            memberList.innerHTML += `
            <div style="border-bottom:1px solid #333; padding:3px 0; display:flex; justify-content:space-between; align-items:center;">
                <div><span style="color:${isMe ? '#ffca28' : '#fff'};">${escapeHTML(m.name)}</span>${rwBadge} (Lv.${m.level}) ${kickBtn}</div>
                <div style="color:#aaa;">Donasi: ${m.contribution.toLocaleString()} G</div>
            </div>`;
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
        chatBox.innerHTML += `<div><strong style="color:${chColor}; font-size:9px;">[${chLabel}]</strong> ${vipBadge} <span class="chat-name">${escapeHTML(m.username)}</span>: ${escapeHTML(m.text)}</div>`;
    });
}