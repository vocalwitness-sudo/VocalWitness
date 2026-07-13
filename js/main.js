// js/main.js - Dynamic Living Square Version
import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db, auth } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage } from './i18n.js';
import * as mediaModule from './media.js';
import { CitizenTalkEngine } from '../vocalWitnessEngine.js';

// ====================== APP STATE ======================
export let AppState = {
    currentTab: 'square',
    userTier: 'NONE',           // NONE, CITIZEN, WITNESS
    currentMode: 'citizen',     // citizen or witness
    isAuthenticated: false
};

export function updateAppState(newState) {
    Object.assign(AppState, newState);
    window.dispatchEvent(new CustomEvent('appStateChanged', { detail: AppState }));
}

// ====================== TAB SWITCHING (Dynamic Core) ======================
window.switchTab = (tab) => {
    // Update active tab UI
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
        showToast("🔐 Entering Witness Circle", "success");
    } else {
        AppState.currentMode = 'citizen';
    }

    if (tab === 'more') {
        showMoreMenu();
        return;
    }

    loadDynamicFeed(tab);
};

window.showMoreMenu = () => {
    showToast("More menu (Groups, About, Privacy, etc.) — coming in next update", "info");
    // Future: Open a modal or dropdown with links to about.html, groups.html, etc.
};


// ====================== DYNAMIC FEED LOADER ======================
function loadDynamicFeed(tab) {
    const container = document.getElementById('feedContainer');
    if (!container) return;

    let feedType = 'citizen-talk';

    switch(tab) {
        case 'square':
            feedType = 'citizen-talk';
            break;
        case 'ledger':
            feedType = 'forensic-ledger';
            break;
        case 'arena':
            feedType = 'live';
            showToast("🏟️ Live Arena — Real-time coming soon", "info");
            break;
        case 'mycircle':
            feedType = 'my-testimonies';
            break;
        case 'witness':
            feedType = 'true-witness';
            break;
    }

    initFeed(db, feedType);
}

// ====================== PUBLISH ======================
window.publishTestimony = async () => {
    const textarea = document.getElementById('mainInput');
    const content = textarea?.value.trim() || "";

    if (!content) {
        return showToast("Please share something meaningful", "error");
    }

    const postBtn = document.getElementById('postButton');
    postBtn.disabled = true;
    postBtn.textContent = 'Publishing to the Square...';

    try {
        // TODO: Integrate full media + Firebase write
        await window.recordTestimonyContribution?.();
        showToast("✅ Testimony published successfully!", "success");
        textarea.value = '';
        // Refresh feed
        loadDynamicFeed(AppState.currentTab);
    } catch (err) {
        console.error(err);
        showToast("Failed to publish. Please try again.", "error");
    } finally {
        postBtn.disabled = false;
        postBtn.textContent = 'Publish to the Square';
    }
};

// ====================== MEDIA BUTTONS ======================
function setupMediaButtons() {
    document.getElementById('btn-photo')?.addEventListener('click', () => {
        showToast("📸 Forensic Photo upload — opening...", "info");
        // mediaModule.handleImageSelect...
    });
    case 'square':
    feedType = 'citizen-talk';
    break;

    document.getElementById('btn-voice')?.addEventListener('click', () => {
        showToast("🎤 Voice Testimony — recording...", "info");
        // mediaModule.toggleVoiceRecording...
    });
}

// ====================== BOOTSTRAP ======================
async function bootstrap() {
    try {
        await initAuth();
        initLanguage();

        const engineInstance = new CitizenTalkEngine(db, storage || null);
        window.engineInstance = engineInstance;

        // Setup listeners
        setupMediaButtons();
        document.getElementById('postButton')?.addEventListener('click', window.publishTestimony);

        // Default load
        setTimeout(() => {
            window.switchTab('square');
        }, 600);

        console.log("✅ VocalWitness — The Living Square initialized");
    } catch (e) {
        console.error("Bootstrap error:", e);
        showToast("Failed to initialize. Please refresh.", "error");
    }
}

document.addEventListener('DOMContentLoaded', bootstrap);

// Global stubs for backward compatibility
window.loadFeed = (type) => window.switchTab(type || 'square');
window.navigateToPage = (page) => window.location.href = page;
