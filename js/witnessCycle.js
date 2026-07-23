// js/witnessCycle.js
import { db, auth } from './firebase-config.js';   // Correct relative path
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { showToast } from './utils.js';
import { canAccessFeature } from './tier.js';

export async function startWitnessCycle() {
    if (!auth.currentUser) {
        showToast("Sign in required", "error");
        return false;
    }

    // Await the async permission check
    const allowed = await canAccessFeature('witness_circle');
    if (!allowed) {
        showToast("Only True Witnesses can start a Witness Cycle", "error");
        return false;
    }

    try {
        const cycleId = Date.now().toString();
        const cycleRef = doc(db, "witnessCycles", cycleId);
        
        // Use setDoc for new documents to prevent missing document errors
        await setDoc(cycleRef, {
            witnessId: auth.currentUser.uid,
            status: "active",
            createdAt: serverTimestamp()
        });
        
        const userRef = doc(db, "users", auth.currentUser.uid);
        await setDoc(userRef, {
            activeWitnessCycle: true,
            lastCycleStart: serverTimestamp()
        }, { merge: true });

        showToast("🔄 Witness Cycle Activated. You are now attesting in the Square.", "success");
        return true;
    } catch (error) {
        console.error(error);
        showToast("Failed to start Witness Cycle", "error");
        return false;
    }
}

export function getWitnessCycleStatus(userData) {
    if (!userData) return "Not Active";
    return userData.activeWitnessCycle === true 
        ? "Active - Attesting" 
        : "Not Active";
}
