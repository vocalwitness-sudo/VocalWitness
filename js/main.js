// js/main.js - Fixed & Integrated Version
import './app-state.js';
import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db, auth } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage } from './i18n.js';
import * as mediaModule from './media.js';
import { CitizenTalkEngine } from '../vocalWitnessEngine.js';
import { initProfile } from './profile.js';
import { db, auth, storage } from './firebase-config.js';

// Global State (from app-state.js)
import { AppState, updateAppState } from './app-state.js';

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
    showToast("More menu (Groups, About, Privacy...) — coming soon", "info");
};

// ====================== PUBLISH ======================
window.publishTestimony = async () => {
    const textarea = document.getElementById('mainInput');
    const content = textarea?.value.trim() || "";

    if (!content && !mediaModule.selectedImageFile && !engineInstance?.currentAudioBlob) {
        return showToast("Add text, photo, or voice", "error");
    }

    const postBtn = document.getElementById('postButton');
    postBtn.disabled = true;
    postBtn.textContent = 'Publishing...';

    try {
        const mediaData = await mediaModule.uploadForensicMedia();
        // TODO: Add full Firestore write here later
        await window.recordTestimonyContribution?.();
        showToast("✅ Published to the Square!", "success");
        textarea.value = '';
        mediaModule.resetMediaState();
        loadDynamicFeed(AppState.currentTab);
    } catch (err) {
        console.error(err);
        showToast("Publish failed", "error");
    } finally {
        postBtn.disabled = false;
        postBtn.textContent = 'Publish to the Square';
    }
};

// ====================== BOOTSTRAP ======================
async function bootstrap() {
    try {
        await initAuth();
        initLanguage();
        initProfile();

        engineInstance = new CitizenTalkEngine(db, storage);
        window.engineInstance = engineInstance;
        mediaModule.setEngine(engineInstance);

        // Setup event listeners
        document.getElementById('btn-photo')?.addEventListener('click', (e) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = (ev) => mediaModule.handleImageSelect(ev, document.getElementById('preview-area'));
            input.click();
        });

        document.getElementById('btn-voice')?.addEventListener('click', (e) => {
            mediaModule.toggleVoiceRecording(e.currentTarget);
        });

        document.getElementById('postButton')?.addEventListener('click', window.publishTestimony);

        // Load default tab
        setTimeout(() => window.switchTab('square'), 800);

        console.log("✅ VocalWitness Live Ready");
    } catch (e) {
        console.error("Bootstrap failed:", e);
    }
}
