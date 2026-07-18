// File: leaderboard.js (atau modules/leaderboard.js)
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export async function getLeaderboardData(db) {
    const usersRef = collection(db, "users");
    const snap = await getDocs(usersRef);
    let usersData = [];

    snap.forEach(docSnap => {
        const d = docSnap.data();
        if (d.username) {
            usersData.push({
                name: d.username,
                level: d.level || 1,
                gold: d.gold || 0,
                class: d.characterClass || '-',
                tower: d.towerFloor || 1
            });
        }
    });

    return usersData;
}