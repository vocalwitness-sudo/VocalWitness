// js/firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyATxYekXgjdLP2SfR42FG8rEdajq_pIEb0",
    authDomain: "vocalwitness-3affa.firebaseapp.com",
    projectId: "vocalwitness-3affa",
    storageBucket: "vocalwitness-3affa.firebasestorage.app",
    messagingSenderId: "108466981866",
    appId: "1:108466981866:web:b53360ad44012a576c8093"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const storage = getStorage(app);

console.log("✅ Firebase Config Loaded Successfully");
