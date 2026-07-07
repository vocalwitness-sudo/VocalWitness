// js/main.js - CLEAN VERSION (No Payment Code)
import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db, auth, storage } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage } from './i18n.js';
import * as mediaModule from './media.js';
import { CitizenTalkEngine } from '../vocalWitnessEngine.js';

let engineInstance = null;
let profileUnsubscribe = null;
let isAnonymous = false;

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

window.closeProfile = () => {
    document.getElementById('profileModal').classList.add('hidden');
};

window.showProfile = () => {
    document.getElementById('profileModal').classList.remove('hidden');
    // Load real user data here later
};

window.editProfile = () => alert("Edit profile coming soon");
window.showSecurityPanel = () => alert("Security settings coming soon");
window.toggleAnonymous = () => {
    // Toggle logic here
    showToast("Anonymous mode toggled", "success");
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

    // Event listeners
    document.getElementById('btn-photo')?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => mediaModule.handleImageSelect(e, document.getElementById('preview-area'));
        input.click();
    });

    document.getElementById('btn-voice')?.addEventListener('click', (e) => mediaModule.toggleVoiceRecording(e.currentTarget));
    document.getElementById('postButton')?.addEventListener('click', window.publishTestimony);

    setTimeout(() => window.loadFeed('citizen-talk'), 600);
}

document.addEventListener('DOMContentLoaded', bootstrap);

// ====================== PROFILE & GLOBAL FEATURES ======================
window.closeProfile = () => {
    const modal = document.getElementById('profileModal');
    if (modal) modal.classList.add('hidden');
};

window.showProfile = () => {
    const modal = document.getElementById('profileModal');
    if (modal) modal.classList.remove('hidden');
};

window.logout = () => { 
    console.log("Logout called"); 
};

window.showGuardian = () => {
    const guardianModal = document.getElementById('guardianModal');
    if (guardianModal) guardianModal.classList.remove('hidden');
};

// Debug
console.log("✅ VocalWitness main.js loaded successfully");
