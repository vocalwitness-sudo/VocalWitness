// js/firebase-config.js - Firebase Service Initialization & Config
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { 
  getAuth, 
  GoogleAuthProvider, 
  setPersistence, 
  browserLocalPersistence 
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { initializeFirestore } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js";

// Dynamically determine host origin for seamless proxying with rewrites
const hostDomain = window.location.hostname || "vocalwitness-3affa.web.app";

const firebaseConfig = {
  apiKey: "AIzaSyATxYekXgjdLP2SfR42FG8rEdajq_pIEb0",
  // Matches host domain so auth handler runs on the same origin via firebase.json rewrites
  authDomain: hostDomain.includes("vocalwitness.com") ? "vocalwitness.com" : "vocalwitness-3affa.web.app",
  projectId: "vocalwitness-3affa",
  storageBucket: "vocalwitness-3affa.firebasestorage.app",
  messagingSenderId: "108466981866",
  appId: "1:108466981866:web:b53360ad44012a576c8093"
};

// Safe initialization preventing duplicate defaults
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Explicitly pass `app` to services
const auth = getAuth(app);

// Force browser local persistence to prevent cross-origin sessionStorage loss in Firefox/Safari
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn("Could not enforce local persistence:", err);
});

const db = initializeFirestore(app, {
  experimentalForceLongPolling: true
});
const storage = getStorage(app);

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

export { app, auth, db, storage, provider };
