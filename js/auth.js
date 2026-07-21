// 🔥 PERBAIKAN IMPORT: Menambahkan Provider Google dan modul Firestore
import { auth, db } from './firebase-config.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

let isLoginMode = true;

// 🔥 INISIALISASI GOOGLE PROVIDER
const googleProvider = new GoogleAuthProvider();

// Gunakan Event Delegation pada 'document' karena elemen HTML dimuat menyusul
document.addEventListener('click', async (e) => {

    // ==========================================
    // 1. FUNGSI SWITCH ANTARA LOGIN & REGISTER
    // ==========================================
    if (e.target && e.target.id === 'link-toggle-auth') {
        e.preventDefault();
        isLoginMode = !isLoginMode;

        // Ambil elemen tepat saat diklik
        const authTitle = document.getElementById('auth-title');
        const btnAuth = document.getElementById('btn-primary-auth');
        const toggleText = document.getElementById('auth-toggle-text');
        const toggleLink = document.getElementById('link-toggle-auth');

        if (authTitle && btnAuth && toggleText && toggleLink) {
            if (isLoginMode) {
                authTitle.innerText = "PERFECT WORLD";
                btnAuth.innerText = "MASUK";
                btnAuth.style.background = "#28a745"; // Warna Hijau
                toggleText.innerText = "Belum punya akun?";
                toggleLink.innerText = "Daftar Sekarang";
            } else {
                authTitle.innerText = "📝 Daftar Pahlawan Baru";
                btnAuth.innerText = "DAFTAR";
                btnAuth.style.background = "#ff9800"; // Warna Oranye
                toggleText.innerText = "Sudah punya akun?";
                toggleLink.innerText = "Masuk di sini";
            }
        }
    }

    // ==========================================
    // 2. FUNGSI EKSEKUSI LOGIN / REGISTER MANUAL
    // ==========================================
    if (e.target && e.target.id === 'btn-primary-auth') {
        const authEmail = document.getElementById('auth-email');
        const authPassword = document.getElementById('auth-password');
        const btnAuth = document.getElementById('btn-primary-auth');

        if (!authEmail || !authPassword) return;

        const email = authEmail.value;
        const pass = authPassword.value;

        if (!email || !pass) return alert("Email dan Password wajib diisi!");

        try {
            // Animasi Loading
            btnAuth.disabled = true;
            btnAuth.innerText = "⏳ Memproses...";
            btnAuth.style.background = "#555";

            if (isLoginMode) {
                await signInWithEmailAndPassword(auth, email, pass);
            } else {
                const userCredential = await createUserWithEmailAndPassword(auth, email, pass);

                // 🔥 Buat dokumen awal di Firestore jika ini adalah Register Manual
                await setDoc(doc(db, "users", userCredential.user.uid), {
                    email: email,
                    role: "player",
                    createdAt: new Date().toISOString()
                });
            }

            // Bersihkan input setelah berhasil
            authEmail.value = "";
            authPassword.value = "";

        } catch (error) {
            alert("Terjadi Kesalahan: " + error.message);
            // Kembalikan tombol jika gagal
            btnAuth.innerText = isLoginMode ? "MASUK" : "DAFTAR";
            btnAuth.style.background = isLoginMode ? "#28a745" : "#ff9800";
        } finally {
            btnAuth.disabled = false;
        }
    }

    // ==========================================
    // 🔥 3. FUNGSI LOGIN GOOGLE
    // ==========================================
    if (e.target && (e.target.id === 'btn-google-auth' || e.target.closest('#btn-google-auth'))) {
        const btnGoogle = document.getElementById('btn-google-auth');

        try {
            // Animasi Loading Tombol Google
            btnGoogle.disabled = true;
            btnGoogle.innerHTML = "⏳ Memproses...";

            const result = await signInWithPopup(auth, googleProvider);
            const user = result.user;

            // Cek apakah pemain ini baru pertama kali login pakai Google di Firestore
            const userRef = doc(db, "users", user.uid);
            const docSnap = await getDoc(userRef);

            if (!docSnap.exists()) {
                // Jika dokumen user belum ada (pemain baru), buat dokumen dasar
                await setDoc(userRef, {
                    email: user.email,
                    role: "player",
                    createdAt: new Date().toISOString()
                });
            }

            // Setelah berhasil login, Firebase akan otomatis memicu 'onAuthStateChanged' di file utama Anda 
            // sehingga layar game akan langsung merespons dan terbuka.

        } catch (error) {
            console.error("Gagal Login Google:", error);
            alert("Gagal Login dengan Google: " + error.message);

            // Kembalikan kondisi tombol jika gagal atau dibatalkan
            if (btnGoogle) {
                btnGoogle.disabled = false;
                btnGoogle.innerHTML = `<img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" style="width:18px;"> Lanjutkan dengan Google`;
            }
        }
    }

    // ==========================================
    // 4. FUNGSI LOGOUT (Dari Layar Game)
    // ==========================================
    if (e.target && (e.target.id === 'btn-logout' || e.target.closest('#btn-logout'))) {
        signOut(auth);
    }
});