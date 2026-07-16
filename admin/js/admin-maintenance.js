// File: admin-maintenance.js
import { db } from '../../js/firebase-config.js'; 
import { doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// 1. Fungsi untuk memantau status dari Firebase dan memperbarui tampilan centang di UI
window.listenToMaintenanceStatus = function () {
    onSnapshot(doc(db, "server", "status"), (docSnap) => {
        const checkbox = document.getElementById('toggle-maintenance');
        if (docSnap.exists() && checkbox) {
            checkbox.checked = docSnap.data().isMaintenance === true;
        }
    });
};

// 2. Fungsi yang dipicu saat Anda mengklik saklar on/off
window.toggleMaintenanceMode = async function(isActive) {
    try {
        await setDoc(doc(db, "server", "status"), {
            isMaintenance: isActive,
            message: "Server sedang dalam perbaikan atau pembaruan sistem. Harap bersabar dan kembali lagi nanti!"
        }, { merge: true });
        
        console.log("Mode Maintenance:", isActive ? "ON" : "OFF");

        // (Bonus) Otomatis mencatat ke dalam Log Admin jika fungsinya tersedia
        if (window.logAdminAction) {
            window.logAdminAction("SYSTEM", `Mengubah status Maintenance Server menjadi: ${isActive ? "ON" : "OFF"}`);
        }

    } catch (err) {
        alert("Gagal mengubah status server: " + err);
    }
};