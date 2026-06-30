// js/main.js - CLEAN FINAL VERSION
import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db, storage } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage } from './i18n.js';
import { handleImageSelect, toggleVoiceRecording, uploadForensicMedia, resetMediaState } from './media.js';
import { CitizenTalkEngine } from '../vocalWitnessEngine.js';
import { collection, addDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

let engineInstance = null;
let currentUser = null;

// ====================== ENGINE ======================
function initEngine() {
    if (!engineInstance) {
        engineInstance = new CitizenTalkEngine(db, storage);
        window.engineInstance = engineInstance;
        import('./media.js').then(m => m.setEngine(engineInstance));
    }
}

// ====================== PUBLISH ======================
window.publishTestimony = async () => {
    if (!currentUser) {
        showToast("Please sign in first", "error");
        return;
    }

    const textarea = document.getElementById('mainInput');
    const content = textarea?.value.trim() || "";

    if (!content && !window.selectedImageFile && !engineInstance?.currentAudioBlob) {
        showToast("Please add text, photo, or voice", "error");
        return;
    }

    const postBtn = document.getElementById('postButton');
    postBtn.disabled = true;
    postBtn.textContent = '🚀 Publishing...';

    try {
        const mediaData = await uploadForensicMedia(currentUser.uid);

        await addDoc(collection(db, "testimonies"), {
            author: currentUser.displayName || "Anonymous Witness",
            authorId: currentUser.uid,
            content: content,
            imageUrl: mediaData.imageUrl || null,
            audioUrl: mediaData.audioUrl || null,
            timestamp: new Date().toISOString(),
            feedVisibility: "citizen-talk",
            likes: 0,
            disputes: 0
        });

        showToast("✅ Testimony published successfully!", "success");

        if (textarea) textarea.value = '';
        resetMediaState();
        window.loadFeed('citizen-talk');

    } catch (err) {
        console.error("Publish error:", err);
        showToast("Failed to publish", "error");
    } finally {
        postBtn.disabled = false;
        postBtn.textContent = '🚀 Publish Testimony to the Square';
    }
};

// ====================== FEED ======================
window.loadFeed = (feedType) => {
    console.log("🔄 Loading feed:", feedType);
    document.querySelectorAll('#main-nav button').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`button[data-feed="${feedType}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    initFeed(db, feedType);
};

// ====================== UI LISTENERS ======================
function attachUIListeners() {
    console.log("👂 UI Listeners Attached");

    document.getElementById('btn-profile')?.addEventListener('click', window.showProfileSection);
    document.getElementById('btn-guardian')?.addEventListener('click', () => document.getElementById('guardianModal')?.classList.remove('hidden'));
    document.getElementById('btn-close-guardian')?.addEventListener('click', () => document.getElementById('guardianModal')?.classList.add('hidden'));

    const photoBtn = document.getElementById('btn-photo');
    if (photoBtn) {
        photoBtn.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = (e) => handleImageSelect(e, document.getElementById('preview-area'));
            input.click();
        });
    }

    const voiceBtn = document.getElementById('btn-voice');
    if (voiceBtn) voiceBtn.addEventListener('click', (e) => toggleVoiceRecording(e.currentTarget));

    document.getElementById('postButton')?.addEventListener('click', window.publishTestimony);
}

// ====================== BOOTSTRAP ======================
async function bootstrap() {
    console.log("🚀 Initializing VocalWitness...");
    try {
        await initAuth();
        initLanguage();
        initEngine();
        attachUIListeners();
        setTimeout(() => window.loadFeed('citizen-talk'), 800);
        console.log("✅ VocalWitness Loaded Successfully");
    } catch (e) {
        console.error("Bootstrap error:", e);
    }
}

document.addEventListener('DOMContentLoaded', bootstrap);

// ====================== GLOBAL HELPERS ======================
window.showProfileSection = () => document.getElementById('profileModal')?.classList.remove('hidden');
window.closeProfile = () => document.getElementById('profileModal')?.classList.add('hidden');
window.googleLogin = () => {
    import('./auth.js').then(m => m.googleLogin());
};

// Update Auth UI (hide sign in after login)
window.updateAuthUI = (user) => {
    document.querySelectorAll('button[onclick*="googleLogin"], button[onclick*="showSignupModal"]').forEach(btn => {
        btn.style.display = user ? 'none' : 'inline-flex';
    });
};
