// Import fungsi inti dari Firebase SDK (Versi 10.x)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// TODO: GANTI DENGAN CONFIG FIREBASE ANDA
const firebaseConfig = {
	apiKey: "AIzaSyB3RgNUF7fsjxGbp8Wy9oI4zIljVXtwpY4",
	authDomain: "idle-pefectworld.firebaseapp.com",
	projectId: "idle-pefectworld",
	storageBucket: "idle-pefectworld.firebasestorage.app",
	messagingSenderId: "648934472235",
	appId: "1:648934472235:web:e25b6180ec9cdd1b45886e"
};

// Inisialisasi Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);