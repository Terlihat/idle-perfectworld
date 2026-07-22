import { auth, db } from './firebase-config.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

let isLoginMode = true;
const googleProvider = new GoogleAuthProvider();

document.addEventListener('click', async (e) => {

    // ==========================================
    // 1. FUNGSI SWITCH ANTARA LOGIN & REGISTER
    // ==========================================
    if (e.target && e.target.id === 'link-toggle-auth') {
        e.preventDefault();
        isLoginMode = !isLoginMode;

        const authTitle = document.getElementById('auth-title');
        const btnAuth = document.getElementById('btn-primary-auth');
        const toggleText = document.getElementById('auth-toggle-text');
        const toggleLink = document.getElementById('link-toggle-auth');

        // 🔥 Variabel baru untuk kolom Konfirmasi Password
        const confirmContainer = document.getElementById('auth-confirm-container');

        if (authTitle && btnAuth && toggleText && toggleLink) {
            if (isLoginMode) {
                authTitle.innerText = "PERFECT WORLD";
                btnAuth.innerText = "MASUK";
                btnAuth.style.background = "#28a745";
                toggleText.innerText = "Belum punya akun?";
                toggleLink.innerText = "Daftar Sekarang";
                if (confirmContainer) confirmContainer.style.display = "none"; // Sembunyikan saat mode Login
            } else {
                authTitle.innerText = "📝 Daftar Pahlawan Baru";
                btnAuth.innerText = "DAFTAR";
                btnAuth.style.background = "#ff9800";
                toggleText.innerText = "Sudah punya akun?";
                toggleLink.innerText = "Masuk di sini";
                if (confirmContainer) confirmContainer.style.display = "block"; // Munculkan saat mode Daftar
            }
        }
    }

    // ==========================================
    // 🔥 FITUR BARU: BUKA/TUTUP MATA (SHOW PASSWORD)
    // ==========================================
    if (e.target && (e.target.classList.contains('btn-toggle-pass') || e.target.closest('.btn-toggle-pass'))) {
        e.preventDefault();
        const btn = e.target.classList.contains('btn-toggle-pass') ? e.target : e.target.closest('.btn-toggle-pass');
        const targetId = btn.getAttribute('data-target');
        const inputElement = document.getElementById(targetId);

        if (inputElement) {
            if (inputElement.type === 'password') {
                inputElement.type = 'text';
                btn.innerText = '🙈'; // Ubah ikon ke monyet tutup mata (atau ikon silang)
            } else {
                inputElement.type = 'password';
                btn.innerText = '👁️'; // Kembalikan ke ikon mata terbuka
            }
        }
    }

    // ==========================================
    // 2. FUNGSI EKSEKUSI LOGIN / REGISTER MANUAL
    // ==========================================
    if (e.target && e.target.id === 'btn-primary-auth') {
        const authEmail = document.getElementById('auth-email');
        const authPassword = document.getElementById('auth-password');
        const authPasswordConfirm = document.getElementById('auth-password-confirm'); // Tangkap input konfirmasi
        const btnAuth = document.getElementById('btn-primary-auth');

        if (!authEmail || !authPassword) return;

        const email = authEmail.value;
        const pass = authPassword.value;

        if (!email || !pass) return alert("Email dan Password wajib diisi!");

        // 🔥 Validasi khusus mode pendaftaran
        if (!isLoginMode) {
            if (pass.length < 6) return alert("Kata sandi minimal 6 karakter!");
            if (pass !== authPasswordConfirm.value) return alert("❌ Gagal! Kata sandi dan konfirmasi kata sandi tidak cocok.");
        }

        try {
            btnAuth.disabled = true;
            btnAuth.innerText = "⏳ Memproses...";
            btnAuth.style.background = "#555";

            if (isLoginMode) {
                await signInWithEmailAndPassword(auth, email, pass);
            } else {
                const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
                await setDoc(doc(db, "users", userCredential.user.uid), {
                    email: email,
                    role: "player",
                    createdAt: new Date().toISOString()
                });
            }

            authEmail.value = "";
            authPassword.value = "";
            if (authPasswordConfirm) authPasswordConfirm.value = "";

        } catch (error) {
            let pesanError = "Terjadi Kesalahan: " + error.message;

            // 🔥 PERBAIKAN: Menerjemahkan kode error Firebase ke bahasa yang lebih manusiawi
            if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
                pesanError = "❌ Email atau Kata Sandi yang Anda masukkan salah!";
            } else if (error.code === 'auth/email-already-in-use') {
                pesanError = "❌ Pendaftaran Gagal: Email ini sudah terdaftar! Silakan langsung login.";
            } else if (error.code === 'auth/too-many-requests') {
                pesanError = "❌ Terlalu banyak percobaan gagal. Demi keamanan, silakan coba lagi beberapa saat lagi.";
            } else if (error.code === 'auth/network-request-failed') {
                pesanError = "❌ Koneksi terputus. Pastikan internet Anda stabil.";
            }

            // Gunakan window.rpgAlert jika sudah tersedia, atau fallback ke alert bawaan browser
            if (typeof window.rpgAlert === 'function') {
                window.rpgAlert(pesanError, "Sistem Autentikasi");
            } else {
                alert(pesanError);
            }

            btnAuth.innerText = isLoginMode ? "MASUK" : "DAFTAR";
            btnAuth.style.background = isLoginMode ? "#28a745" : "#ff9800";
        } finally {
            btnAuth.disabled = false;
        }
    }

    // ==========================================
    // 3. FUNGSI LOGIN GOOGLE
    // ==========================================
    if (e.target && (e.target.id === 'btn-google-auth' || e.target.closest('#btn-google-auth'))) {
        const btnGoogle = document.getElementById('btn-google-auth');
        try {
            btnGoogle.disabled = true;
            btnGoogle.innerHTML = "⏳ Memproses...";

            const result = await signInWithPopup(auth, googleProvider);
            const user = result.user;
            const userRef = doc(db, "users", user.uid);
            const docSnap = await getDoc(userRef);

            if (!docSnap.exists()) {
                await setDoc(userRef, {
                    email: user.email,
                    role: "player",
                    createdAt: new Date().toISOString()
                });
            }
        } catch (error) {
            console.error("Gagal Login Google:", error);
            alert("Gagal Login dengan Google: " + error.message);
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