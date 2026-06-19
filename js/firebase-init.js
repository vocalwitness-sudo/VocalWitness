// Import the functions you need from the SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";

// Your Firebase configuration object
const firebaseConfig = {
  apiKey: "AIzaSyATxYekXgjdLP2SfR42FG8rEdajq_pIEb0",
  authDomain: "vocalwitness-3affa.firebaseapp.com",
  projectId: "vocalwitness-3affa",
  storageBucket: "vocalwitness-3affa.firebasestorage.app",
  messagingSenderId: "108466981866",
  appId: "1:108466981866:web:b53360ad44012a576c8093",
  measurementId: "G-LQ2JRWD06W"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export these so you can use them in other files
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);
