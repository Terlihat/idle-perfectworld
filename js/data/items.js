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
    
    // MOUNT / TUNGGANGAN BARU
    "Kuda Coklat": { type: "mount", stamDiscount: 2, goldBonus: 0.10, sellValue: 2500 },
    "Beruang Kutub": { type: "mount", stamDiscount: 4, goldBonus: 0.25, sellValue: 12500 },
    "Naga Terbang": { type: "mount", stamDiscount: 8, goldBonus: 0.50, sellValue: 0 }, // Premium
    
    // ITEM MALL & SPECIAL
    "Mirage Stone": { type: "catalyst", sellValue: 0 },
    "Heaven Stone": { type: "catalyst", sellValue: 0 },
    "Underworld Stone": { type: "catalyst", sellValue: 0 },
    "Universal Stone": { type: "catalyst", sellValue: 0 },
    "Tiket Ubah Job": { type: "special", sellValue: 0 },
    "Tiket Ganti Nama": { type: "special", sellValue: 0 },
    "Ramuan Stamina": { type: "special", sellValue: 0 } 
};

export const REFINE_RATES = {
    "Mirage Stone":     [0.500, 0.300, 0.300, 0.300, 0.300, 0.300, 0.300, 0.300, 0.150, 0.050],
    "Heaven Stone":     [0.650, 0.450, 0.450, 0.450, 0.450, 0.450, 0.450, 0.450, 0.200, 0.100],
    "Underworld Stone": [0.533, 0.335, 0.335, 0.335, 0.335, 0.335, 0.335, 0.335, 0.150, 0.050],
    "Universal Stone":  [1.000, 0.250, 0.100, 0.040, 0.020, 0.008, 0.005, 0.003, 0.001, 0.000]
};