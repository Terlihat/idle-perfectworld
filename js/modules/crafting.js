/* ===================================================
   MODUL CRAFTING & PELEBURAN (DISMANTLE ENGINE)
   =================================================== */
import { doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// 1. KAMUS PELEBURAN (Sesuai item kroco di monsters.js Anda)
export const DISMANTLE_CONFIG = {
    "Pedang Besi": { resultItem: "Serpihan Baja", min: 1, max: 3 },
    "Ramuan HP": { resultItem: "Botol Kosong", min: 1, max: 1 },
    "Zirah Kulit": { resultItem: "Potongan Kulit", min: 1, max: 2 },
    "Tongkat Sihir": { resultItem: "Kayu Ajaib", min: 1, max: 2 },
    "Cincin Akurat": { resultItem: "Serbuk Kristal", min: 1, max: 1 }
};

// 2. FUNGSI PELEBURAN ITEM
export async function dismantleItemAction(db, uid, itemName) {
    const recipe = DISMANTLE_CONFIG[itemName];
    if (!recipe) return alert(`❌ Item [${itemName}] tidak memiliki resep peleburan.`);

    const userRef = doc(db, "users", uid);

    try {
        await runTransaction(db, async (ts) => {
            const snap = await ts.get(userRef);
            if (!snap.exists()) throw "User tidak ditemukan!";
            const data = snap.data();
            let inv = data.inventory || {};

            if (!inv[itemName] || inv[itemName] < 1) throw `Anda tidak memiliki [${itemName}] untuk dilebur.`;

            // Kurangi item sampah (-1)
            inv[itemName] -= 1;
            if (inv[itemName] <= 0) delete inv[itemName];

            // Hitung material yang didapat
            const getQty = Math.floor(Math.random() * (recipe.max - recipe.min + 1)) + recipe.min;

            // Tambahkan material ke tas
            inv[recipe.resultItem] = (inv[recipe.resultItem] || 0) + getQty;

            // Simpan
            ts.update(userRef, { inventory: inv });
            alert(`🔥 PELEBURAN BERHASIL!\n[${itemName}] hancur dan Anda mendapatkan +${getQty} ${recipe.resultItem}.`);
        });
    } catch (err) { alert(err); }
}

export const CRAFTING_RECIPES = {
    // --- TIER 1: LEVEL 19 (Boss: Roiling Terror) ---
    "Zirah Naga Terbang": { reqLevel: 19, reqGold: 2000, materials: { "Mold Zirah Naga": 1, "Potongan Kulit": 10, "Serpihan Baja": 5 }, resultItem: "Zirah Naga Terbang" },
    "Tongkat Sihir Naga": { reqLevel: 19, reqGold: 2000, materials: { "Mold Zirah Naga": 1, "Kayu Ajaib": 10, "Serbuk Kristal": 5 }, resultItem: "Tongkat Sihir Naga" },

    // --- TIER 2: LEVEL 29 (Boss: Qingzi) ---
    "Pedang Darah Legendary": { reqLevel: 29, reqGold: 5000, materials: { "Mold Pedang Darah": 1, "Serpihan Baja": 20, "Potongan Kulit": 5 }, resultItem: "Pedang Darah Legendary" },
    "Cincin Darah Suci": { reqLevel: 29, reqGold: 5000, materials: { "Mold Pedang Darah": 1, "Serbuk Kristal": 15, "Kayu Ajaib": 5 }, resultItem: "Cincin Darah Suci" },

    // --- TIER 3: LEVEL 39 (Boss: Herculean) ---
    "Kapak Mata Iblis": { reqLevel: 39, reqGold: 10000, materials: { "Inti Mata Iblis": 1, "Serpihan Baja": 35, "Kayu Ajaib": 10 }, resultItem: "Kapak Mata Iblis" },
    "Jubah Pengintai Iblis": { reqLevel: 39, reqGold: 10000, materials: { "Inti Mata Iblis": 1, "Potongan Kulit": 30, "Serbuk Kristal": 10 }, resultItem: "Jubah Pengintai Iblis" },

    // --- TIER 4: LEVEL 51 (Boss: Wyvern) ---
    "Tombak Penusuk Wyvern": { reqLevel: 51, reqGold: 25000, materials: { "Mold Wyvern": 1, "Serpihan Baja": 50, "Kayu Ajaib": 25 }, resultItem: "Tombak Penusuk Wyvern" },
    "Tongkat Sayap Wyvern": { reqLevel: 51, reqGold: 25000, materials: { "Mold Wyvern": 1, "Kayu Ajaib": 50, "Serbuk Kristal": 25 }, resultItem: "Tongkat Sayap Wyvern" },

    // --- TIER 5: LEVEL 59 (Boss: Gluttonix) ---
    "Zirah Kera Emas": { reqLevel: 59, reqGold: 50000, materials: { "Mold Kera Emas": 1, "Potongan Kulit": 60, "Serpihan Baja": 30 }, resultItem: "Zirah Kera Emas" },
    "Kalung Kera Sakti": { reqLevel: 59, reqGold: 50000, materials: { "Mold Kera Emas": 1, "Serbuk Kristal": 50, "Potongan Kulit": 20 }, resultItem: "Kalung Kera Sakti" },

    // --- TIER 6: LEVEL 69 (Boss: Viperion) ---
    "Pedang Racun Viperion": { reqLevel: 69, reqGold: 100000, materials: { "Inti Viperion": 1, "Serpihan Baja": 80, "Serbuk Kristal": 30 }, resultItem: "Pedang Racun Viperion" },
    "Buku Sihir Viperion": { reqLevel: 69, reqGold: 100000, materials: { "Inti Viperion": 1, "Kayu Ajaib": 80, "Serbuk Kristal": 50 }, resultItem: "Buku Sihir Viperion" },

    // --- TIER 7: LEVEL 79 (Boss: Linus The Black) ---
    "Zirah Hitam Bajak Laut": { reqLevel: 79, reqGold: 200000, materials: { "Mold Hitam Linus": 1, "Potongan Kulit": 100, "Serpihan Baja": 50 }, resultItem: "Zirah Hitam Bajak Laut" },
    "Cincin Hitam Abyss": { reqLevel: 79, reqGold: 200000, materials: { "Mold Hitam Linus": 1, "Serbuk Kristal": 100, "Kayu Ajaib": 50 }, resultItem: "Cincin Hitam Abyss" },

    // --- TIER 8: LEVEL 89 (Boss: Brahma / Behemoth) ---
    "Palu Penghancur Behemoth": { reqLevel: 89, reqGold: 500000, materials: { "Inti Behemoth": 1, "Serpihan Baja": 150, "Potongan Kulit": 80 }, resultItem: "Palu Penghancur Behemoth" },
    "Tongkat Kiamat Behemoth": { reqLevel: 89, reqGold: 500000, materials: { "Inti Behemoth": 1, "Kayu Ajaib": 150, "Serbuk Kristal": 80 }, resultItem: "Tongkat Kiamat Behemoth" },

    // --- TIER 9: LEVEL 99 (Boss: Emperor of Heaven/Hell) ---
    "Mahkota Kaisar Surga": { reqLevel: 99, reqGold: 1000000, materials: { "Mold Kaisar": 1, "Potongan Kulit": 200, "Serbuk Kristal": 150 }, resultItem: "Mahkota Kaisar Surga" },
    "Pedang Kaisar Langit": { reqLevel: 99, reqGold: 1000000, materials: { "Mold Kaisar": 1, "Serpihan Baja": 200, "Kayu Ajaib": 100 }, resultItem: "Pedang Kaisar Langit" },

    // --- TIER 10: LEVEL 100 (END-GAME GOD GEAR) ---
    "Senjata Dewa: Ragnarok": { reqLevel: 100, reqGold: 5000000, materials: { "Inti Dewi Suci": 1, "Serpihan Baja": 300, "Kayu Ajaib": 200, "Serbuk Kristal": 100 }, resultItem: "Senjata Dewa: Ragnarok" },
    "Senjata Dewa: Nirvana": { reqLevel: 100, reqGold: 5000000, materials: { "Inti Dewi Suci": 1, "Kayu Ajaib": 300, "Serbuk Kristal": 200, "Potongan Kulit": 100 }, resultItem: "Senjata Dewa: Nirvana" },
    "Zirah Dewa: Aegis": { reqLevel: 100, reqGold: 5000000, materials: { "Inti Dewi Suci": 1, "Potongan Kulit": 300, "Serpihan Baja": 200, "Serbuk Kristal": 150 }, resultItem: "Zirah Dewa: Aegis" }
};

// ==========================================
// FUNGSI EKSEKUSI CRAFTING
// ==========================================
export async function craftItemAction(db, uid, recipeName) {
    const recipe = CRAFTING_RECIPES[recipeName];
    if (!recipe) return alert("❌ Resep tidak ditemukan!");

    const userRef = doc(db, "users", uid);

    try {
        await runTransaction(db, async (ts) => {
            const snap = await ts.get(userRef);
            if (!snap.exists()) throw "User tidak ditemukan!";
            const data = snap.data();

            // 1. Cek Level
            if ((data.level || 1) < recipe.reqLevel) throw `Level Anda belum cukup! Butuh Level ${recipe.reqLevel}.`;

            // 2. Cek Gold
            if ((data.gold || 0) < recipe.reqGold) throw `Gold tidak cukup! Butuh ${recipe.reqGold.toLocaleString()} Gold.`;

            let inv = data.inventory || {};

            // 3. Cek ketersediaan SEMUA material di tas
            for (const [matName, qtyNeeded] of Object.entries(recipe.materials)) {
                const playerHas = inv[matName] || 0;
                if (playerHas < qtyNeeded) {
                    throw `Material kurang! Anda butuh ${qtyNeeded}x [${matName}] (Anda punya: ${playerHas}).`;
                }
            }

            // 4. Jika lulus semua cek, kurangi material dan gold
            let newGold = data.gold - recipe.reqGold;
            for (const [matName, qtyNeeded] of Object.entries(recipe.materials)) {
                inv[matName] -= qtyNeeded;
                if (inv[matName] <= 0) delete inv[matName];
            }

            // 5. Tambahkan Item Legendary ke tas
            inv[recipe.resultItem] = (inv[recipe.resultItem] || 0) + 1;

            // 6. Simpan ke database
            ts.update(userRef, { gold: newGold, inventory: inv });
            alert(`✨ TEMPA BERHASIL! ✨\nAnda mendapatkan [${recipe.resultItem}]!`);
        });
    } catch (err) {
        alert(err);
    }
}

// Membuka akses agar bisa dibaca oleh game.js dan tombol HTML
window.CRAFTING_RECIPES = CRAFTING_RECIPES;
window.craftItemAction = craftItemAction;