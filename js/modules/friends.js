import { doc, runTransaction, updateDoc, deleteField } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// 1. Mengirim Permintaan Pertemanan
export async function sendFriendRequest(db, myUid, myData, targetUid) {
    if (!targetUid || myUid === targetUid) throw "UID tidak valid atau Anda mencoba menambahkan diri sendiri!";
    
    const targetRef = doc(db, "users", targetUid);
    await runTransaction(db, async (ts) => {
        const targetSnap = await ts.get(targetRef);
        if (!targetSnap.exists()) throw "Pemain dengan UID tersebut tidak ditemukan.";
        
        const targetData = targetSnap.data();
        if (targetData.friends && targetData.friends[myUid]) throw "Pemain ini sudah menjadi teman Anda.";
        if (targetData.friendRequests && targetData.friendRequests[myUid]) throw "Permintaan sudah pernah dikirim. Menunggu persetujuan.";

        // Tambahkan data kita ke daftar antrean 'friendRequests' target
        ts.update(targetRef, {
            [`friendRequests.${myUid}`]: {
                username: myData.username,
                level: myData.level || 1,
                timestamp: Date.now()
            }
        });
    });
}

// 2. Menerima Permintaan
export async function acceptFriendRequest(db, myUid, myData, requesterUid, requesterData) {
    const myRef = doc(db, "users", myUid);
    const requesterRef = doc(db, "users", requesterUid);

    await runTransaction(db, async (ts) => {
        // A: Hapus dari daftar antrean kita, lalu masukkan ke daftar teman resmi
        ts.update(myRef, {
            [`friends.${requesterUid}`]: { username: requesterData.username, level: requesterData.level },
            [`friendRequests.${requesterUid}`]: deleteField()
        });

        // B: Tambahkan kita ke daftar teman resmi si pengirim
        ts.update(requesterRef, {
            [`friends.${myUid}`]: { username: myData.username, level: myData.level }
        });
    });
}

// 3. Menolak Permintaan
export async function rejectFriendRequest(db, myUid, requesterUid) {
    const myRef = doc(db, "users", myUid);
    await updateDoc(myRef, {
        [`friendRequests.${requesterUid}`]: deleteField() // Cukup hapus dari database
    });
}

// 4. Menghapus Teman
export async function removeFriend(db, myUid, targetUid) {
    const myRef = doc(db, "users", myUid);
    const targetRef = doc(db, "users", targetUid);

    await runTransaction(db, async (ts) => {
        ts.update(myRef, { [`friends.${targetUid}`]: deleteField() });
        ts.update(targetRef, { [`friends.${myUid}`]: deleteField() });
    });
}