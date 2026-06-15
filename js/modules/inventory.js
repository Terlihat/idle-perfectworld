import { doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { ITEM_DB } from '../data/items.js';

export async function equipFromInventory(db, uid, itemName, specialInput) {
    if (!uid || !ITEM_DB[itemName]) return;
    const itemData = ITEM_DB[itemName];
    const userRef = doc(db, "users", uid);

    try {
        await runTransaction(db, async (ts) => {
            const data = (await ts.get(userRef)).data();
            let inv = data.inventory || {};
            // Ditambahkan dukungan slot mount
            let eq = data.equipment || { weapon: null, armor: null, accessory: null, mount: null };
            
            if (!inv[itemName] || inv[itemName] <= 0) throw "Item tidak ditemukan!";
            
            // Logika Item Spesial (Mall)
            if (itemData.type === "special") {
                inv[itemName] -= 1;
                if (inv[itemName] === 0) delete inv[itemName];
                let updates = { inventory: inv };

                if (itemName === "Tiket Ganti Nama") { updates.username = specialInput; } 
                else if (itemName === "Tiket Ubah Job") {
                    updates.characterClass = specialInput;
                    if (specialInput === 'Warrior') { updates.str = 15; updates.con = 20; updates.dex = 5; updates.int = 2; }
                    else { updates.str = 2; updates.con = 8; updates.dex = 10; updates.int = 25; }
                } else if (itemName === "Ramuan Stamina") {
                    const maxStam = data.maxStamina || 100;
                    const curStam = data.currentStamina || 0;
                    if (curStam >= maxStam) throw "Stamina penuh!";
                    updates.currentStamina = Math.min(maxStam, curStam + 50);
                }
                ts.update(userRef, updates); return;
            }

            // Logika Consumable (Potions)
            if (itemData.type === "consumable") {
                inv[itemName] -= 1;
                if (inv[itemName] === 0) delete inv[itemName];
                let updates = { inventory: inv };
                if (itemName === "Ramuan HP") updates.currentHp = Math.min(data.maxHp || 1000, (data.currentHp || 0) + 500);
                if (itemName === "Ramuan MP") updates.currentMp = Math.min(data.maxMp || 200, (data.currentMp || 0) + 200);
                ts.update(userRef, updates); return;
            }

            // Logika Pemasangan Equipment & Mount
            const slotType = itemData.type;
            if (eq[slotType] && eq[slotType].name) { inv[eq[slotType].name] = (inv[eq[slotType].name] || 0) + 1; }
            
            inv[itemName] -= 1;
            if (inv[itemName] === 0) delete inv[itemName];
            
            eq[slotType] = { name: itemName, refine: 0, ...itemData };
            ts.update(userRef, { inventory: inv, equipment: eq });
        });
        alert(`🛡️ Berhasil memakai ${itemName}`);
    } catch (err) { alert(err); }
}

export async function sellItemToNPC(db, uid, itemName) {
    if (!uid || !itemName) return;
    const userRef = doc(db, "users", uid);
    const itemData = ITEM_DB[itemName] || { sellValue: 10 };
    if (itemData.sellValue === 0) return alert("Item ini tidak bisa dijual!");

    try {
        await runTransaction(db, async (ts) => {
            const data = (await ts.get(userRef)).data();
            let inv = data.inventory || {};
            if (!inv[itemName] || inv[itemName] <= 0) throw "Item tidak ditemukan!";

            inv[itemName] -= 1;
            if (inv[itemName] === 0) delete inv[itemName];
            
            let currentGold = data.gold || 0;
            ts.update(userRef, { inventory: inv, gold: currentGold + itemData.sellValue });
        });
    } catch (err) { alert(err); }
}