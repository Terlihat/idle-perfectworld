// ==========================================
// SISTEM PEMANTAUAN MAINTENANCE SERVER
// ==========================================
import { doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

export function setupMaintenanceMonitor(db, auth) {
    onSnapshot(doc(db, "server", "status"), async (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();

            // 1. Buat elemen Layar Hitam jika belum ada
            let mtOverlay = document.getElementById('maintenance-overlay');
            if (!mtOverlay) {
                mtOverlay = document.createElement('div');
                mtOverlay.id = 'maintenance-overlay';
                mtOverlay.style.cssText = "position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background-color: #0d1117; color: white; display: none; flex-direction: column; align-items: center; justify-content: center; z-index: 999999; text-align: center; padding: 20px;";
                document.body.appendChild(mtOverlay);
            }

            if (data.isMaintenance === true) {
                // 2. Cek apakah pengguna saat ini adalah seorang Admin
                let isAdmin = false;
                if (auth.currentUser) {
                    try {
                        const userSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
                        if (userSnap.exists() && userSnap.data().role === 'admin') {
                            isAdmin = true;
                        }
                    } catch (e) { console.error("Gagal mengecek role:", e); }
                }

                // 3. Jika dia Admin, biarkan lewat!
                if (isAdmin) {
                    mtOverlay.style.display = 'none';
                    return;
                }

                // 4. Jika bukan Admin (atau belum login), jalankan pemblokiran
                if (auth.currentUser) {
                    signOut(auth);
                }

                mtOverlay.innerHTML = `
                    <h1 id="mt-secret-door" style="color: #ffca28; font-size: 36px; margin-bottom: 10px; cursor: default; user-select: none;">🛠️ SERVER MAINTENANCE</h1>
                    <p style="font-size: 16px; color: #ccc; max-width: 400px; line-height: 1.5;">
                        ${data.message || "Server sedang dalam perbaikan rutin. Harap bersabar dan kembali lagi nanti."}
                    </p>
                `;
                mtOverlay.style.display = 'flex';

                // 5. PINTU RAHASIA: Klik judul 5x untuk membuka kunci layar
                let secretClicks = 0;
                const secretBtn = document.getElementById('mt-secret-door');
                if (secretBtn) {
                    secretBtn.addEventListener('click', () => {
                        secretClicks++;
                        if (secretClicks >= 5) {
                            mtOverlay.style.display = 'none'; // Sembunyikan layar
                            secretClicks = 0; // Reset hitungan
                            console.log("Pintu rahasia admin terbuka!");
                        }
                    });
                }

            } else {
                mtOverlay.style.display = 'none';
            }
        }
    });
}