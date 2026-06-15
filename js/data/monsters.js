export const MONSTER_DB = {
    "slime": {
        name: "💧 Slime Hijau", levelReq: 1, 
        hp: 50, atk: 15, def: 5, 
        rewardExp: 20, rewardGold: 15, 
        drop: { item: "Pedang Besi", chance: 0.10 } // 10% peluang drop
    },
    "goblin": {
        name: "👺 Goblin Perampok", levelReq: 5, 
        hp: 200, atk: 40, def: 15, 
        rewardExp: 80, rewardGold: 50, 
        drop: { item: "Zirah Kulit", chance: 0.10 }
    },
    "orc": {
        name: "👹 Orc Warrior", levelReq: 10, 
        hp: 800, atk: 85, def: 40, 
        rewardExp: 300, rewardGold: 150, 
        drop: { item: "Cincin Akurat", chance: 0.05 }
    },
    "dragon": {
        name: "🐉 Anak Naga", levelReq: 15, 
        hp: 2500, atk: 150, def: 80, 
        rewardExp: 1000, rewardGold: 500, 
        drop: { item: "Pedang Darah (Rare)", chance: 0.02 }
    }
};