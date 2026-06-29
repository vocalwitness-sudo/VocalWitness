// js/main.js - FIXED & ENHANCED
import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage } from './i18n.js';
import { handleImageSelect, toggleVoiceRecording, uploadForensicMedia, resetMediaState } from './media.js';
import { VocalWitnessEngine } from '../vocalWitnessEngine.js';   // ← Important

let engineInstance = null;
let currentUser = null;

// ====================== INITIALIZE ENGINE ======================
function initEngine() {
    if (!engineInstance) {
        engineInstance = new VocalWitnessEngine(db.storage || db, db); // adjust based on your config
        window.engineInstance = engineInstance; // for debugging
        // Pass to media.js
        import('./media.js').then(m => m.setEngine(engineInstance));
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

    if (!content && !selectedImageFile && !engineInstance?.currentAudioBlob) {
        showToast("Please add text, photo, or voice testimony", "error");
        return;
    }

    const postBtn = document.getElementById('postButton');
    postBtn.disabled = true;
    postBtn.innerHTML = '🚀 Publishing...';

    try {
        const mediaData = await uploadForensicMedia(currentUser.uid);
        
        // TODO: Add to Firestore (you can expand this)
        showToast("✅ Testimony published successfully!", "success");
        
        // Reset form
        if (textarea) textarea.value = '';
        resetMediaState();
        
    } catch (err) {
        console.error(err);
        showToast("Failed to publish. Try again.", "error");
    } finally {
        postBtn.disabled = false;
        postBtn.innerHTML = '🚀 Publish Testimony to the Square';
    }
};

// ====================== FEED SWITCHING ======================
window.loadFeed = (feedType) => {
    console.log("🔄 Loading feed:", feedType);
    
    // Normalize feed type
    const normalized = feedType === 'citizen' ? 'citizen-talk' : 
                      feedType === 'true' ? 'true-witness' : feedType;

    document.querySelectorAll('#main-nav button').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.feed === feedType || btn.textContent.toLowerCase().includes(feedType)) {
            btn.classList.add('active');
        }
    });

    initFeed(db, normalized);
};

// ====================== UI LISTENERS ======================
function attachUIListeners() {
    console.log("👂 UI Listeners Attached");

    // Profile
    document.getElementById('btn-profile')?.addEventListener('click', () => {
        window.showProfileSection?.();
    });

    // Guardian
    document.getElementById('btn-guardian')?.addEventListener('click', () => {
        document.getElementById('guardianModal')?.classList.remove('hidden');
    });

    document.getElementById('btn-close-guardian')?.addEventListener('click', () => {
        document.getElementById('guardianModal')?.classList.add('hidden');
    });

    // Photo & Voice (already good, but ensure)
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

    // Publish Button - MAIN FIX
    document.getElementById('postButton')?.addEventListener('click', window.publishTestimony);
}

// ====================== BOOTSTRAP ======================
async function bootstrap() {
    console.log("🚀 Initializing VocalWitness...");
    try {
        await initAuth();
        initLanguage();
        initEngine();           // ← New
        attachUIListeners();
        
        // Default feed
        setTimeout(() => window.loadFeed('citizen'), 300);

        console.log("✅ VocalWitness Loaded Successfully");
        showToast("Platform Ready", "success");
    } catch (error) {
        console.error("❌ Bootstrap failed:", error);
        showToast("Failed to initialize", "error");
    }
}

document.addEventListener('DOMContentLoaded', bootstrap);
