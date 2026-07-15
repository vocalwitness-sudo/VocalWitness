import './app-state.js';
import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db, auth, storage } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage } from './i18n.js';
import * as mediaModule from './media.js';
import { CitizenTalkEngine } from '../vocalWitnessEngine.js';
import { initProfile } from './profile.js';
import { initOnboarding } from './onboarding.js';
import { loadDynamicNavigation } from './navigation.js';
import { applyTierTheme, updateTierBadge } from './tier.js';
import { AppState } from './app-state.js';

let engineInstance = null;

// ====================== TAB SWITCHING ======================
window.switchTab = (tab) => {
    document.querySelectorAll('#main-nav button').forEach(btn => {
        btn.classList.remove('active', 'bg-amber-900', 'text-amber-300');
        if (btn.dataset.tab === tab) {
            btn.classList.add('active');
            if (tab === 'witness') btn.classList.add('bg-amber-900', 'text-amber-300');
        }
    });
    AppState.currentTab = tab;
    if (tab === 'witness') {
        AppState.currentMode = 'witness';
    } else {
        AppState.currentMode = 'citizen';
    }
    if (tab === 'more') {
        showMoreMenu();
        return;
    }
    loadDynamicFeed(tab);
};

function loadDynamicFeed(tab) {
    let feedType = 'citizen-talk';
    if (tab === 'ledger') feedType = 'ledger';
    else if (tab === 'arena') feedType = 'live';
    else if (tab === 'mycircle') feedType = 'my-testimonies';
    else if (tab === 'witness') feedType = 'true-witness';
    initFeed(db, feedType);
}

window.showMoreMenu = () => {
    alert("More menu - coming soon");
};

// ====================== GLOBAL MODAL FUNCTIONS ======================
window.showProfile = () => {
    document.getElementById('profileModal').classList.remove('hidden');
};

window.closeProfile = () => {
    document.getElementById('profileModal').classList.add('hidden');
};

window.editProfile = () => {
    // You can expand this later
    alert("Edit Profile opened - connect your edit modal here");
};

window.logout = () => {
    // Add your logout logic
    if (confirm("Logout?")) {
        alert("Logged out (add real logic)");
    }
};

// ====================== BOOTSTRAP ======================
async function bootstrap() {
    try {
        await initAuth();
        initLanguage();
        initProfile();
        initOnboarding?.();
        loadDynamicNavigation?.();
        
        engineInstance = new CitizenTalkEngine(db, storage);
        window.engineInstance = engineInstance;
        
        if (mediaModule.setEngine) mediaModule.setEngine(engineInstance);
        if (typeof applyTierTheme === 'function') applyTierTheme();
        if (typeof updateTierBadge === 'function') updateTierBadge();
        
        setupEventListeners();
        
        setTimeout(() => window.switchTab('square'), 600);
        
        console.log("✅ VocalWitness Live Ready");
    } catch (e) {
        console.error("Bootstrap failed:", e);
    }
}

function setupEventListeners() {
    // Nav Tabs
    document.querySelectorAll('#main-nav button[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => window.switchTab(btn.dataset.tab));
    });

    // Profile Button
    const profileBtn = document.getElementById('profile-btn');
    if (profileBtn) {
        profileBtn.addEventListener('click', window.showProfile);
    }

    // Support Button
    const supportBtn = document.getElementById('support-btn');
    if (supportBtn) {
        supportBtn.addEventListener('click', () => {
            document.getElementById('supportModal')?.classList.remove('hidden');
        });
    }

    // Post Button (basic)
    const postBtn = document.getElementById('postButton');
    if (postBtn) {
        postBtn.addEventListener('click', () => {
            showToast("Publishing... (connect full logic)", "info");
        });
    }
}

document.addEventListener('DOMContentLoaded', bootstrap);
