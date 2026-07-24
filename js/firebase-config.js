// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-analytics.js";

// Your Firebase Config (Secured & Cleaned)
const firebaseConfig = {
  apiKey: "AIzaSyATxYekXgjdLP2SfR42FG8rEdajq_pIEb0",
  authDomain: "vocalwitness-3affa.firebaseapp.com",
  projectId: "vocalwitness-3affa",
  storageBucket: "vocalwitness-3affa.firebasestorage.app",
  messagingSenderId: "108466981866",
  appId: "1:108466981866:web:b53360ad44012a576c8093",
  measurementId: "G-XXXXXXXXXX" // Optional: Add if tracking analytics
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services safely
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Initialize Analytics conditionally (prevents crashes in non-browser or extension environments)
let analytics = null;
isSupported().then((supported) => {
  if (supported) {
    analytics = getAnalytics(app);
  }
});

export { app, auth, db, storage, analytics };
