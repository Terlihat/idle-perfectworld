import { db } from '../firebase-config.js';
import { collection, doc, query, where, onSnapshot, runTransaction, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { renderPKUI } from './ui-renderer.js';

window.addPKLog = function (msg, color) {
    const logPanel = document.getElementById('pk-log-panel');
    if (logPanel) {
        logPanel.innerHTML += `<div style="color: ${color}; margin-bottom: 6px; border-bottom: 1px dashed #222; padding-bottom: 4px;">[${new Date().toLocaleTimeString('id-ID', { hour12: false })}] ${msg.replace(/\n/g, '<br>')}</div>`;
        logPanel.scrollTop = logPanel.scrollHeight;
    }
};

window.attackPK = async function (targetUid, targetName) {
    if (window.currentPlayerStats.currentHp <= 0) return window.rpgAlert("Hantu tidak bisa menyerang!");
    if (!await window.rpgConfirm(`Bantai ${targetName} sekarang?`, "Target Dikunci")) return;

    try {
        const targetRef = doc(db, "users", targetUid);
        const myRef = doc(db, "users", window.currentUserUid);

        const result = await runTransaction(db, async (ts) => {
            const mySnap = await ts.get(myRef); const targetSnap = await ts.get(targetRef);
            if (!mySnap.exists() || !targetSnap.exists()) throw "Target menghilang tertelan kabut.";
            const me = mySnap.data(); const enemy = targetSnap.data();
            if (!enemy.inPkZone || enemy.currentHp <= 0) throw "Target sudah kabur ke kota atau sudah mati.";
            if (me.currentHp <= 0) throw "Anda mati kehabisan darah sebelum menyerang!";

            const levelDiff = Math.abs((me.level || 1) - (enemy.level || 1));
            if (levelDiff > 10) throw "Selisih level terlalu jauh (Maks 10 Level)! Hutan ini melarang pembantaian yang terlalu tidak seimbang.";

            let myBP = (me.level || 1) * 50 + (me.str || 0) * 10 + (me.dex || 0) * 10 + (me.con || 0) * 10 + (me.int || 0) * 10;
            let enemyBP = (enemy.level || 1) * 50 + (enemy.str || 0) * 10 + (enemy.dex || 0) * 10 + (enemy.con || 0) * 10 + (enemy.int || 0) * 10;
            myBP *= (0.9 + Math.random() * 0.2); enemyBP *= (0.9 + Math.random() * 0.2);

            let logMsg = ""; const safeItems = ["Tiket Ganti Nama", "Buku Reset Stats", "Tiket Ubah Job", "Ramuan Stamina", "Naga Terbang"];

            if (myBP >= enemyBP) {
                let goldStolen = Math.floor((enemy.gold || 0) * 0.05);
                let enemyInv = enemy.inventory || {}; let myInv = me.inventory || {}; let stolenItem = null; let exclusiveDropMsg = "";
                let dropRate = ((enemy.pkKills || 0) >= 3) ? 0.20 : 0.05;

                if (Math.random() <= dropRate) {
                    let possibleItems = Object.keys(enemyInv).filter(i => enemyInv[i] > 0 && !safeItems.includes(i));
                    if (possibleItems.length > 0) { stolenItem = possibleItems[Math.floor(Math.random() * possibleItems.length)]; enemyInv[stolenItem] -= 1; if (enemyInv[stolenItem] <= 0) delete enemyInv[stolenItem]; myInv[stolenItem] = (myInv[stolenItem] || 0) + 1; }
                }
                if (Math.random() <= 0.30) { myInv["Kristal Hutan Gelap"] = (myInv["Kristal Hutan Gelap"] || 0) + 1; exclusiveDropMsg = `\n\n🌲 MYSTIC DROP: Tanah berdarah memberikan Anda [Kristal Hutan Gelap]!`; }

                ts.update(targetRef, { currentHp: 0, gold: Math.max(0, (enemy.gold || 0) - goldStolen), inventory: enemyInv, inPkZone: false });
                ts.update(myRef, { gold: (me.gold || 0) + goldStolen, inventory: myInv, pkKills: (me.pkKills || 0) + 1 });
                ts.set(doc(collection(db, "users", targetUid, "mailbox")), { title: "☠️ Terbunuh di Dark Forest!", message: `Anda telah dibantai oleh [${me.username}] di Zona PK!\n\nKehilangan: ${goldStolen.toLocaleString()} Gold.` + (stolenItem ? `\nBarang dirampas: 1x ${stolenItem}` : ""), date: new Date().toLocaleString('id-ID'), timestamp: Date.now() });

                logMsg = `🔥 KEMENANGAN!\nAnda membantai ${targetName}.\nMencuri 💰 ${goldStolen.toLocaleString()} Gold.` + (stolenItem ? `\n🎁 RAMPASAN: Anda mendapat [${stolenItem}] dari mayatnya!` : "") + exclusiveDropMsg;
                return { success: true, log: logMsg };
            } else {
                let goldLost = Math.floor((me.gold || 0) * 0.05);
                let myInv = me.inventory || {}; let enemyInv = enemy.inventory || {}; let lostItem = null; let exclusiveDropMsg = "";
                let dropRate = ((me.pkKills || 0) >= 3) ? 0.20 : 0.05;

                if (Math.random() <= dropRate) {
                    let possibleItems = Object.keys(myInv).filter(i => myInv[i] > 0 && !safeItems.includes(i));
                    if (possibleItems.length > 0) { lostItem = possibleItems[Math.floor(Math.random() * possibleItems.length)]; myInv[lostItem] -= 1; if (myInv[lostItem] <= 0) delete myInv[lostItem]; enemyInv[lostItem] = (enemyInv[lostItem] || 0) + 1; }
                }
                if (Math.random() <= 0.30) { enemyInv["Kristal Hutan Gelap"] = (enemyInv["Kristal Hutan Gelap"] || 0) + 1; exclusiveDropMsg = `\n🌲 MYSTIC DROP: Pertahanan berdarah ini memberikan Anda [Kristal Hutan Gelap]!`; }

                ts.update(myRef, { currentHp: 0, gold: Math.max(0, (me.gold || 0) - goldLost), inventory: myInv, inPkZone: false });
                ts.update(targetRef, { gold: (enemy.gold || 0) + goldLost, inventory: enemyInv, pkKills: (enemy.pkKills || 0) + 1 });
                ts.set(doc(collection(db, "users", targetUid, "mail")), { title: "🛡️ Pertahanan PK Berhasil!", message: `[${me.username}] mencoba menyerang Anda di Dark Forest, namun tewas oleh pertahanan Anda!\n\nAnda menjarah: ${goldLost.toLocaleString()} Gold.` + (lostItem ? `\nBarang dijarah: 1x ${lostItem}` : "") + exclusiveDropMsg, date: new Date().toLocaleString('id-ID'), timestamp: Date.now() });

                logMsg = `💀 KEKALAHAN!\nAnda dibunuh oleh ${targetName}.\nKehilangan 💰 ${goldLost.toLocaleString()} Gold.` + (lostItem ? `\n\n🚨 RAMPASAN: [${lostItem}] Anda terlempar dan diambil musuh!` : "");
                return { success: false, log: logMsg };
            }
        });

        window.rpgAlert(result.log, result.success ? "🏆 PK BERHASIL" : "💀 TRAGEDI");
        window.addPKLog(result.log, result.success ? "#28a745" : "#dc3545");
    } catch (err) { window.rpgAlert(err, "Pertarungan Batal"); window.addPKLog(`Batal menyerang: ${err}`, "#aaa"); }
};

// AUTO START LIVE RADAR
const qPk = query(collection(db, "users"), where("inPkZone", "==", true));
onSnapshot(qPk, (snap) => {
    let pkPlayers = [];
    snap.forEach(docSnap => { if (docSnap.data().currentHp > 0) pkPlayers.push({ id: docSnap.id, ...docSnap.data() }); });
    if (typeof renderPKUI === 'function') renderPKUI(pkPlayers, window.currentUserUid);

    const myPkData = pkPlayers.find(p => p.id === window.currentUserUid);
    const btnEnter = document.getElementById('btn-enter-pk'); const btnLeave = document.getElementById('btn-leave-pk');
    if (myPkData) { if (btnEnter) btnEnter.style.display = 'none'; if (btnLeave) btnLeave.style.display = 'inline-block'; } 
    else { if (btnEnter) btnEnter.style.display = 'inline-block'; if (btnLeave) btnLeave.style.display = 'none'; }
});