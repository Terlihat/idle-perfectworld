import { auth } from './firebase-config.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

export async function registerWithEmail(email, password) {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        return userCredential.user;
    } catch (error) { throw getReadableAuthError(error.code); }
}

export async function loginWithEmail(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        return userCredential.user;
    } catch (error) { throw getReadableAuthError(error.code); }
}

export async function logoutUser() {
    try { await signOut(auth); } catch (error) { console.error("Gagal Logout:", error); }
}

function getReadableAuthError(code) {
    switch (code) {
        case 'auth/email-already-in-use': return 'Email sudah terdaftar!';
        case 'auth/invalid-email': return 'Format email tidak valid!';
        case 'auth/weak-password': return 'Password terlalu lemah (Minimal 6 karakter)!';
        case 'auth/missing-password': return 'Password tidak boleh kosong!';
        case 'auth/invalid-credential': return 'Email atau password salah!';
        default: return 'Terjadi kesalahan autentikasi: ' + code;
    }
}
