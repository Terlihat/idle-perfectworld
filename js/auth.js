import { auth } from './firebase-config.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

let isLoginMode = true;

const authTitle = document.getElementById('auth-title');
const authEmail = document.getElementById('auth-email');
const authPassword = document.getElementById('auth-password');
const btnAuth = document.getElementById('btn-primary-auth');
const toggleText = document.getElementById('auth-toggle-text');
const toggleLink = document.getElementById('link-toggle-auth');
const btnLogout = document.getElementById('btn-logout');

// Fungsi Switch Antara Login dan Register
if (toggleLink) {
    toggleLink.addEventListener('click', (e) => {
        e.preventDefault();
        isLoginMode = !isLoginMode;
        
        if (isLoginMode) {
            authTitle.innerText = "Masuk Gerbang RPG";
            btnAuth.innerText = "MASUK";
            toggleText.innerText = "Belum punya akun?";
            toggleLink.innerText = "Daftar Sekarang";
        } else {
            authTitle.innerText = "Daftar Pahlawan Baru";
            btnAuth.innerText = "DAFTAR";
            toggleText.innerText = "Sudah punya akun?";
            toggleLink.innerText = "Masuk di sini";
        }
    });
}

// Fungsi Eksekusi Login / Register
if (btnAuth) {
    btnAuth.addEventListener('click', async () => {
        const email = authEmail.value;
        const pass = authPassword.value;
        if (!email || !pass) return alert("Email dan Password wajib diisi!");

        try {
            btnAuth.disabled = true;
            btnAuth.innerText = "Memproses...";
            
            if (isLoginMode) {
                await signInWithEmailAndPassword(auth, email, pass);
            } else {
                await createUserWithEmailAndPassword(auth, email, pass);
            }
            
            authEmail.value = "";
            authPassword.value = "";
        } catch (error) {
            alert("Terjadi Kesalahan: " + error.message);
            btnAuth.innerText = isLoginMode ? "MASUK" : "DAFTAR";
        } finally {
            btnAuth.disabled = false;
        }
    });
}

// Fungsi Logout
if (btnLogout) {
    btnLogout.addEventListener('click', () => {
        signOut(auth);
    });
}