// js/main.js - Final Clean Version
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
        showToast("🔐 Witness Circle Mode", "success");
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
    const existing = document.getElementById('more-dropdown');
    if (existing) existing.remove();

    const dropdown = document.createElement('div');
    dropdown.id = 'more-dropdown';
    dropdown.className = 'fixed top-20 right-6 glass rounded-3xl shadow-2xl w-64 py-2 z-[150] border border-zinc-700';
    
    dropdown.innerHTML = `
        <div class="py-1">
            <a href="groups.html" class="flex items-center gap-3 px-6 py-3 hover:bg-zinc-800 text-white">👥 Groups</a>
            <a href="my-testimonies.html" class="flex items-center gap-3 px-6 py-3 hover:bg-zinc-800 text-white">📜 My Testimonies</a>
            <a href="about.html" class="flex items-center gap-3 px-6 py-3 hover:bg-zinc-800 text-white">ℹ️ About Us</a>
            <a href="privacy.html" class="flex items-center gap-3 px-6 py-3 hover:bg-zinc-800 text-white">🔒 Privacy</a>
            <a href="safety.html" class="flex items-center gap-3 px-6 py-3 hover:bg-zinc-800 text-white">🛡️ Safety</a>
            <a href="terms.html" class="flex items-center gap-3 px-6 py-3 hover:bg-zinc-800 text-white">📄 Terms</a>
        </div>
    `;
    document.body.appendChild(dropdown);

    setTimeout(() => {
        const closeHandler = (e) => {
            if (!dropdown.contains(e.target)) {
                dropdown.remove();
                document.removeEventListener('click', closeHandler);
            }
        };
        document.addEventListener('click', closeHandler);
    }, 100);
};

// ====================== PUBLISH ======================
window.publishTestimony = async () => { /* ... your existing code ... */ };

// ====================== SUPPORT ======================
function initSupportButton() { /* ... your existing code ... */ }

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
        showToast("Failed to initialize app. Please refresh.", "error");
    }
}

function setupEventListeners() {
    // Photo, Voice, Publish, Nav Tabs, Language, Support (your fixed version)
    // ... (keep the version I gave you earlier)
}

document.addEventListener('DOMContentLoaded', bootstrap);
