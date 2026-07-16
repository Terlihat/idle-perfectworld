/* ====================
   MODUL INVENTORY
   ==================== */
import { doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { ITEM_DB } from '../data/items.js';

export async function equipFromInventory(db, uid, itemName, specialInput) {
    if (!uid) return;

    let baseName = itemName.replace(/\s\[\+\d+\]$/, '');
    let currentRefine = 0;
    const match = itemName.match(/\[\+(\d+)\]$/);
    if (match) currentRefine = parseInt(match[1]);

    const localData = ITEM_DB[baseName] || {};
    const cloudData = (window.CLOUD_ITEM_DB && window.CLOUD_ITEM_DB[baseName]) ? window.CLOUD_ITEM_DB[baseName] : {};

    let itemData = { ...localData, ...cloudData };

    if (!itemData.type) itemData.type = "misc";

    const userRef = doc(db, "users", uid);

    try {
        await runTransaction(db, async (ts) => {
            const data = (await ts.get(userRef)).data();
            let inv = data.inventory || {};
            let eq = data.equipment || { weapon: null, armor: null, accessory: null, mount: null };

            if (!inv[itemName] || inv[itemName] <= 0) throw "Item tidak ditemukan!";

            if (itemData.type === "special") {
                inv[itemName] -= 1;
                if (inv[itemName] === 0) delete inv[itemName];
                let updates = { inventory: inv };

                if (itemName === "Tiket Ganti Nama") {
                    updates.username = specialInput;
                    if (data.guildId) {
                        const guildRef = doc(db, "guilds", data.guildId);
                        const gSnap = await ts.get(guildRef);
                        if (gSnap.exists()) {
                            let gData = gSnap.data();
                            let updatedMembers = gData.members.map(m => m.uid === uid ? { ...m, name: specialInput } : m);
                            ts.update(guildRef, { members: updatedMembers });
                            if (gData.leaderId === uid) ts.update(guildRef, { leaderName: specialInput });
                        }
                    }
                } else if (itemName === "Tiket Ubah Job") {
                    updates.characterClass = specialInput;
                } else if (itemName === "Buku Reset Stats") {
                    updates.str = 0; updates.con = 0; updates.dex = 0; updates.int = 0;
                    const baseTotal = data.characterClass === 'Warrior' ? 42 : 45;
                    updates.statPoints = baseTotal + ((data.level || 1) - 1) * 5;
                } else {
                    throw `Item [${itemName}] belum memiliki fungsi yang aktif.`;
                }

                ts.update(userRef, updates); return;
            } else if (itemData.type === "consumable") {
                inv[itemName] -= 1;
                if (inv[itemName] === 0) delete inv[itemName];
                let updates = { inventory: inv };

                if (itemName === "Ramuan HP") updates.currentHp = Math.min(data.maxHp || 1000, (data.currentHp || 0) + 1000);
                else if (itemName === "Ramuan MP") updates.currentMp = Math.min(data.maxMp || 200, (data.currentMp || 0) + 200);

                ts.update(userRef, updates); return;
            }

            // --- 2. LOGIKA MEMAKAI PERLENGKAPAN ---
            const slotType = itemData.type;

            const validEquipTypes = ["weapon", "armor", "accessory", "mount"];
            if (!validEquipTypes.includes(slotType)) {
                throw `[${itemName}] tidak bisa dipakai atau digunakan secara langsung dari tas.`;
            }

            if (eq[slotType] && eq[slotType].name) {
                let oldItemName = eq[slotType].name;
                if (eq[slotType].refine > 0) oldItemName += ` [+${eq[slotType].refine}]`;
                inv[oldItemName] = (inv[oldItemName] || 0) + 1;
            }

            inv[itemName] -= 1;
            if (inv[itemName] === 0) delete inv[itemName];

            eq[slotType] = { name: baseName, refine: currentRefine, ...itemData };
            ts.update(userRef, { inventory: inv, equipment: eq });
        });

        if (itemData.type !== "consumable" && itemData.type !== "special") {
            alert(`🛡️ Berhasil memakai ${itemName}`);
        }
    } catch (err) {
        alert(err);
    }
}

export async function sellItemToNPC(db, uid, itemName) {
    if (!uid || !itemName) return;
    const userRef = doc(db, "users", uid);
    const baseName = itemName.replace(/\s\[\+\d+\]$/, '');

    const localData = ITEM_DB[baseName] || {};
    const cloudData = (window.CLOUD_ITEM_DB && window.CLOUD_ITEM_DB[baseName]) ? window.CLOUD_ITEM_DB[baseName] : {};
    const itemData = { ...localData, ...cloudData };

    let finalSellPrice = 10;
    if (itemData.sellValue !== undefined) {
        finalSellPrice = itemData.sellValue;
    } else if (itemData.goldPrice !== undefined) {
        finalSellPrice = itemData.goldPrice;
    }

    if (finalSellPrice === 0) return alert("Item ini tidak bisa dijual!");

    try {
        await runTransaction(db, async (ts) => {
            const data = (await ts.get(userRef)).data();
            let inv = data.inventory || {};
            if (!inv[itemName] || inv[itemName] <= 0) throw "Item tidak ditemukan!";

            inv[itemName] -= 1;
            if (inv[itemName] === 0) delete inv[itemName];

            const currentGold = data.gold || 0;
            ts.update(userRef, { inventory: inv, gold: currentGold + finalSellPrice });
        });
        alert(`Berhasil menjual ${itemName} seharga ${finalSellPrice} Gold.`);
    } catch (err) { alert(err); }
}

export async function unequipItem(db, uid, slotType) {
    if (!uid) return;
    const userRef = doc(db, "users", uid);

    try {
        await runTransaction(db, async (ts) => {
            const data = (await ts.get(userRef)).data();
            let inv = data.inventory || {};
            let eq = data.equipment || {};

            if (!eq[slotType] || !eq[slotType].name) throw "Slot ini sudah kosong.";

            let oldItemName = eq[slotType].name;
            if (eq[slotType].refine && eq[slotType].refine > 0) {
                oldItemName += ` [+${eq[slotType].refine}]`;
            }

            inv[oldItemName] = (inv[oldItemName] || 0) + 1;

            eq[slotType] = null;

            ts.update(userRef, { inventory: inv, equipment: eq });
        });
    } catch (err) { alert(err); }
}