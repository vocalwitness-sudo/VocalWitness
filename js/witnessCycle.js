// js/witnessCycle.js
import { db, auth } from './firebase-config.js';
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { showToast } from './utils.js';
import { canAccessFeature } from './tier.js';

export async function startWitnessCycle() {
    if (!auth.currentUser) {
        showToast("Sign in required", "error");
        return false;
    }

    try {
        // Force refresh user token to ensure Firestore sees updated claims/roles
        await auth.currentUser.getIdToken(true);

        // Await the async permission check
        const allowed = await canAccessFeature('witness_circle');
        if (!allowed) {
            showToast("Only True Witnesses can start a Witness Cycle", "error");
            return false;
        }

        const cycleId = Date.now().toString();
        const cycleRef = doc(db, "witnessCycles", cycleId);
        
        // Write to witnessCycles
        await setDoc(cycleRef, {
            witnessId: auth.currentUser.uid,
            status: "active",
            createdAt: serverTimestamp()
        });
        
        // Merge state into user profile
        const userRef = doc(db, "users", auth.currentUser.uid);
        await setDoc(userRef, {
            activeWitnessCycle: true,
            lastCycleStart: serverTimestamp()
        }, { merge: true });

        showToast("🔄 Witness Cycle Activated. You are now attesting in the Square.", "success");
        return true;
    } catch (error) {
        console.error("Witness Cycle Error:", error);
        
        if (error.code === 'permission-denied') {
            showToast("⚠️ Security rule blocked this action. Check Firestore rules.", "error");
        } else {
            showToast("Failed to start Witness Cycle", "error");
        }
        return false;
    }
}

export function getWitnessCycleStatus(userData) {
    if (!userData) return "Not Active";
    return userData.activeWitnessCycle === true 
        ? "Active - Attesting" 
        : "Not Active";
}
