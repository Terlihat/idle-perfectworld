// ==========================================
// SISTEM ROUTER & EVENT LISTENER GLOBAL
// ==========================================
import { db } from '../firebase-config.js';
import { MONSTER_DB } from '../data/monsters.js';

// Import fungsi-fungsi sistem yang dibutuhkan oleh tombol
import { selectCharacterClass } from './character.js';
import { sendChat } from './chat.js';
import { createGuild, leaveGuild as dbLeaveGuild, donateGold, upgradeGuild, updateMotd, disbandGuild } from './guild.js';
import { depositGold, withdrawGold } from './bank.js';
import { attackMonster } from './battle.js';
import { createOrJoinParty } from './party.js';

// Fungsi bantuan UI
export function clearActiveModeClasses() {
    ['btn-mode-equip', 'btn-mode-sell', 'btn-mode-bank', 'btn-mode-auction', 'btn-mode-dismantle', 'btn-mode-blacksmith', 'btn-mode-crafting'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.className = ""; if (id !== 'btn-mode-equip') el.style.backgroundColor = "#495057"; }
    });
}
window.clearActiveModeClasses = clearActiveModeClasses;

export function setupActionRouters() {
    // --- SISTEM PEMBACA INFO DROP BOS FB ---
    document.addEventListener('change', (e) => {
        if (e.target.id === 'fb-select') {
            const bossKey = e.target.value;
            const boss = MONSTER_DB[bossKey];
            const infoBox = document.getElementById('fb-drop-info');
            const textBox = document.getElementById('fb-drop-text');

            if (boss && infoBox && textBox) {
                let dropsInfo = [];
                if (boss.drop) dropsInfo.push(`[${boss.drop.item}] (${(boss.drop.chance * 100).toFixed(0)}%)`);
                if (boss.drops && Array.isArray(boss.drops)) {
                    boss.drops.forEach(d => dropsInfo.push(`[${d.item}] (${(d.chance * 100).toFixed(0)}%)`));
                }
                textBox.innerText = dropsInfo.length > 0 ? dropsInfo.join(' | ') : "Hanya EXP & Gold";
                infoBox.style.display = 'block';
            }
        }
    });

    // --- NAVIGASI TAB BURSA KOIN ---
    document.addEventListener('click', (e) => {
        if (e.target.id === 'btn-tab-cmb') {
            document.getElementById('tab-cm-buy').style.display = 'block';
            document.getElementById('tab-cm-sell').style.display = 'none';
            document.getElementById('tab-cm-wallet').style.display = 'none';
        } else if (e.target.id === 'btn-tab-cms') {
            document.getElementById('tab-cm-buy').style.display = 'none';
            document.getElementById('tab-cm-sell').style.display = 'block';
            document.getElementById('tab-cm-wallet').style.display = 'none';
        } else if (e.target.id === 'btn-tab-cmw') {
            document.getElementById('tab-cm-buy').style.display = 'none';
            document.getElementById('tab-cm-sell').style.display = 'none';
            document.getElementById('tab-cm-wallet').style.display = 'block';
        }
    });

    // --- PEMICU OTOMATIS CRAFTING ---
    document.addEventListener('click', function (e) {
        if (e.target.id === 'btn-mode-crafting' || e.target.id === 'btn-mode-blacksmith' || (e.target.innerText && e.target.innerText.includes('CRAFT'))) {
            setTimeout(() => {
                if (typeof window.renderCraftingUI === 'function') {
                    const inv = window.currentInventoryData || {};
                    const lvl = (window.currentPlayerStats) ? (window.currentPlayerStats.level || 1) : 1;
                    const gold = (window.currentPlayerStats) ? (window.currentPlayerStats.gold || 0) : 0;
                    window.renderCraftingUI(inv, lvl, gold);
                }
            }, 100);
        }
    });

    // --- SISTEM CHAT CHANNEL SELECT ---
    document.addEventListener('change', (e) => {
        if (e.target && e.target.id === 'chat-channel-select') {
            const val = e.target.value;
            if (val === 'guild' && (!window.currentPlayerStats || !window.currentPlayerStats.guildId)) {
                window.rpgAlert("Anda belum bergabung dengan Guild!");
                e.target.value = window.currentChatChannel; return;
            }
            if (val === 'party' && !window.currentPartyId) {
                window.rpgAlert("Anda belum masuk ke dalam Ruang Tunggu Party FB!");
                e.target.value = window.currentChatChannel; return;
            }
            window.currentChatChannel = val;
            if (window.startDynamicChat) window.startDynamicChat();
        }
    });

    // --- SISTEM CHAT ENTER KEY ---
    document.addEventListener('keydown', (e) => {
        if (e.target && e.target.id === 'chat-input' && e.key === 'Enter') {
            e.preventDefault();
            const btn = document.getElementById('btn-send-chat');
            if (btn) btn.click();
        }
    });

    // --- KLIK GLOBAL (ROUTER UTAMA) ---
    document.addEventListener('click', async (e) => {
        const target = e.target.closest('button') || e.target.closest('.char-card') || e.target;
        const targetId = target.id;

        if (!targetId) return;

        // Ambil data pemain secara real-time dari memori window
        const uid = window.currentUserUid;
        const stats = window.currentPlayerStats || {};

        if (targetId === 'btn-admin-panel') window.location.href = './admin/index.html';
        if (targetId === 'btn-copy-uid') { if (uid) { navigator.clipboard.writeText(uid); window.rpgAlert("📋 UID disalin!"); } }

        // --- NAVIGASI TOGGLE PANEL ---
        if (targetId === 'btn-toggle-mall') window.togglePanel('panel-mall');
        if (targetId === 'btn-toggle-shop') window.togglePanel('panel-shop');
        if (targetId === 'btn-toggle-coin-market') window.togglePanel('panel-coin-market');
        if (targetId === 'btn-toggle-mail') window.togglePanel('panel-mailbox');
        if (targetId === 'btn-toggle-friends') window.togglePanel('panel-friends');
        if (targetId === 'btn-toggle-boss') window.togglePanel('panel-world-boss');
        if (targetId === 'btn-toggle-tower') window.togglePanel('panel-tower');
        if (targetId === 'btn-toggle-afk') window.togglePanel('panel-afk');
        if (targetId === 'btn-toggle-leaderboard') {
            window.togglePanel('panel-leaderboard');
            const lbContent = document.getElementById('leaderboard-content');
            if (lbContent && lbContent.innerText.includes('Klik kategori')) window.fetchLeaderboard('level');
        }
        if (targetId === 'btn-toggle-tickets') {
            window.togglePanel('panel-tickets');
            if (typeof window.listenToMyTickets === 'function') window.listenToMyTickets();
        }

        // --- TOMBOL KATEGORI LEADERBOARD ---
        if (targetId === 'btn-lb-level') window.fetchLeaderboard('level');
        if (targetId === 'btn-lb-gold') window.fetchLeaderboard('gold');
        if (targetId === 'btn-lb-tower') window.fetchLeaderboard('tower');

        if (targetId === 'class-warrior') selectCharacterClass(db, uid, 'Warrior', () => window.showScreen('screen-game'));
        if (targetId === 'class-mage') selectCharacterClass(db, uid, 'Mage', () => window.showScreen('screen-game'));

        if (targetId === 'btn-send-chat') {
            const chatInput = document.getElementById('chat-input');
            if (chatInput && chatInput.value.trim()) {
                let tId = null;
                if (window.currentChatChannel === 'guild') tId = stats.guildId;
                if (window.currentChatChannel === 'party') tId = window.currentPartyId;
                sendChat(db, uid, window.playerUsername, chatInput.value, window.currentChatChannel, tId);
                chatInput.value = "";
            }
        }

        // --- FITUR GUILD DENGAN RPG MODAL ---
        if (targetId === 'btn-create-guild') {
            const name = document.getElementById('input-guild-name').value;
            if (!name) return window.rpgAlert("Nama guild tidak boleh kosong!");
            if (await window.rpgConfirm(`Dirikan Guild [${name}] seharga 100,000 Gold?`, "Buat Guild")) createGuild(db, uid, stats, name);
        }
        if (targetId === 'btn-leave-guild') { if (await window.rpgConfirm("Yakin ingin keluar dari Guild? Anda akan kehilangan semua Buff Guild!", "Keluar Guild")) dbLeaveGuild(db, uid, stats.guildId); }
        if (targetId === 'btn-donate-guild') { const el = document.getElementById('input-donate-gold'); const amt = parseInt(el ? el.value : 0); if (amt > 0) { donateGold(db, uid, stats.guildId, amt); el.value = ""; } }
        if (targetId === 'btn-upgrade-guild') { if (await window.rpgConfirm("Gunakan Dana Guild untuk naik level?", "Upgrade Guild")) upgradeGuild(db, uid, stats.guildId); }
        if (targetId === 'btn-edit-motd') {
            const txt = await window.rpgPrompt("Masukkan pengumuman baru untuk anggota Guild:", "Ubah Papan Info");
            if (txt) updateMotd(db, uid, stats.guildId, txt);
        }
        if (targetId === 'btn-disband-guild') { if (await window.rpgConfirm("PERINGATAN KERAS: Yakin membubarkan Guild selamanya? Dana Guild akan hangus!", "Bubarkan Guild")) disbandGuild(db, uid, stats.guildId); }

        // --- BANK & DUNGEON ---
        if (targetId === 'btn-bank-deposit-gold') { const el = document.getElementById('bank-gold-input'); const val = parseInt(el.value); if (val > 0) { depositGold(db, uid, val); el.value = ""; } }
        if (targetId === 'btn-bank-withdraw-gold') { const el = document.getElementById('bank-gold-input'); const val = parseInt(el.value); if (val > 0) { withdrawGold(db, uid, val); el.value = ""; } }

        if (targetId === 'btn-attack-dungeon') attackMonster(db, uid, document.getElementById('dungeon-select').value, stats);
        if (targetId === 'btn-create-party') createOrJoinParty(db, document.getElementById('fb-select').value, stats);

        // --- QUESTS ---
        if (targetId === 'btn-take-quest') window.assignRandomQuests(db, uid);
        if (targetId === 'btn-claim-daily') window.claimQuestReward(db, uid, 'daily');
        if (targetId === 'btn-claim-bounty') window.claimQuestReward(db, uid, 'bounty');
    });
}