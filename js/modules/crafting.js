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

// ==========================================
// KAMUS RESEP CRAFTING (CRAFTING RECIPES)
// ==========================================
export const CRAFTING_RECIPES = {
    "Pedang Darah Legendary": {
        reqLevel: 29,
        reqGold: 5000,
        materials: {
            "Mold Pedang Darah": 1, // Dari Boss FB29
            "Serpihan Baja": 5,     // Dari peleburan senjata
            "Potongan Kulit": 2     // Dari peleburan zirah
        },
        resultItem: "Pedang Darah Legendary"
    },
    "Zirah Naga Terbang": {
        reqLevel: 39,
        reqGold: 10000,
        materials: {
            "Inti Mata Iblis": 1,   // Dari Boss FB39
            "Potongan Kulit": 10,   
            "Serbuk Kristal": 3
        },
        resultItem: "Zirah Naga Terbang"
    }
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