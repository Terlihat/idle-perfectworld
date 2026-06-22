import { db } from '../firebase-config.js';
import { doc, runTransaction, onSnapshot, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

let isOnCooldown = false;

// Fungsi untuk menyerang Boss
window.attackWorldBoss = async function() {
    if (isOnCooldown) return window.rpgAlert("⏳ Senjata Anda masih panas! Tunggu sebentar sebelum menyerang lagi.", "Cooldown");
    
    // Pastikan stats player sudah dimuat dari game.js
    const stats = window.currentPlayerStats;
    if (!stats) return;

    // Kalkulasi Damage (Total Attack * Random 80% - 120%)
    let baseAtk = (stats.patk || 10) + (stats.matk || 10);
    let randomMultiplier = (Math.random() * 0.4) + 0.8; 
    let finalDamage = Math.floor(baseAtk * randomMultiplier * 10); // Dikali 10 agar damage terasa besar & epik

    // Set Cooldown (2 Detik)
    isOnCooldown = true;
    const btn = document.getElementById('wb-btn-attack');
    if (btn) {
        btn.innerText = "⏳ COOLDOWN...";
        btn.style.background = "#555";
        btn.style.borderColor = "#333";
    }

    setTimeout(() => {
        isOnCooldown = false;
        if (btn) {
            btn.innerText = "⚔️ SERANG BOSS! ⚔️";
            btn.style.background = "#8b0000";
            btn.style.borderColor = "#ff4c4c";
        }
    }, 2000);

    try {
        const bossRef = doc(db, "events", "worldBoss");
        await runTransaction(db, async (ts) => {
            const bossSnap = await ts.get(bossRef);
            if (!bossSnap.exists()) throw "World Boss belum muncul!";
            
            let data = bossSnap.data();
            if (!data.isActive || data.currentHp <= 0) throw "World Boss sudah dikalahkan!";

            // Hitung HP baru
            let newHp = data.currentHp - finalDamage;
            if (newHp < 0) newHp = 0;

            // Catat Damage Pemain
            let participants = data.participants || {};
            let myRecord = participants[window.currentUserUid] || { name: window.playerUsername, damage: 0 };
            myRecord.damage += finalDamage;
            myRecord.name = window.playerUsername; // Update nama terbaru
            participants[window.currentUserUid] = myRecord;

            ts.update(bossRef, {
                currentHp: newHp,
                participants: participants,
                isActive: newHp > 0
            });
        });

        // Tampilkan floating text damage kecil (opsional)
        console.log(`Anda memberikan ${finalDamage} Damage ke Boss!`);
        
    } catch (err) { window.rpgAlert(err, "Serangan Gagal"); }
};

// Fungsi Listener Real-Time UI Boss
export function listenToWorldBoss(renderCallback) {
    const bossRef = doc(db, "events", "worldBoss");
    return onSnapshot(bossRef, (docSnap) => {
        if (!docSnap.exists()) {
            renderCallback(null);
            return;
        }
        renderCallback(docSnap.data());
    });
}

// Fungsi Admin untuk Memanggil Boss
window.adminSpawnBoss = async function() {
    const hp = parseInt(prompt("Masukkan Max HP Boss:", "5000000"));
    if (!hp) return;
    
    await setDoc(doc(db, "events", "worldBoss"), {
        name: "Naga Neraka Kiamat",
        maxHp: hp,
        currentHp: hp,
        isActive: true,
        participants: {}
    });
    alert("Boss berhasil dipanggil!");
};