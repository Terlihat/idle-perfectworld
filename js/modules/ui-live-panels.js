// ==========================================
// SISTEM UI: PANEL LIVE UPDATE (BOSS, MARKET, FRIENDS)
// ==========================================
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// 1. RENDER BURSA KOIN (COIN MARKET)
export function renderCoinMarketUI(items, currentUserUid) {
    const container = document.getElementById('cm-market-list');
    if (!container) return;

    if (items.length === 0) {
        container.innerHTML = `<div style="text-align:center; color:#aaa; font-size:12px; margin-top:20px;">Pasar koin sedang kosong...</div>`;
        return;
    }

    container.innerHTML = items.map(item => {
        let actionButton = "";
        if (item.sellerUid === currentUserUid) {
            actionButton = `<button onclick="window.cmCancelSell('${item.id}')" style="background:#dc3545; color:#fff; border:none; border-radius:3px; padding:5px 10px; font-weight:bold; cursor:pointer;">BATAL</button>`;
        } else {
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
}

// 2. RENDER WORLD BOSS
export function renderWorldBossUI(bossData, currentUserUid) {
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

    let myRecord = bossData.participants && bossData.participants[currentUserUid] ? bossData.participants[currentUserUid] : null;
    let attackCount = myRecord ? (myRecord.attackCount || 0) : 0;
    let lastTime = myRecord ? (myRecord.lastAttackTime || 0) : 0;

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

                const updateTimer = () => {
                    let waktuSekarang = Date.now();
                    let sisaWaktu = ONE_HOUR - (waktuSekarang - lastTime);

                    if (sisaWaktu <= 0) {
                        clearInterval(window.wbCooldownTimer);
                        if (btnAttack) {
                            btnAttack.disabled = false;
                            btnAttack.innerText = `⚔️ SERANG BOSS! (${5 - attackCount}/5)`;
                            btnAttack.style.background = "#8b0000";
                            btnAttack.style.borderColor = "#ff4c4c";
                        }
                    } else {
                        let m = Math.floor(sisaWaktu / 60000);
                        let s = Math.floor((sisaWaktu % 60000) / 1000);
                        let mStr = m.toString().padStart(2, '0');
                        let sStr = s.toString().padStart(2, '0');
                        if (btnAttack) btnAttack.innerText = `⏳ Cooldown (${mStr}:${sStr})`;
                    }
                };
                updateTimer();
                window.wbCooldownTimer = setInterval(updateTimer, 1000);
            } else {
                btnAttack.disabled = false;
                btnAttack.innerText = `⚔️ SERANG BOSS! (${5 - attackCount}/5)`;
                btnAttack.style.background = "#8b0000";
                btnAttack.style.borderColor = "#ff4c4c";
            }
        }
    }

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

    const myDmgEl = document.getElementById('wb-my-damage');
    if (myDmgEl) {
        const myDmg = bossData.participants && bossData.participants[currentUserUid] ? bossData.participants[currentUserUid].damage : 0;
        myDmgEl.innerText = `Total Damage Anda: ${myDmg.toLocaleString()}`;
    }
}

// 3. RENDER DAFTAR TEMAN & PERMINTAAN LIVE
export async function renderLiveFriendsUI(db, userData, currentUserUid) {
    const friends = userData.friends || {};
    const reqs = userData.friendRequests || {};
    const friendUids = Object.keys(friends);

    if (friendUids.length === 0) {
        document.getElementById('tab-friend-list').innerHTML = `<div style="text-align: center; color: #aaa; margin-top: 20px;">Belum ada teman.</div>`;
    } else {
        let fHtml = "";
        for (let uid of friendUids) {
            const fSnap = await getDoc(doc(db, "users", uid));
            let isOnline = false;
            let loc = "Tidak diketahui";

            if (fSnap.exists()) {
                const fdata = fSnap.data();
                const lastActive = fdata.lastActive || 0;
                const timeDiff = Date.now() - lastActive;

                if (timeDiff < 120000 && lastActive !== 0) {
                    isOnline = true;
                    loc = fdata.currentLocation || "Kota Aman (Idle)";
                } else {
                    isOnline = false;
                    loc = "Offline";
                }
            }

            const statusDot = isOnline ? `<span style="color:#28a745; text-shadow: 0 0 5px #28a745;">●</span>` : `<span style="color:#666;">●</span>`;
            const locText = isOnline ? `<span style="font-size:10px; color:#ffca28;">📍 [${loc}]</span>` : `<span style="font-size:10px; color:#666;">[Offline]</span>`;

            const unreadMsgs = userData.unreadMessages || {};
            const hasUnread = unreadMsgs[uid] === true;
            const badgeHtml = hasUnread ? `<span style="background:#dc3545; color:white; border-radius:50%; padding:2px 6px; font-size:9px; position:absolute; top:-5px; right:-5px; font-weight:bold; box-shadow:0 0 5px red; animation:pm-blink 1s infinite;">!</span>` : '';

            fHtml += `<div style="display:flex; justify-content:space-between; align-items:center; background:#161b22; padding:8px; margin-bottom:5px; border-radius:4px; border-left: 3px solid ${isOnline ? '#28a745' : '#444'};">
                        <div style="display:flex; flex-direction:column;">
                            <span>${statusDot} <b style="color:#58a6ff;">${friends[uid].username}</b> <span style="color:#aaa; font-size:12px;">(Lv.${friends[uid].level})</span></span>
                            ${locText}
                        </div>
                        <div style="display:flex; gap: 5px;">
                            <button onclick="window.openPrivateChat('${uid}', '${friends[uid].username}')" style="background:#0366d6; color:white; border:none; padding:4px 8px; border-radius:3px; cursor:pointer; position:relative;">
                                💬 Pesan ${badgeHtml}
                            </button>
                            <button onclick="window.delFriend('${uid}')" style="background:#dc3545; color:white; border:none; padding:4px 8px; border-radius:3px; cursor:pointer;">Hapus</button>
                        </div>
                      </div>`;
        }
        document.getElementById('tab-friend-list').innerHTML = fHtml;
    }

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

    const badge = document.getElementById('badge-friend-req');
    if (badge) {
        badge.innerText = reqCount;
        badge.style.display = reqCount > 0 ? 'inline-block' : 'none';
    }
}