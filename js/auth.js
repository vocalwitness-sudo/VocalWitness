import { auth, provider, db } from './firebase-config.js';
import { signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { showToast } from "./utils.js";
import { getCurrentUserTier } from './tier.js';
async function syncUserToFirestore(user) {
    if (!user) return;

    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    const baseData = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || user.email?.split('@')[0] || "Citizen",
        username: (user.email?.split('@')[0] || `user_${Date.now()}`).toLowerCase(),
        photoURL: user.photoURL || "",
        role: "citizen",
        tier: "citizen",
        trustCircle: 50,
        reputationScore: 50,
        level: 1,
        bio: "",
        preferredLanguage: "en",
        isPhoneVerified: false,
        phoneNumber: "",
        zkVerified: false,
        testimoniesCount: 0,
        verificationsMade: 0,
        endorsementsReceived: 0,
        successfulEvidence: 0,
        debunkedEvidence: 0,
        badges: ["new_citizen"],
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
    };

    // Safe tier assignment
    try {
        baseData.tier = await getCurrentUserTier();
    } catch (e) {
        baseData.tier = "citizen";
    }

    if (!userSnap.exists()) {
        await setDoc(userRef, baseData);
        showToast("Welcome to VocalWitness! 🎉", "success");
    } else {
        await setDoc(userRef, {
            lastUpdated: new Date().toISOString(),
            lastLogin: new Date().toISOString()
        }, { merge: true });
    }
}
export function initAuth() { /* your existing initAuth with onAuthStateChanged */ }

export async function googleLogin() { /* existing */ }
export async function logout() { /* existing */ }

window.googleLogin = googleLogin;
window.logout = logout;
