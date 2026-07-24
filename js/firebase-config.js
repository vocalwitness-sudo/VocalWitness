// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

// Your Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyATxYekXgjdLP2SfR42FG8rEdajq_pIEb0",
  authDomain: "vocalwitness-3affa.firebaseapp.com",
  projectId: "vocalwitness-3affa",
  storageBucket: "vocalwitness-3affa.firebasestorage.app",
  messagingSenderId: "108466981866",
  appId: "1:108466981866:web:b53360ad44012a576c8093"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize core Firebase services (Auth, Firestore, Storage)
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Google Auth Provider setup
export const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

export { app, auth, db, storage };
