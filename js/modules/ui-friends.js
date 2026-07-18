// ==========================================
// SISTEM UI: JEMBATAN PERTEMANAN
// ==========================================
import { collection, query, where, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

export function setupFriendUI(db, getUidCallback, getStatsCallback, friendAPI) {
    const { sendFriendRequest, acceptFriendRequest, rejectFriendRequest, removeFriend } = friendAPI;

    window.toggleFriendTab = function (tab) {
        document.getElementById('tab-friend-list').style.display = tab === 'list' ? 'block' : 'none';
        document.getElementById('tab-friend-req').style.display = tab === 'req' ? 'block' : 'none';
        document.getElementById('btn-tab-list').style.background = tab === 'list' ? '#238636' : '#333';
        document.getElementById('btn-tab-req').style.background = tab === 'req' ? '#8957e5' : '#333';
    };

    window.sendFriendReqManual = async function () {
        const inputVal = document.getElementById('input-add-friend').value.trim();
        if (!inputVal) return window.rpgAlert("Masukkan Nickname");

        const currentUserUid = getUidCallback();
        const currentPlayerStats = getStatsCallback();
        let targetUid = inputVal;

        try {
            // 1. Coba cari berdasarkan Nickname (Username) terlebih dahulu
            const usersRef = collection(db, "users");
            const q = query(usersRef, where("username", "==", inputVal));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                targetUid = querySnapshot.docs[0].id;
            } else {
                // Pengecekan jika input adalah UID langsung
                const docSnap = await getDoc(doc(db, "users", inputVal));
                if (!docSnap.exists()) {
                    return window.rpgAlert(`Pemain dengan nama atau UID [${inputVal}] tidak ditemukan! Pastikan huruf besar/kecil sesuai.`, "Gagal");
                }
            }

            // 2. Eksekusi pengiriman undangan
            await sendFriendRequest(db, currentUserUid, currentPlayerStats, targetUid);
            window.rpgAlert(`Permintaan pertemanan berhasil dikirim!`, "Sukses");
            document.getElementById('input-add-friend').value = "";

        } catch (err) {
            const errorMsg = typeof err === 'string' ? err : "Terjadi kesalahan sistem.";
            window.rpgAlert(errorMsg, "Gagal");
        }
    };

    window.accFriend = async function (reqUid, reqName, reqLevel) {
        try { await acceptFriendRequest(db, getUidCallback(), getStatsCallback(), reqUid, { username: reqName, level: reqLevel }); }
        catch (err) { console.error(err); }
    };

    window.rejFriend = async function (reqUid) {
        try { await rejectFriendRequest(db, getUidCallback(), reqUid); }
        catch (err) { console.error(err); }
    };

    window.delFriend = async function (targetUid) {
        if (await window.rpgConfirm("Yakin ingin menghapus teman ini?", "Hapus Teman")) {
            try { await removeFriend(db, getUidCallback(), targetUid); }
            catch (err) { console.error(err); }
        }
    };
}