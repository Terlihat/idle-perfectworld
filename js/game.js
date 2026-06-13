// [Cari dan Ganti fungsi selectCharacterClass yang lama dengan yang baru ini]
// ==========================================
// 3. LOGIKA PEMILIHAN KARAKTER & STARTER PACK
// ==========================================
async function selectCharacterClass(className) {
    if (!currentUserUid) return;
    const userRef = doc(db, "users", currentUserUid);
    
    // Penetapan Atribut Dasar sesuai Job (Kelas)
    let baseStats = {};
    if (className === 'Warrior') {
        baseStats = { maxHp: 2000, currentHp: 2000, maxMp: 500, currentMp: 500, baseDmg: 150 };
    } else if (className === 'Mage') {
        baseStats = { maxHp: 1000, currentHp: 1000, maxMp: 1500, currentMp: 1500, baseDmg: 250 };
    }

    try {
        // Buat Data Karakter Utama
        await setDoc(userRef, {
            username: "Ksatria_" + currentUserUid.substring(0, 4),
            characterClass: className,
            gold: 0, // Akan disuplai dari Starter Pack
            level: 1,
            exp: 0,
            lastAttack: 0,
            ...baseStats // Memasukkan atribut HP, MP, Dmg ke dalam database
        });

        // OTOMATIS: Kirim Starter Pack via Kotak Surat
        await addDoc(collection(db, "mailbox", currentUserUid, "messages"), {
            title: "🎁 Paket Pemula Kota Awal",
            body: "Selamat datang, Ksatria! Berikut adalah bekal awal perjalananmu. Gunakan dengan bijak.",
            attachments: { gold: 20000 },
            isClaimed: false,
            timestamp: serverTimestamp()
        });
        
        alert(`Karakter ${className} Berhasil Dibuat! Cek Kotak Surat Anda untuk Starter Pack!`);
        showScreen('screen-game');
        startLiveGameSync();
    } catch (err) {
        alert("Gagal menyimpan karakter: " + err);
    }
}


// [Cari dan Ganti fungsi listenToPlayerData yang lama dengan yang baru ini]
// ==========================================
// 4. LIVE SYNC DATA PEMAIN (DIPERBARUI DENGAN ATRIBUT)
// ==========================================
function listenToPlayerData() {
    const unsub = onSnapshot(doc(db, "users", currentUserUid), (docSnap) => {
        if (!docSnap.exists()) return;
        const data = docSnap.data();
        
        const lvl = data.level || 1;
        const exp = data.exp || 0;
        const maxExp = lvl * 100;
        
        // Render Teks Dasar
        document.getElementById('player-name').innerText = data.username;
        document.getElementById('player-class').innerText = data.characterClass || "Belum Memilih";
        document.getElementById('player-gold').innerText = (data.gold || 0).toLocaleString();
        document.getElementById('player-level').innerText = lvl;
        
        // Render EXP Bar
        document.getElementById('exp-text').innerText = `${exp} / ${maxExp} EXP`;
        document.getElementById('exp-bar').style.width = `${Math.min((exp / maxExp) * 100, 100)}%`;

        // Render Atribut (HP & MP)
        const cHp = data.currentHp || 0; const mHp = data.maxHp || 1;
        const cMp = data.currentMp || 0; const mMp = data.maxMp || 1;
        
        document.getElementById('char-hp-text').innerText = `${cHp} / ${mHp} HP`;
        document.getElementById('char-hp-bar').style.width = `${Math.min((cHp / mHp) * 100, 100)}%`;
        
        document.getElementById('char-mp-text').innerText = `${cMp} / ${mMp} MP`;
        document.getElementById('char-mp-bar').style.width = `${Math.min((cMp / mMp) * 100, 100)}%`;
    });
    activeUnsubscribeListeners.push(unsub);
}


// [Tambahkan Blok Kode Baru Ini di Bawah File game.js Anda]
// ==========================================
// 7. TOKO ALKEMIS & PENGATURAN (FITUR BARU)
// ==========================================
async function buyPotion(type) {
    if (!currentUserUid) return;
    const userRef = doc(db, "users", currentUserUid);
    const cost = 500;

    try {
        await runTransaction(db, async (ts) => {
            const userDoc = await ts.get(userRef);
            const data = userDoc.data();
            
            if ((data.gold || 0) < cost) throw "Gold tidak cukup!";
            
            let updateData = { gold: data.gold - cost };

            // Logika Penyembuhan dengan Batasan Maksimal (Anti-Overheal)
            if (type === 'HP') {
                const healAmt = 500;
                const newHp = Math.min((data.currentHp || 0) + healAmt, data.maxHp || 1000);
                if (data.currentHp === newHp) throw "HP Anda sudah penuh!";
                updateData.currentHp = newHp;
            } else if (type === 'MP') {
                const restoreAmt = 300;
                const newMp = Math.min((data.currentMp || 0) + restoreAmt, data.maxMp || 500);
                if (data.currentMp === newMp) throw "MP Anda sudah penuh!";
                updateData.currentMp = newMp;
            }

            ts.update(userRef, updateData);
        });
        console.log(`Berhasil membeli Potion ${type}`);
    } catch (err) { alert(err); }
}

async function changePlayerName() {
    const input = document.getElementById('input-new-name');
    const newName = input.value.trim();
    if (!newName || !currentUserUid) return alert("Nama tidak boleh kosong!");
    if (newName.length > 15) return alert("Nama maksimal 15 karakter!");

    const userRef = doc(db, "users", currentUserUid);
    const cost = 2000;

    try {
        await runTransaction(db, async (ts) => {
            const userDoc = await ts.get(userRef);
            if ((userDoc.data().gold || 0) < cost) throw "Gold tidak cukup untuk ganti nama!";
            
            ts.update(userRef, { 
                gold: userDoc.data().gold - cost,
                username: newName
            });
        });
        input.value = "";
        alert("Berhasil ganti identitas menjadi: " + newName);
    } catch (err) { alert(err); }
}

// Pasang Event Listeners
document.getElementById('btn-buy-hp').addEventListener('click', () => buyPotion('HP'));
document.getElementById('btn-buy-mp').addEventListener('click', () => buyPotion('MP'));
document.getElementById('btn-change-name').addEventListener('click', changePlayerName);
