import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db, storage, auth } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage } from './i18n.js';
import {
    handleImageSelect,
    toggleVoiceRecording,
    uploadForensicMedia,
    resetMediaState,
    setEngine
} from './media.js';
import { VocalWitnessEngine } from './vocalWitnessEngine.js';   // Use consistent name

let engineInstance = null;
let currentUser = null;

export function updateCurrentUser(user) {
    currentUser = user;
    window.currentUser = user;
}

function initEngine() {
    if (!engineInstance) {
        engineInstance = new VocalWitnessEngine(db, storage);
        window.engineInstance = engineInstance;
        setEngine(engineInstance);
        console.log("✅ Engine initialized with storage");
    }
}

window.publishTestimony = async () => {
    const user = currentUser || auth.currentUser;
    if (!user) {
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
    if (postBtn) {
        postBtn.disabled = true;
        postBtn.textContent = '🚀 Publishing...';
    }

    try {
        const mediaData = await uploadForensicMedia(user.uid);
        
        await addDoc(collection(db, "testimonies"), {
            authorId: user.uid,
            author: user.displayName || "Anonymous Witness",
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
        showToast("Failed to publish. Check your connection.", "error");
    } finally {
        if (postBtn) {
            postBtn.disabled = false;
            postBtn.textContent = '🚀 Publish Testimony to the Square';
        }
    }
};

window.loadFeed = (feedType) => {
    console.log("🔄 Loading feed:", feedType);
    document.querySelectorAll('#main-nav button[data-feed]').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`button[data-feed="${feedType}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    initFeed(db, feedType);
};

function attachUIListeners() {
    console.log("👂 Attaching UI Listeners");

    document.getElementById('btn-profile')?.addEventListener('click', window.showProfileSection);
    document.getElementById('btn-guardian')?.addEventListener('click', () => {
        document.getElementById('guardianModal')?.classList.remove('hidden');
    });
    document.getElementById('btn-close-guardian')?.addEventListener('click', () => {
        document.getElementById('guardianModal')?.classList.add('hidden');
    });

    // Photo button
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

    // Voice button
    const voiceBtn = document.getElementById('btn-voice');
    if (voiceBtn) voiceBtn.addEventListener('click', (e) => toggleVoiceRecording(e.currentTarget));

    // Publish
    document.getElementById('postButton')?.addEventListener('click', window.publishTestimony);
}

async function bootstrap() {
    console.log("🚀 Initializing VocalWitness...");
    try {
        await initAuth();
        initLanguage();
        initEngine();
        attachUIListeners();
        
        // Single initial feed load
        setTimeout(() => window.loadFeed('citizen-talk'), 600);
        
        console.log("✅ VocalWitness Loaded Successfully");
    } catch (e) {
        console.error("Bootstrap error:", e);
        showToast("App failed to start properly", "error");
    }
}

document.addEventListener('DOMContentLoaded', bootstrap);

// Global helpers
window.showProfileSection = () => document.getElementById('profileModal')?.classList.remove('hidden');
window.closeProfile = () => document.getElementById('profileModal')?.classList.add('hidden');
window.updateCurrentUser = updateCurrentUser;
