// js/witnessCycle.js
import { db, auth } from './firebase-config.js';
import { doc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { showToast } from './utils.js';
import { canAccessFeature } from './tier.js';

export async function startWitnessCycle() {
    const user = auth.currentUser;

    if (!user) {
        showToast("Sign in required", "error");
        return false;
    }

    try {
        // Await the async permission check based on user tier/role
        const allowed = await canAccessFeature('witness_circle');
        if (!allowed) {
            showToast("Only True Witnesses can start a Witness Cycle", "error");
            return false;
        }

        const cycleId = Date.now().toString();
        const cycleRef = doc(db, "witnessCycles", cycleId);
        const userRef = doc(db, "users", user.uid);

        // Use a Firestore Batch to make the writes atomic
        const batch = writeBatch(db);

        // 1. Create entry in witnessCycles
        batch.set(cycleRef, {
            witnessId: user.uid,
            status: "active",
            createdAt: serverTimestamp()
        });

        // 2. Merge active state into the user's profile
        batch.set(userRef, {
            activeWitnessCycle: true,
            lastCycleStart: serverTimestamp()
        }, { merge: true });

        // Commit both writes together
        await batch.commit();

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
