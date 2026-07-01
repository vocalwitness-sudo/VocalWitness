// js/main.js - FIXED & CLEAN
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
import { CitizenTalkEngine } from '../vocalWitnessEngine.js';
import { collection, addDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

let engineInstance = null;
let currentUser = null;

// Sync current user
export function updateCurrentUser(user) {
    currentUser = user;
    window.currentUser = user;
}

// ====================== ENGINE ======================
function initEngine() {
    if (!engineInstance) {
        engineInstance = new CitizenTalkEngine(db, storage);
        window.engineInstance = engineInstance;
        setEngine?.(engineInstance);
    }
}

// ====================== PUBLISH ======================
window.publishTestimony = async () => {
    const user = currentUser || auth.currentUser;
    if (!user) {
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
    if (postBtn) {
        postBtn.disabled = true;
        postBtn.textContent = '🚀 Publishing...';
    }

    try {
        const mediaData = await uploadForensicMedia(user.uid);

        await addDoc(collection(db, "testimonies"), {
            author: user.displayName || "Anonymous Witness",
            authorId: user.uid,
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
        showToast("Failed to publish. Please try again.", "error");
    } finally {
        if (postBtn) {
            postBtn.disabled = false;
            postBtn.textContent = '🚀 Publish Testimony to the Square';
        }
    }
};

// ====================== FEED ======================
window.loadFeed = (feedType) => {
    console.log("🔄 Loading feed:", feedType);
    document.querySelectorAll('#main-nav button[data-feed]').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`button[data-feed="${feedType}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    initFeed(db, feedType);
};

// ====================== UI LISTENERS ======================
function attachUIListeners() {
    console.log("👂 Attaching UI Listeners");

    document.getElementById('btn-profile')?.addEventListener('click', window.showProfileSection);
    document.getElementById('btn-guardian')?.addEventListener('click', () => {
        document.getElementById('guardianModal')?.classList.remove('hidden');
    });
    document.getElementById('btn-close-guardian')?.addEventListener('click', () => {
        document.getElementById('guardianModal')?.classList.add('hidden');
    });

    // Photo
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

    // Voice
    const voiceBtn = document.getElementById('btn-voice');
    if (voiceBtn) voiceBtn.addEventListener('click', (e) => toggleVoiceRecording(e.currentTarget));

    // Publish
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

// Global helpers
window.showProfileSection = () => document.getElementById('profileModal')?.classList.remove('hidden');
window.closeProfile = () => document.getElementById('profileModal')?.classList.add('hidden');
window.updateCurrentUser = updateCurrentUser;
