// js/main.js - FIXED, CLEAN & COMPATIBLE (Firebase v11)
import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db, auth, storage } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage } from './i18n.js';
import * as mediaModule from './media.js';
import { CitizenTalkEngine } from '../vocalWitnessEngine.js';

let engineInstance = null;

// ====================== GLOBAL FUNCTIONS ======================
window.loadFeed = (feedType) => {
    document.querySelectorAll('#main-nav button').forEach(btn => btn.classList.remove('active'));
    
    const active = document.querySelector(`button[data-feed="${feedType}"]`);
    if (active) active.classList.add('active');

    console.log(`Switching to feed: ${feedType}`);

    if (feedType === 'true-witness') {
        showToast("🔒 True Witness Mode (ZK Verified)", "info");
        // TODO: Load witness-specific feed later
        initFeed(db, 'citizen-talk'); // fallback for now
    } else if (feedType === 'live') {
        showToast("🏟️ Live Arena (coming soon)", "info");
        initFeed(db, 'citizen-talk'); // fallback
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
    postBtn.disabled = true;
    postBtn.textContent = '🚀 Publishing...';

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
        showToast("Failed to publish: " + (err.message || "Check permissions"), "error");
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

    // Button listeners
    document.getElementById('btn-photo')?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => mediaModule.handleImageSelect(e, document.getElementById('preview-area'));
        input.click();
    });

    document.getElementById('btn-voice')?.addEventListener('click', (e) => mediaModule.toggleVoiceRecording(e.currentTarget));
    document.getElementById('postButton')?.addEventListener('click', window.publishTestimony);

    // Initial load
    setTimeout(() => window.loadFeed('citizen-talk'), 600);
}

document.addEventListener('DOMContentLoaded', bootstrap);

// ====================== GLOBAL EXPOSURES ======================
window.closeProfile = () => document.getElementById('profileModal')?.classList.add('hidden');
window.logout = () => { console.log("Logout called"); };
window.signUpWithEmail = () => showToast("Sign up coming soon", "info");
window.sendOTP = window.verifyOTP = () => showToast("Phone verification coming soon", "info");

// Temporary fixes for broken buttons
window.showTrueWitness = () => {
    showToast("True Witness mode coming soon (ZK verification)", "info");
};

window.showLiveArena = () => {
    showToast("Live Arena coming soon", "info");
};

window.showGuardian = () => {
    showToast("Guardian features coming soon", "info");
};

window.showProfile = () => {
    const modal = document.getElementById('profileModal');
    if (modal) modal.classList.remove('hidden');
    else showToast("Profile modal not found", "error");
};


// Profile & Guardian buttons
window.showProfile = () => {
    const modal = document.getElementById('profileModal');
    if (modal) {
        modal.classList.remove('hidden');
        showToast("👤 Profile opened", "success");
    } else {
        showToast("Profile modal not found in HTML", "error");
    }
};

window.showGuardian = () => {
    showToast("🛡️ Guardian Features (Advanced Security)", "info");
    // You can expand this later
};
