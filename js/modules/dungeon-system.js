// ===========================================
// SISTEM DATABASE & LOGIKA DUNGEON
// ===========================================
import { doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// 1. Fungsi Tarik Data Monster
export async function fetchMonsterData(db, monsterId) {
    try {
        const docRef = doc(db, "monsters", monsterId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            return docSnap.data();
        } else {
            console.warn(`[SISTEM] Monster ID: ${monsterId} tidak ditemukan di Live Database.`);
            if (typeof window.MONSTER_DB !== 'undefined' && window.MONSTER_DB[monsterId]) {
                return window.MONSTER_DB[monsterId];
            }
            return null;
        }
    } catch (error) {
        console.error("Gagal menarik data monster:", error);
        return null;
    }
}

// 2. Fungsi RNG Drop Item
export function calculateMonsterDrops(dropsArray) {
    let obtainedItems = [];
    if (!dropsArray || dropsArray.length === 0) return obtainedItems;

    dropsArray.forEach(drop => {
        const roll = Math.random() * 100;
        if (roll <= drop.chance) {
            obtainedItems.push(drop.item);
        }
    });

    return obtainedItems;
}

// 3. Fungsi Ambil Data List Monster Dungeon (Murni Data)
export async function getDungeonMonstersList(db) {
    const querySnapshot = await getDocs(collection(db, "monsters"));
    let monstersArray = [];
    
    querySnapshot.forEach(docSnap => {
        const data = docSnap.data();
        const id = docSnap.id;

        // 🔥 LOGIKA PENYARINGAN (FILTER): Deteksi dan abaikan Boss Fuben
        const isFubenBoss = id.startsWith("fb") || (data.name && data.name.includes("[FB"));

        if (!isFubenBoss) {
            monstersArray.push({ id: id, ...data });
        }
    });

    // Urutkan monster berdasarkan Level
    monstersArray.sort((a, b) => (a.levelReq || 1) - (b.levelReq || 1));
    return monstersArray;
}