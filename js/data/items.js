import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export const ITEM_DB = {
    "Pedang Besi": { type: "weapon", patk: 30, sellValue: 1000 },
    "Tongkat Sihir": { type: "weapon", matk: 30, sellValue: 1000 },
    "Zirah Kulit": { type: "armor", def: 20, sellValue: 1000 },
    "Cincin Akurat": { type: "accessory", accBonus: 10, sellValue: 1500 },
    "Pedang Darah (Rare)": { type: "weapon", patk: 65, sellValue: 4000 },
    "Tongkat Abyss (Rare)": { type: "weapon", matk: 65, sellValue: 4000 },
    "Zirah Naga (Rare)": { type: "armor", def: 45, sellValue: 4000 },
    "Mata Iblis (Rare)": { type: "accessory", accBonus: 25, sellValue: 5000 },
    "Ramuan HP": { type: "consumable", sellValue: 250 },
    "Ramuan MP": { type: "consumable", sellValue: 250 },
    "Batu Dungeon": { type: "loot", sellValue: 300 },
	"Item Renkarnasi": { type: "loot", sellValue: 300 },
	"Item Renkarnasi 2": { type: "loot", sellValue: 300 },
	"Item Renkarnasi 3": { type: "loot", sellValue: 300 },
	"Item Renkarnasi 4": { type: "loot", sellValue: 300 },
    
    // MOUNT / TUNGGANGAN BARU
    "Kuda Coklat": { type: "mount", stamDiscount: 2, goldBonus: 0.10, sellValue: 2500 },
    "Beruang Kutub": { type: "mount", stamDiscount: 4, goldBonus: 0.25, sellValue: 12500 },
    "Naga Terbang": { type: "mount", stamDiscount: 8, goldBonus: 0.50, sellValue: 0 },
    
    // ITEM MALL & SPECIAL
    "Mirage Stone": { type: "catalyst", sellValue: 0 },
    "Heaven Stone": { type: "catalyst", sellValue: 0 },
    "Underworld Stone": { type: "catalyst", sellValue: 0 },
    "Universal Stone": { type: "catalyst", sellValue: 0 },
    "Tiket Ubah Job": { type: "special", sellValue: 0 },
    "Tiket Ganti Nama": { type: "special", sellValue: 0 },
    "Ramuan Stamina": { type: "special", sellValue: 0 },

    // === DRAGON ORBS (CATALYST) ===
    "Dragon Orb (1 Star)": { type: "catalyst", desc: "100% sukses tempa ke +1" },
    "Dragon Orb (2 Star)": { type: "catalyst", desc: "100% sukses tempa ke +2" },
    "Dragon Orb (3 Star)": { type: "catalyst", desc: "100% sukses tempa ke +3" },
    "Dragon Orb (4 Star)": { type: "catalyst", desc: "100% sukses tempa ke +4" },
    "Dragon Orb (5 Star)": { type: "catalyst", desc: "100% sukses tempa ke +5" },
    "Dragon Orb (6 Star)": { type: "catalyst", desc: "100% sukses tempa ke +6" },
    "Dragon Orb (7 Star)": { type: "catalyst", desc: "100% sukses tempa ke +7" },
    "Dragon Orb (8 Star)": { type: "catalyst", desc: "100% sukses tempa ke +8" },
    "Dragon Orb (9 Star)": { type: "catalyst", desc: "100% sukses tempa ke +9" },
    "Dragon Orb Ocean": { type: "catalyst", desc: "100% sukses tempa ke +10" },
    "Dragon Orb Mirage": { type: "catalyst", desc: "100% sukses tempa ke +11" },
    "Dragon Orb Flame": { type: "catalyst", desc: "100% sukses tempa ke +12" },

    // ==========================================
    // DATABASE STATUS EQUIP LEGENDARY (CRAFTING)
    // ==========================================
    
    // --- TIER 1: LEVEL 19 ---
    "Zirah Naga Terbang": { type: "armor", def: 150, patk: 0, matk: 0, sellValue: 15000 },
    "Tongkat Sihir Naga": { type: "weapon", patk: 30, matk: 250, def: 0, sellValue: 15000 },

    // --- TIER 2: LEVEL 29 ---
    "Pedang Darah Legendary": { type: "weapon", patk: 400, matk: 50, def: 0, sellValue: 25000 },
    "Cincin Darah Suci": { type: "accessory", accBonus: 5, patk: 80, matk: 80, sellValue: 25000 },

    // --- TIER 3: LEVEL 39 ---
    "Kapak Mata Iblis": { type: "weapon", patk: 850, matk: 100, def: 0, sellValue: 50000 },
    "Jubah Pengintai Iblis": { type: "armor", def: 400, hpBonus: 1000, sellValue: 50000 },

    // --- TIER 4: LEVEL 51 ---
    "Tombak Penusuk Wyvern": { type: "weapon", patk: 1500, matk: 200, def: 0, sellValue: 100000 },
    "Tongkat Sayap Wyvern": { type: "weapon", patk: 200, matk: 1500, def: 0, sellValue: 100000 },

    // --- TIER 5: LEVEL 59 ---
    "Zirah Kera Emas": { type: "armor", def: 1000, hpBonus: 3000, sellValue: 250000 },
    "Kalung Kera Sakti": { type: "accessory", accBonus: 10, patk: 400, matk: 400, sellValue: 250000 },

    // --- TIER 6: LEVEL 69 ---
    "Pedang Racun Viperion": { type: "weapon", patk: 3200, matk: 500, def: 0, sellValue: 500000 },
    "Buku Sihir Viperion": { type: "weapon", patk: 500, matk: 3200, def: 0, sellValue: 500000 },

    // --- TIER 7: LEVEL 79 ---
    "Zirah Hitam Bajak Laut": { type: "armor", def: 2500, hpBonus: 8000, sellValue: 1000000 },
    "Cincin Hitam Abyss": { type: "accessory", accBonus: 15, patk: 1000, matk: 1000, sellValue: 1000000 },

    // --- TIER 8: LEVEL 89 ---
    "Palu Penghancur Behemoth": { type: "weapon", patk: 7000, matk: 1000, def: 0, sellValue: 2500000 },
    "Tongkat Kiamat Behemoth": { type: "weapon", patk: 1000, matk: 7000, def: 0, sellValue: 2500000 },

    // --- TIER 9: LEVEL 99 ---
    "Mahkota Kaisar Surga": { type: "accessory", accBonus: 25, patk: 2000, matk: 2000, sellValue: 5000000 },
    "Pedang Kaisar Langit": { type: "weapon", patk: 15000, matk: 2500, def: 0, sellValue: 5000000 },

    // --- TIER 10: LEVEL 100 (END-GAME GOD GEAR) ---
    "Senjata Dewa: Ragnarok": { type: "weapon", patk: 35000, matk: 5000, def: 0, sellValue: 15000000 },
    "Senjata Dewa: Nirvana": { type: "weapon", patk: 5000, matk: 35000, def: 0, sellValue: 15000000 },
    "Zirah Dewa: Aegis": { type: "armor", def: 15000, hpBonus: 50000, sellValue: 15000000 }
};

export const REFINE_RATES = {
    "Mirage Stone":     [0.500, 0.300, 0.300, 0.300, 0.300, 0.300, 0.300, 0.300, 0.150, 0.050],
    "Heaven Stone":     [0.650, 0.450, 0.450, 0.450, 0.450, 0.450, 0.450, 0.450, 0.200, 0.100],
    "Underworld Stone": [0.533, 0.335, 0.335, 0.335, 0.335, 0.335, 0.335, 0.335, 0.150, 0.050],
    "Universal Stone":  [1.000, 0.250, 0.100, 0.040, 0.020, 0.008, 0.005, 0.003, 0.001, 0.000]
};

export async function syncItemsFromFirebase(db) {
    try {
        const itemsRef = collection(db, "items"); 
        const snapshot = await getDocs(itemsRef);
        
        window.CLOUD_ITEM_DB = {}; 
        
        snapshot.forEach((doc) => {
            window.CLOUD_ITEM_DB[doc.id] = doc.data();
        });
        
        console.log("✅ Berhasil menyinkronkan " + snapshot.size + " item dari Firebase!");
    } catch (err) {
        console.error("❌ Gagal menarik data item dari Firebase:", err);
    }
}