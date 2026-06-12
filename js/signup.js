// js/signup.js
import { state } from './storage.js'; // Updated path
import { showToast } from './utils.js';

export async function upgradeToWitnessTier() {
    // 1. Check if user is even logged in
    if (!state.user) return showToast("Please sign in first.");

    // 2. Trigger the ZK Worker process
    showToast("Initializing Forensic Verification...");
    
    // Send message to the worker
    window.zkWorker.postMessage({ 
        type: 'VERIFY_IDENTITY', 
        uid: state.user.uid 
    });

    // 3. Listen for success
    window.zkWorker.onmessage = (e) => {
        if (e.data.success) {
            // Updated to match the property in storage.js
            state.isWitnessVerified = true; 
            state.tier = 'witness';
            showToast("✅ Forensic Identity Verified. Tier 1 Access Granted.");
            // Refresh feed to show new options
            location.reload(); 
        }
    };
}
