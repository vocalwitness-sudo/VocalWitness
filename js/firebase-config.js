// js/firebase-config.js
// World-class Firebase initialization for VocalWitness
// - App Check (reCAPTCHA Enterprise) kept and made non-blocking
// - Optimized for African mobile networks (MTN, Airtel, Glo…)
// - Fail-open design: one service failing does not kill the app
// - Clear logging + production hardening

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
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app-check.js";

/* ------------------------------------------------------------------ */
/* 1. Config                                                          */
/* ------------------------------------------------------------------ */
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

/* ------------------------------------------------------------------ */
/* 2. App singleton                                                   */
/* ------------------------------------------------------------------ */
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

/* ------------------------------------------------------------------ */
/* 3. App Check – KEEP Enterprise, but make it safe                   */
/* ------------------------------------------------------------------ */
let appCheck = null;

try {
  // Optional: enable debug token on localhost / preview (never in production)
  if (location.hostname === "localhost" || location.hostname.includes("web.app")) {
    // self.FIREBASE_APPCHECK_DEBUG_TOKEN = true; // uncomment only while debugging
  }

  appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider("6LdT0tktAAAAABiw8cRxNV06RyHuvPcvaxXeJ6qM"),
    isTokenAutoRefreshEnabled: true
  });

  console.log("[firebase-config] App Check (reCAPTCHA Enterprise) initialized");
} catch (err) {
  // Critical: never let App Check crash the whole module
  console.warn(
    "[firebase-config] App Check failed – continuing without it (fail-open):",
    err?.message || err
  );
  appCheck = null;
}

/* ------------------------------------------------------------------ */
/* 4. Auth                                                            */
/* ------------------------------------------------------------------ */
const auth = getAuth(app);

setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn("[firebase-config] Persistence fallback:", err?.message || err);
});

/* ------------------------------------------------------------------ */
/* 5. Firestore – best settings for mobile + offline                  */
/* ------------------------------------------------------------------ */
let db;

try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
      // Optional: limit cache size (in bytes). 40 MB is a good balance.
      // cacheSizeBytes: 40 * 1024 * 1024
    }),
    // Prefer auto-detect (modern best practice) over force
    experimentalAutoDetectLongPolling: true
    // Keep force only if you still see WebChannel problems on specific networks:
    // experimentalForceLongPolling: true
  });
  console.log("[firebase-config] Firestore ready (persistent + auto long-polling)");
} catch (e) {
  console.warn("[firebase-config] Firestore already initialized, reusing instance");
  db = getFirestore(app);
}

/* ------------------------------------------------------------------ */
/* 6. Storage + Providers                                             */
/* ------------------------------------------------------------------ */
const storage = getStorage(app);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
googleProvider.addScope("profile");
googleProvider.addScope("email");

const twitterProvider = new TwitterAuthProvider();
const githubProvider = new GithubAuthProvider();
githubProvider.addScope("read:user");

/* ------------------------------------------------------------------ */
/* 7. Exports                                                         */
/* ------------------------------------------------------------------ */
export {
  app,
  appCheck,          // can be null if it failed – callers must tolerate this
  auth,
  db,
  storage,
  googleProvider,
  twitterProvider,
  githubProvider
};
