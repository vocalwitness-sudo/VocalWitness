// js/main.js - FINAL CLEAN VERSION with Tier-Aware Composer
import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db, auth, storage } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage } from './i18n.js';
import * as mediaModule from './media.js';
import { CitizenTalkEngine } from '../vocalWitnessEngine.js';
import { initAdminDashboard } from './admin.js';
import { getCurrentUserTier, canAccessFeature, applyTierTheme } from './tier.js';

// Global variables
let engineInstance = null;

// ====================== GLOBAL FUNCTIONS ======================
window.loadFeed = async (feedType) => {
    document.querySelectorAll('#main-nav button').forEach(btn => btn.classList.remove('active'));
    const active = document.querySelector(`button[data-feed="${feedType}"]`);
    if (active) active.classList.add('active');

    console.log(`Switching to feed: ${feedType}`);

    try {
        const tier = await getCurrentUserTier();
        if (feedType === 'live' && !canAccessFeature(tier, 'live_arena')) {
            showToast("🔒 Live Arena is for True Witness only", "error");
            return;
        }
    } catch (e) {
        console.warn("Tier check skipped");
    }

    if (feedType === 'true-witness') {
        showToast("🔒 True Witness Mode", "info");
        initFeed(db, 'citizen-talk');
    } else if (feedType === 'live') {
        showToast("🏟️ Live Arena (coming soon)", "info");
        initFeed(db, 'citizen-talk');
    } else {
        initFeed(db, feedType);
    }
};

window.publishTestimony = async () => {
    const textarea = document.getElementById('mainInput');
    const content = textarea?.value.trim() || "";

    if (!content && !window.selectedImageFile && !engineInstance?.currentAudioBlob) {
        return showToast("Please add text, photo or voice", "error");
    }

    const postBtn = document.getElementById('postButton');
    if (postBtn) {
        postBtn.disabled = true;
        postBtn.textContent = 'Publishing...';
    }

    try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
            showToast("Please sign in to publish", "error");
            return;
        }

        const mediaData = await mediaModule.uploadForensicMedia(currentUser.uid);

        const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js");

        await addDoc(collection(db, "testimonies"), {
            authorId: currentUser.uid,
            author: currentUser.displayName || "Anonymous Witness",
            content: content,
            imageUrl: mediaData.imageUrl || null,
            audioUrl: mediaData.audioUrl || null,
            timestamp: new Date().toISOString(),
            feedVisibility: "citizen-talk"
        });

        showToast("✅ Testimony published!", "success");
        if (textarea) textarea.value = '';
        mediaModule.resetMediaState();
        window.loadFeed('citizen-talk');
    } catch (err) {
        console.error("Publish error:", err);
        showToast("Failed to publish: " + (err.message || "Unknown error"), "error");
    } finally {
        if (postBtn) {
            postBtn.disabled = false;
            postBtn.textContent = '🚀 Publish Testimony to the Square';
        }
    }
};

// ====================== TIER-AWARE COMPOSER ======================
async function updateComposerForTier() {
    const tier = await getCurrentUserTier();
    const btnPhoto = document.getElementById('btn-photo');
    const btnVoice = document.getElementById('btn-voice');
    const postButton = document.getElementById('postButton');

    if (tier === 'true_witness') {
        if (btnPhoto) btnPhoto.innerHTML = '📸 Forensic Shield + Hash + Signature';
        if (btnVoice) btnVoice.innerHTML = '🎤 Forensic Voice + Integrity Proof';
        if (postButton) postButton.innerHTML = '🔒 Publish Verified Testimony';

        // Extra proof option for True Witness
        const extraProof = document.createElement('button');
        extraProof.className = "flex-1 py-4 bg-amber-500 hover:bg-amber-600 text-black rounded-2xl transition-all font-medium";
        extraProof.innerHTML = '🛡️ Generate ZK Proof';
        extraProof.onclick = () => showToast("🧠 ZK Proof generation started (demo)", "success");
        
        const composerActions = document.querySelector('.flex.gap-3.mt-6'); // adjust selector to your buttons container
        if (composerActions) composerActions.appendChild(extraProof);

        showToast("🔬 Full Forensic Mode Activated", "success");
    } 
    else if (tier === 'trust_circle') {
        if (btnPhoto) btnPhoto.innerHTML = '📸 Photo + Verified Shield';
    }
}
// ====================== BOOTSTRAP ======================
async function bootstrap() {
    console.log("🚀 Starting VocalWitness...");

    await initAuth();
    initLanguage();

    // Tier System
    try {
        const tier = await getCurrentUserTier();
        applyTierTheme(tier);
        window.currentUserTier = tier;
        await updateComposerForTier();
    } catch (e) {
        console.warn("Tier initialization skipped");
    }

    engineInstance = new CitizenTalkEngine(db, storage);
    window.engineInstance = engineInstance;
    mediaModule.setEngine(engineInstance);

    attachUIListeners();
    initPhoneCountrySelector();

    setTimeout(() => window.loadFeed('citizen-talk'), 800);
    console.log("✅ VocalWitness initialized");
}

function attachUIListeners() {
    const btnPhoto = document.getElementById('btn-photo');
    if (btnPhoto) {
        btnPhoto.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = (e) => mediaModule.handleImageSelect(e, document.getElementById('preview-area'));
            input.click();
        });
    }

    const btnVoice = document.getElementById('btn-voice');
    if (btnVoice) {
        btnVoice.addEventListener('click', (e) => mediaModule.toggleVoiceRecording(e.currentTarget));
    }

    const postButton = document.getElementById('postButton');
    if (postButton) {
        postButton.addEventListener('click', window.publishTestimony);
    }
}

function initPhoneCountrySelector() {
    console.log("📱 Phone selector initialized");
    // Add country codes later
}

document.addEventListener('DOMContentLoaded', bootstrap);
