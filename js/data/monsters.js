/* ===================================================
   DATABASE MONSTER & ELITE BOSS (FB)
   =================================================== */

export const MONSTER_DB = {
    "slime": { name: "💧 Slime Hijau", levelReq: 1, hp: 50, atk: 15, def: 5, rewardExp: 20, rewardGold: 15, drop: { item: "Pedang Besi", chance: 0.10 } },
    "goblin": { name: "👺 Goblin Perampok", levelReq: 5, hp: 200, atk: 40, def: 15, rewardExp: 80, rewardGold: 50, drop: { item: "Zirah Kulit", chance: 0.10 } },
    "orc": { name: "👹 Orc Warrior", levelReq: 10, hp: 800, atk: 85, def: 40, rewardExp: 300, rewardGold: 150, drop: { item: "Cincin Akurat", chance: 0.05 } },
    "dragon": { name: "🐉 Anak Naga", levelReq: 15, hp: 2500, atk: 150, def: 80, rewardExp: 1000, rewardGold: 500, drop: { item: "Pedang Darah (Rare)", chance: 0.02 } }
};

export const FB_BOSSES = {
    "fb19": { name: "🔥 [FB19] Roiling Terror", levelReq: 19, hp: 25000, atk: 250, def: 120, rewardExp: 5000, rewardGold: 2000, drop: { item: "Zirah Naga (Rare)", chance: 0.50 } },
    "fb29": { name: "👻 [FB29] Qingzi", levelReq: 29, hp: 60000, atk: 450, def: 250, rewardExp: 15000, rewardGold: 5000, drop: { item: "Pedang Darah (Rare)", chance: 0.50 } },
    "fb39": { name: "👁️ [FB39] Herculean", levelReq: 39, hp: 120000, atk: 800, def: 400, rewardExp: 35000, rewardGold: 10000, drop: { item: "Mata Iblis (Rare)", chance: 0.60 } },
    "fb51": { name: "🐉 [FB51] Wyvern", levelReq: 51, hp: 300000, atk: 1500, def: 800, rewardExp: 80000, rewardGold: 25000, drop: { item: "Universal Stone", chance: 0.10 } },
    "fb59": { name: "🦍 [FB59] Gluttonix", levelReq: 59, hp: 600000, atk: 2500, def: 1200, rewardExp: 150000, rewardGold: 50000, drop: { item: "Tiket Ubah Job", chance: 0.05 } },
    "fb69": { name: "🐸 [FB69] Viperion", levelReq: 69, hp: 1200000, atk: 4000, def: 2000, rewardExp: 300000, rewardGold: 100000, drop: { item: "Universal Stone", chance: 0.20 } },
    "fb79": { name: "🏴‍☠️ [FB79] Linus The Black", levelReq: 79, hp: 2500000, atk: 7000, def: 3500, rewardExp: 600000, rewardGold: 200000, drop: { item: "Universal Stone", chance: 0.30 } },
    "fb89": { name: "👼 [FB89] Brahma / 😈 Behemoth", levelReq: 89, hp: 5000000, atk: 12000, def: 6000, rewardExp: 1200000, rewardGold: 500000, drop: { item: "Universal Stone", chance: 0.50 } },
    "fb99": { name: "👑 [FB99] Emperor of Heaven/Hell", levelReq: 99, hp: 10000000, atk: 25000, def: 12000, rewardExp: 3000000, rewardGold: 1000000, drop: { item: "Universal Stone", chance: 0.80 } },
    "fb100":{ name: "🌌 [FB100] Goddess of Perfect World", levelReq: 100, hp: 25000000, atk: 50000, def: 25000, rewardExp: 10000000, rewardGold: 5000000, drop: { item: "Universal Stone", chance: 1.00 } }
};