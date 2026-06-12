// js/signup.js
import { state } from './store.js';
import { showToast } from './utils.js';

export async function upgradeToWitnessTier() {
    // 1. Check if user is even logged in
    if (!state.user) return showToast("Please sign in first.");

    // 2. Trigger the ZK Worker process
    showToast("Initializing Forensic Verification...");
    
    // Send message to the worker you created earlier
    window.zkWorker.postMessage({ 
        type: 'VERIFY_IDENTITY', 
        uid: state.user.uid 
    });

    // 3. Listen for success
    window.zkWorker.onmessage = (e) => {
        if (e.data.success) {
            state.isVerified = true;
            state.tier = 'witness';
            showToast("✅ Forensic Identity Verified. Tier 1 Access Granted.");
            // Refresh feed to show new options
            location.reload(); 
        }
    };
}
