import { auth, provider, db } from './firebase-config.js';
import { signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { showToast } from "./utils.js";
import { getCurrentUserTier } from './tier.js';

async function syncUserToFirestore(user) {
    if (!user) return;
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    const baseData = { /* your existing baseData */ };

    baseData.tier = getCurrentUserTier ? await getCurrentUserTier() : "citizen";  // safe

    if (!userSnap.exists()) {
        await setDoc(userRef, baseData);
        showToast("Welcome to VocalWitness! 🎉", "success");
    } else {
        await setDoc(userRef, { lastUpdated: new Date().toISOString(), lastLogin: new Date().toISOString() }, { merge: true });
    }
}

export function initAuth() { /* your existing initAuth with onAuthStateChanged */ }

export async function googleLogin() { /* existing */ }
export async function logout() { /* existing */ }

window.googleLogin = googleLogin;
window.logout = logout;
