// js/witnessCycle.js
import { db, auth } from './firebase-config.js';   // Correct relative path
import { doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { showToast } from './utils.js';
import { canAccessFeature } from './tier.js';

export async function startWitnessCycle(userData) {
    if (!canAccessFeature(userData, 'witness_cycle')) {
        showToast("Only True Witnesses can start a Witness Cycle", "error");
        return false;
    }

    try {
        const cycleRef = doc(db, "witnessCycles", Date.now().toString());
        
        await updateDoc(doc(db, "users", userData.uid), {
            activeWitnessCycle: true,
            lastCycleStart: serverTimestamp()
        });

        showToast("🔄 Witness Cycle Activated. You are now attesting in the Square.", "success");
        return true;
    } catch (error) {
        console.error(error);
        showToast("Failed to start Witness Cycle", "error");
        return false;
    }
}

export function getWitnessCycleStatus(userData) {
    return userData.activeWitnessCycle === true 
        ? "Active - Attesting" 
        : "Not Active";
}
