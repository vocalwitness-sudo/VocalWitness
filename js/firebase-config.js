// firebase-config.js

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics } from "firebase/analytics";

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

// Initialize Firebase services
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const analytics = getAnalytics(app);   // You can remove this line if not using analytics

export { app, auth, db, storage, analytics };
