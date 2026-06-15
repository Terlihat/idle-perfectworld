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
            let eq = data.equipment || { weapon: null, armor: null, accessory: null };
            
            if (!inv[itemName] || inv[itemName] <= 0) throw "Item tidak ditemukan!";
            
            // Logika Item Spesial (Mall)
            if (itemData.type === "special") {
                inv[itemName] -= 1;
                if (inv[itemName] === 0) delete inv[itemName];
                let updates = { inventory: inv };

                if (itemName === "Tiket Ganti Nama") { 
                    updates.username = specialInput; 
                } else if (itemName === "Tiket Ubah Job") {
                    updates.characterClass = specialInput;
                    if (specialInput === 'Warrior') { updates.str = 15; updates.con = 20; updates.dex = 5; updates.int = 2; }
                    else { updates.str = 2; updates.con = 8; updates.dex = 10; updates.int = 25; }
                } else if (itemName === "Ramuan Stamina") {
                    // BARU: Logika Pemulihan Stamina
                    const maxStam = data.maxStamina || 100;
                    const curStam = data.currentStamina || 0;
                    if (curStam >= maxStam) throw "Stamina Anda sudah penuh!";
                    updates.currentStamina = Math.min(maxStam, curStam + 50); // Memulihkan 50 Stamina
                }

                ts.update(userRef, updates);
                return;
            }

            // Logika Pemasangan Equipment
            const slotType = itemData.type;
            if (eq[slotType] && eq[slotType].name) {
                inv[eq[slotType].name] = (inv[eq[slotType].name] || 0) + 1; 
            }
            inv[itemName] -= 1;
            if (inv[itemName] === 0) delete inv[itemName];
            
            eq[slotType] = { name: itemName, refine: 0, ...itemData };
            ts.update(userRef, { inventory: inv, equipment: eq });
        });
        alert(itemData.type === "special" ? `✨ Penggunaan ${itemName} Berhasil!` : `🛡️ Berhasil memasang ${itemName}`);
    } catch (err) { alert(err); }
}

export async function sellItemToNPC(db, uid, itemName) {
    if (!uid) return;
    const itemData = ITEM_DB[itemName];
    const sellPrice = itemData ? itemData.sellValue : 20;
    if (sellPrice <= 0) return alert("Item ini terikat dan tidak bisa dijual.");

    const confirmSell = confirm(`Jual ke NPC 1x [${itemName}] seharga ${sellPrice} GOLD?`);
    if (!confirmSell) return;

    const userRef = doc(db, "users", uid);
    try {
        await runTransaction(db, async (ts) => {
            const data = (await ts.get(userRef)).data();
            let inv = data.inventory || {};
            if (!inv[itemName] || inv[itemName] < 1) throw "Item tidak ditemukan!";
            inv[itemName] -= 1;
            if (inv[itemName] === 0) delete inv[itemName];
            ts.update(userRef, { inventory: inv, gold: (data.gold || 0) + sellPrice });
        });
    } catch (err) { alert(err); }
}