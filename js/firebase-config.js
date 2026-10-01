




// js/firebase-config.js - Centralized Firebase Initialization & Config
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { 
  getAuth, 
  GoogleAuthProvider, 
  TwitterAuthProvider, 
  GithubAuthProvider, 
  setPersistence, 
  browserLocalPersistence 
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { 
  initializeFirestore, 
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app-check.js";

// Dynamically target auth domain for custom domain or web.app execution
const hostDomain = window.location.hostname;
const isCustomDomain = hostDomain.includes("vocalwitness.com");

const firebaseConfig = {
  apiKey: "AIzaSyATxYekXgjdLP2SfR42FG8rEdajq_pIEb0",
  authDomain: isCustomDomain ? "vocalwitness.com" : "vocalwitness-3affa.firebaseapp.com",
  projectId: "vocalwitness-3affa",
  storageBucket: "vocalwitness-3affa.appspot.com",
  messagingSenderId: "108466981866",
  appId: "1:108466981866:web:b53360ad44012a576c8093"
};

// Safe singleton initialization
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// ========== INITIALIZE APP CHECK ==========
// Ensure you register your site key in the Firebase Console under App Check -> reCAPTCHA Enterprise
const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaEnterpriseProvider('6LdT0tktAAAAABiw8cRxNV06RyHuvPcvaxXeJ6qM'),
  isTokenAutoRefreshEnabled: true
});

// Authentication
const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn("Firebase local persistence fallback:", err?.message || err);
});

// ========== SAFE FIRESTORE INITIALIZATION ==========
let db;
try {
  // First try to get already initialized instance
  db = getFirestore(app);
} catch (e) {
  // Not initialized yet → initialize with preferred settings
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    }),
    experimentalForceLongPolling: true
  });
}

const storage = getStorage(app);

// OAuth Providers
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

const twitterProvider = new TwitterAuthProvider();
const githubProvider = new GithubAuthProvider();

export { 
  app, 
  appCheck,
  auth, 
  db, 
  storage, 
  googleProvider, 
  twitterProvider, 
  githubProvider 
};
