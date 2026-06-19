import { auth } from './firebase-config.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

let isLoginMode = true;

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
                authTitle.innerText = "🚪 Masuk Gerbang RPG";
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
    // 2. FUNGSI EKSEKUSI LOGIN / REGISTER
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
                await createUserWithEmailAndPassword(auth, email, pass);
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
    // 3. FUNGSI LOGOUT (Dari Layar Game)
    // ==========================================
    if (e.target && (e.target.id === 'btn-logout' || e.target.closest('#btn-logout'))) {
        signOut(auth);
    }
});