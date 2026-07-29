// js/ui.js - Global UI & Auth State Manager
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { auth } from './firebase-config.js';
import { refreshTierAndUI } from './tier.js';

/**
 * Initialize button active/select indicator state management
 */
function setupButtonIndicators() {
    document.addEventListener('click', (e) => {
        const targetBtn = e.target.closest('.filter-chip, .tab-btn, .nav-btn, .tier-filter-btn');
        if (!targetBtn) return;

        // Scope the toggle within its container or navigation parent
        const container = targetBtn.parentElement;
        if (container) {
            container.querySelectorAll('.active, [aria-selected="true"]').forEach(el => {
                el.classList.remove('active');
                el.setAttribute('aria-selected', 'false');
            });
        }

        // Apply active states to the target button
        targetBtn.classList.add('active');
        targetBtn.setAttribute('aria-selected', 'true');
    });
}

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

    // Initialize button selection behavior
    setupButtonIndicators();
}

// Auto-run UI setup on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUI);
} else {
    initUI();
}
