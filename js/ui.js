// js/ui.js - Global UI & Auth State Manager
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { auth } from './firebase-config.js';
import { refreshTierAndUI } from './tier.js';

/**
 * Initialize core UI state & listen for Auth changes
 */
export function initUI() {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            console.log("👤 User authenticated:", user.uid);
        } else {
            console.log("👤 Guest mode / Unauthenticated");
        }
        // Refresh tier themes and badge elements whenever auth state resolves
        refreshTierAndUI();
    });
}

// Auto-run UI setup on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUI);
} else {
    initUI();
}
