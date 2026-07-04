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

window.publishTestimony = async () => {
    console.log("=== PUBLISH STARTED ===");

    const textarea = document.getElementById('mainInput');
    const content = textarea?.value.trim() || "";

    if (!content) {
        console.log("No content");
        return showToast("Please add text", "error");
    }

    const postBtn = document.getElementById('postButton');
    postBtn.disabled = true;
    postBtn.textContent = 'Publishing...';

    try {
        const currentUser = auth.currentUser;
        if (!currentUser) throw new Error("No user");

        console.log("User OK, uploading media...");
        const mediaData = await mediaModule.uploadForensicMedia(currentUser.uid);

        console.log("Media OK, saving to DB...");
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

        console.log("=== PUBLISH SUCCESS ===");
        showToast("✅ Testimony published!", "success");

        if (textarea) textarea.value = '';
        mediaModule.resetMediaState();
        window.loadFeed('citizen-talk');

    } catch (err) {
        console.error("=== PUBLISH FAILED ===", err);
        showToast("Failed: " + (err.message || "Check console"), "error");
    } finally {
        postBtn.disabled = false;
        postBtn.textContent = '🚀 Publish Testimony to the Square';
    }
};

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
window.loadFeed = async (feedType) => {
    const tier = await getCurrentUserTier();

    if (feedType === 'live' && !canAccessFeature(tier, 'live_arena')) {
        showToast("🔒 Live Arena is for True Witness (ZK Verified) only", "error");
        return;
    }

    // Original logic
    document.querySelectorAll('#main-nav button').forEach(btn => btn.classList.remove('active'));
    const active = document.querySelector(`button[data-feed="${feedType}"]`);
    if (active) active.classList.add('active');

    console.log(`Switching to feed: ${feedType}`);

    if (feedType === 'true-witness') {
        showToast("🔒 True Witness Mode (ZK Verified)", "info");
        initFeed(db, 'citizen-talk');
    } else if (feedType === 'live') {
        showToast("🏟️ Live Arena", "success");
        initFeed(db, 'citizen-talk'); // or special logic later
    } else {
        initFeed(db, feedType);
    }
};
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

window.publishTestimony = async () => {
    console.log("🚀 publishTestimony started");

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
        console.log("Checking user...");
        const currentUser = auth.currentUser;
        if (!currentUser) {
            showToast("Please sign in to publish", "error");
            return;
        }

        console.log("Uploading media...");
        const mediaData = await mediaModule.uploadForensicMedia(currentUser.uid);

        console.log("Saving to Firestore...");
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
        console.error("❌ Publish error details:", err);
        showToast("Failed to publish: " + (err.message || "Unknown error"), "error");
    } finally {
        if (postBtn) {
            postBtn.disabled = false;
            postBtn.textContent = '🚀 Publish Testimony to the Square';
        }
    }
};

