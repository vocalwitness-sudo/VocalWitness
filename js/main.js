import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db, auth, storage } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage } from './i18n.js';
import * as mediaModule from './media.js';
import { CitizenTalkEngine } from '../vocalWitnessEngine.js';
import { initAdminDashboard } from './admin.js';
import { getCurrentUserTier, applyTierTheme, canAccessFeature, escalatePost } from './tier.js';

// Global variables
let engineInstance = null;

// ====================== GLOBAL FUNCTIONS ======================
window.loadFeed = (feedType) => {
    document.querySelectorAll('#main-nav button').forEach(btn => btn.classList.remove('active'));
    const active = document.querySelector(`button[data-feed="${feedType}"]`);
    if (active) active.classList.add('active');

    console.log(`Switching to feed: ${feedType}`);

    if (feedType === 'true-witness') {
        showToast("🔒 True Witness Mode (ZK Verified)", "info");
        initFeed(db, 'citizen-talk');
    } else if (feedType === 'live') {
        showToast("🏟️ Live Arena (coming soon)", "info");
        initFeed(db, 'citizen-talk');
    } else {
        initFeed(db, feedType);
    }
};

window.publishTestimony = async () => { /* your existing code */ };

// ====================== BOOTSTRAP ======================
async function bootstrap() {
    await initAuth();
    initLanguage();

    engineInstance = new CitizenTalkEngine(db, storage);
    window.engineInstance = engineInstance;
    mediaModule.setEngine(engineInstance);

    // Strong attachment
    const attachListeners = () => {
    console.log("Trying to attach button listeners...");

    // Photo
    let btnPhoto = document.getElementById('btn-photo');
    if (btnPhoto) {
        const clone = btnPhoto.cloneNode(true);
        btnPhoto.parentNode.replaceChild(clone, btnPhoto);
        clone.addEventListener('click', () => {
            console.log("Photo button clicked");
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = (e) => mediaModule.handleImageSelect(e, document.getElementById('preview-area'));
            input.click();
        });
    }

    // Voice
    let btnVoice = document.getElementById('btn-voice');
    if (btnVoice) {
        const clone = btnVoice.cloneNode(true);
        btnVoice.parentNode.replaceChild(clone, btnVoice);
        clone.addEventListener('click', (e) => {
            console.log("Voice button clicked");
            mediaModule.toggleVoiceRecording(e.currentTarget);
        });
    }

    // Publish
    let postButton = document.getElementById('postButton');
    if (postButton) {
        const clone = postButton.cloneNode(true);
        postButton.parentNode.replaceChild(clone, postButton);
        clone.addEventListener('click', () => {
            console.log("Publish button clicked");
            window.publishTestimony();
        });
    }

    console.log("✅ Listeners attached cleanly");
};

    // Attach multiple times to be sure
    attachListeners();
    setTimeout(attachListeners, 800);
    setTimeout(attachListeners, 1500);

    initPhoneCountrySelector();
    setTimeout(() => window.loadFeed('citizen-talk'), 1000);
}
// ====================== GLOBAL EXPORTS ======================
window.loadFeed = loadFeed;
window.publishTestimony = publishTestimony;
window.getCurrentUserTier = getCurrentUserTier;
window.canAccessFeature = canAccessFeature;
window.escalatePost = escalatePost;
window.applyTierTheme = applyTierTheme;

// Phone selector (your existing)
const countryCodes = [ /* your array */ ];
function initPhoneCountrySelector() { /* your existing */ }

document.addEventListener('DOMContentLoaded', bootstrap);
console.log("✅ VocalWitness main.js loaded successfully");
