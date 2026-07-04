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

    // Event listeners (your existing ones)
    document.getElementById('btn-photo')?.addEventListener('click', () => { /* ... */ });
    document.getElementById('btn-voice')?.addEventListener('click', (e) => mediaModule.toggleVoiceRecording(e.currentTarget));
    document.getElementById('postButton')?.addEventListener('click', window.publishTestimony);

    initPhoneCountrySelector();

    // Tier init
    setTimeout(async () => {
        const tier = await getCurrentUserTier();
        applyTierTheme(tier);
        window.currentUserTier = tier;
    }, 800);

    setTimeout(() => window.loadFeed('citizen-talk'), 600);
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
