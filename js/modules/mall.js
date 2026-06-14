import { doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export async function buyGachaBox(db, uid) {
    if (!uid) return;
    const userRef = doc(db, "users", uid);

    try {
        await runTransaction(db, async (ts) => {
            const data = (await ts.get(userRef)).data();
            if ((data.coin || 0) < 20) throw "Koin Premium tidak cukup!";

            let inv = data.inventory || {};
            inv["Gacha Box Premium"] = (inv["Gacha Box Premium"] || 0) + 1;

            ts.update(userRef, {
                coin: data.coin - 20,
                inventory: inv
            });
        });
        alert("🎁 Gacha Box Premium telah ditambahkan ke tas Anda!");
    } catch (err) {
        alert(err);
    }
}