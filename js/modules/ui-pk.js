import { renderPKUI } from './ui-renderer.js';
// ==========================================
// SISTEM UI: DARK FOREST (ZONA PK)
// ==========================================
export function setupPKUI(db, getUidCallback, getStatsCallback, pkAPI) {
    const { listenToPKZone, enterPKZone, leavePKZone, executePKBattle } = pkAPI;

    listenToPKZone(db, (snap) => {
        let pkPlayers = [];
        snap.forEach(docSnap => {
            if (docSnap.data().currentHp > 0) {
                pkPlayers.push({ id: docSnap.id, ...docSnap.data() });
            }
        });

        const uid = getUidCallback();
        if (typeof renderPKUI === 'function') renderPKUI(pkPlayers, uid);

        const myPkData = pkPlayers.find(p => p.id === uid);
        const btnEnter = document.getElementById('btn-enter-pk');
        const btnLeave = document.getElementById('btn-leave-pk');
        if (myPkData) {
            if (btnEnter) btnEnter.style.display = 'none';
            if (btnLeave) btnLeave.style.display = 'inline-block';
        } else {
            if (btnEnter) btnEnter.style.display = 'inline-block';
            if (btnLeave) btnLeave.style.display = 'none';
        }
    });

    document.addEventListener('click', async (e) => {
        const targetId = e.target.id;
        if (!targetId) return;

        const uid = getUidCallback();
        const stats = getStatsCallback();

        if (targetId === 'btn-toggle-pk' && typeof window.togglePanel === 'function') {
            window.togglePanel('panel-pk');
        }

        if (targetId === 'btn-enter-pk') {
            if (!stats) return;
            if (stats.currentHp <= 0) return window.rpgAlert("Anda sudah mati! Sembuhkan diri di kota.");
            if ((stats.level || 1) < 30) return window.rpgAlert("Hutan ini terlalu berdarah untuk pemula!\nAnda harus mencapai Level 30 untuk memasukinya.", "Akses Ditolak");
            
            if (await window.rpgConfirm("Nyawa dan harta menjadi taruhan di sini. Masuk Dark Forest?", "Gerbang Hutan")) {
                enterPKZone(db, uid).catch(err => console.error(err));
            }
        }
        if (targetId === 'btn-leave-pk') {
            leavePKZone(db, uid).then(() => {
                window.rpgAlert("Anda berhasil lari ke Safe Zone.", "Aman");
            }).catch(err => console.error(err));
        }
    });

    window.addPKLog = function (msg, color) {
        const logPanel = document.getElementById('pk-log-panel');
        if (logPanel) {
            const time = new Date().toLocaleTimeString('id-ID', { hour12: false });
            logPanel.innerHTML += `<div style="color: ${color}; margin-bottom: 6px; border-bottom: 1px dashed #222; padding-bottom: 4px;">[${time}] ${msg.replace(/\n/g, '<br>')}</div>`;
            logPanel.scrollTop = logPanel.scrollHeight;
        }
    };

    window.attackPK = async function (targetUid, targetName) {
        const uid = getUidCallback();
        const stats = getStatsCallback();

        if (stats.currentHp <= 0) return window.rpgAlert("Hantu tidak bisa menyerang!");
        if (!await window.rpgConfirm(`Bantai ${targetName} sekarang?`, "Target Dikunci")) return;

        try {
            const result = await executePKBattle(db, uid, targetUid, targetName);
            window.rpgAlert(result.log, result.success ? "🏆 PK BERHASIL" : "💀 TRAGEDI");
            window.addPKLog(result.log, result.success ? "#28a745" : "#dc3545");
        } catch (err) {
            window.rpgAlert(err, "Pertarungan Batal");
            window.addPKLog(`Batal menyerang: ${err}`, "#aaa");
        }
    };
}