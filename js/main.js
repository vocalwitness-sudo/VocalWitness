// js/main.js - FINAL FIXED VERSION
import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db, storage } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage } from './i18n.js';
import { handleImageSelect, toggleVoiceRecording, uploadForensicMedia, resetMediaState } from './media.js';
import { CitizenTalkEngine } from '../vocalWitnessEngine.js';

let engineInstance = null;
let currentUser = null;

// ====================== INITIALIZE ENGINE ======================
function initEngine() {
    if (!engineInstance) {
        engineInstance = new CitizenTalkEngine(db, storage);
        window.engineInstance = engineInstance;
        import('./media.js').then(m => m.setEngine(engineInstance));
        console.log("✅ Engine initialized");
    }
}

// ====================== PUBLISH TESTIMONY ======================
window.publishTestimony = async () => {
    if (!currentUser) {
        showToast("Please sign in first", "error");
        return;
    }

    const textarea = document.getElementById('mainInput');
    const content = textarea?.value.trim() || "";

    if (!content && !window.selectedImageFile && !engineInstance?.currentAudioBlob) {
        showToast("Please add text, photo, or voice testimony", "error");
        return;
    }

    const postBtn = document.getElementById('postButton');
    postBtn.disabled = true;
    postBtn.textContent = '🚀 Publishing...';

    try {
        const mediaData = await uploadForensicMedia(currentUser.uid);
        showToast("✅ Testimony published to the Square!", "success");
        
        if (textarea) textarea.value = '';
        resetMediaState();
        
    } catch (err) {
        console.error(err);
        showToast("Failed to publish testimony", "error");
    } finally {
        postBtn.disabled = false;
        postBtn.textContent = '🚀 Publish Testimony to the Square';
    }
};

// ====================== FEED SWITCHING ======================
window.loadFeed = (feedType) => {
    console.log("🔄 Loading feed:", feedType);
    
    const normalized = feedType === 'citizen-talk' ? 'citizen-talk' :
                       feedType === 'true' ? 'true-witness' : feedType;

    document.querySelectorAll('#main-nav button').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.feed === feedType) btn.classList.add('active');
    });

    initFeed(db, normalized);
};

// ====================== UI LISTENERS ======================
function attachUIListeners() {
    console.log("👂 UI Listeners Attached");

    document.getElementById('btn-profile')?.addEventListener('click', () => {
        window.showProfileSection?.();
    });

    document.getElementById('btn-guardian')?.addEventListener('click', () => {
        document.getElementById('guardianModal')?.classList.remove('hidden');
    });

    document.getElementById('btn-close-guardian')?.addEventListener('click', () => {
        document.getElementById('guardianModal')?.classList.add('hidden');
    });

    // Photo Button
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

    // Voice Button
    const voiceBtn = document.getElementById('btn-voice');
    if (voiceBtn) {
        voiceBtn.addEventListener('click', (e) => toggleVoiceRecording(e.currentTarget));
    }

    // Publish Button
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
        
        // Default feed
        setTimeout(() => window.loadFeed('citizen-talk'), 500);

        console.log("✅ VocalWitness Loaded Successfully");
        showToast("Platform Ready", "success");
    } catch (error) {
        console.error("❌ Bootstrap failed:", error);
        showToast("Failed to initialize app", "error");
    }
}
// === EMERGENCY PROFILE FIX ===
window.showProfileSection = () => {
    console.log("👤 Profile button clicked!");
    const modal = document.getElementById('profileModal');
    if (modal) {
        modal.classList.remove('hidden');
        console.log("✅ Profile modal opened");
    } else {
        console.error("❌ Profile modal element not found!");
        alert("Profile modal not found in HTML");
    }
};

document.addEventListener('DOMContentLoaded', bootstrap);
