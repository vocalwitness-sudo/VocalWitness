// js/main.js - WITH DOM MUTATION OBSERVER
import { initAuth, getCurrentUser, googleLogin as authGoogleLogin } from "./auth.js";
import { initFeed } from './feed.js';
import { db, storage } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage } from './i18n.js';
import { handleImageSelect, toggleVoiceRecording, uploadForensicMedia, resetMediaState } from './media.js';
import { CitizenTalkEngine } from '../vocalWitnessEngine.js';
import { collection, addDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

let engineInstance = null;
let currentUser = null;
let mutationObserver = null;

// Safe DOM selector
function safeGetElement(id) {
    const el = document.getElementById(id);
    if (!el) console.warn(`Element "${id}" not found`);
    return el;
}

// ====================== ENGINE ======================
function initEngine() {
    if (!engineInstance) {
        engineInstance = new CitizenTalkEngine(db, storage);
        window.engineInstance = engineInstance;
        import('./media.js').then(m => m.setEngine?.(engineInstance));
    }
}

// ====================== FEED ======================
window.loadFeed = (feedType) => {
    console.log("🔄 Loading feed:", feedType);
    try {
        document.querySelectorAll('#main-nav button[data-feed]').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.querySelector(`button[data-feed="${feedType}"]`);
        if (activeBtn) activeBtn.classList.add('active');
        initFeed(db, feedType);
    } catch (err) {
        console.error("Feed error:", err);
    }
};

// ====================== PUBLISH ======================
window.publishTestimony = async () => { /* your existing publish code */ };

// ====================== DYNAMIC AUTH UI ======================
function updateAuthUI(user) {
    const container = safeGetElement('auth-button-container');
    if (!container) return;
    // ... same as before
}

// ====================== ATTACH LISTENERS ======================
function attachUIListeners() {
    console.log("👂 Attaching UI Listeners");

    safeGetElement('btn-profile')?.addEventListener('click', () => window.showProfileSection());
    safeGetElement('btn-guardian')?.addEventListener('click', () => safeGetElement('guardianModal')?.classList.remove('hidden'));
    safeGetElement('btn-close-guardian')?.addEventListener('click', () => safeGetElement('guardianModal')?.classList.add('hidden'));

    const photoBtn = safeGetElement('btn-photo');
    if (photoBtn) {
        photoBtn.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = (e) => handleImageSelect(e, safeGetElement('preview-area'));
            input.click();
        });
    }

    const voiceBtn = safeGetElement('btn-voice');
    if (voiceBtn) voiceBtn.addEventListener('click', (e) => toggleVoiceRecording(e.currentTarget));

    safeGetElement('postButton')?.addEventListener('click', window.publishTestimony);
}

// ====================== MUTATION OBSERVER ======================
function startMutationObserver() {
    if (mutationObserver) return;

    mutationObserver = new MutationObserver((mutations) => {
        let shouldReattach = false;
        mutations.forEach(mutation => {
            if (mutation.addedNodes.length > 0) shouldReattach = true;
        });

        if (shouldReattach) {
            console.log("🔄 DOM changed → Re-attaching listeners");
            attachUIListeners();
        }
    });

    mutationObserver.observe(document.body, { 
        childList: true, 
        subtree: true 
    });

    console.log("👀 Mutation Observer Started");
}

// ====================== BOOTSTRAP ======================
async function bootstrap() {
    console.log("🚀 Initializing VocalWitness...");
    try {
        await initAuth();
        currentUser = getCurrentUser();
        updateAuthUI(currentUser);

        initLanguage();
        initEngine();
        attachUIListeners();
        startMutationObserver();   // ← Key addition

        setTimeout(() => window.loadFeed('citizen-talk'), 800);
        console.log("✅ VocalWitness Loaded Successfully");
    } catch (e) {
        console.error("Bootstrap error:", e);
    }
}

document.addEventListener('DOMContentLoaded', bootstrap);

// ====================== GLOBAL HELPERS ======================
window.showProfileSection = () => safeGetElement('profileModal')?.classList.remove('hidden');
window.closeProfile = () => safeGetElement('profileModal')?.classList.add('hidden');
window.googleLogin = () => authGoogleLogin();
window.loadFeed = window.loadFeed;
