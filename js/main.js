// js/main.js
import { initAuth, getCurrentUser } from "./auth.js";
import { initFeed } from './feed.js';
import { db, storage, auth } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage } from './i18n.js';
import { 
    handleImageSelect, 
    toggleVoiceRecording, 
    uploadForensicMedia, 
    resetMediaState,
    setEngine   // ← Added
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
        setEngine?.(engineInstance);   // Safe call
    }
}

// ====================== FEED ======================
window.loadFeed = (feedType) => {
    console.log("🔄 Loading feed:", feedType);
    
    document.querySelectorAll('#main-nav button[data-feed]').forEach(btn => 
        btn.classList.remove('active')
    );
    
    const activeBtn = document.querySelector(`button[data-feed="${feedType}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    initFeed(db, feedType);
};

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

    const postBtn = safeGetElement('postButton');
    if (postBtn) {
        postBtn.disabled = true;
        postBtn.textContent = '🚀 Publishing...';
    }

    try {
        const mediaData = await uploadForensicMedia(user.uid);
        
        await addDoc(collection(db, "testimonies"), {
            author: user.displayName || "Anonymous Witness",
            authorId: user.uid,
            content,
            imageUrl: mediaData.imageUrl || null,
            audioUrl: mediaData.audioUrl || null,
            timestamp: new Date().toISOString(),
            feedVisibility: "citizen-talk"
        });

        showToast("✅ Testimony published!", "success");
        
        if (textarea) textarea.value = '';
        resetMediaState();
        window.loadFeed('citizen-talk');
        
    } catch (err) {
        console.error("Publish error:", err);
        showToast("Publish failed. Please try again.", "error");
    } finally {
        if (postBtn) {
            postBtn.disabled = false;
            postBtn.textContent = '🚀 Publish Testimony to the Square';
        }
    }
};

// ====================== UI HELPERS ======================
function safeGetElement(id) {
    const el = document.getElementById(id);
    if (!el) console.warn(`Element with id "${id}" not found`);
    return el;
}

// ====================== UI LISTENERS ======================
function attachUIListeners() {
    console.log("👂 Attaching UI Listeners");

    safeGetElement('btn-profile')?.addEventListener('click', window.showProfileSection);
    safeGetElement('btn-guardian')?.addEventListener('click', () => {
        safeGetElement('guardianModal')?.classList.remove('hidden');
    });
    safeGetElement('btn-close-guardian')?.addEventListener('click', () => {
        safeGetElement('guardianModal')?.classList.add('hidden');
    });

    // Photo upload
    const photoBtn = safeGetElement('btn-photo');
    if (photoBtn) {
        photoBtn.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = (e) => handleImageSelect(e, safeGetElement('preview-area'));
            input.click();
        });
    }

    // Voice recording
    const voiceBtn = safeGetElement('btn-voice');
    if (voiceBtn) {
        voiceBtn.addEventListener('click', (e) => toggleVoiceRecording(e.currentTarget));
    }

    safeGetElement('postButton')?.addEventListener('click', window.publishTestimony);
}

// ====================== BOOTSTRAP ======================
async function bootstrap() {
    console.log("🚀 Initializing VocalWitness...");

    try {
        await initAuth();
        currentUser = getCurrentUser?.() || auth.currentUser;

        initLanguage();
        initEngine();
        attachUIListeners();

        // Load default feed
        setTimeout(() => window.loadFeed('citizen-talk'), 800);

        console.log("✅ VocalWitness Loaded Successfully");
    } catch (e) {
        console.error("Bootstrap error:", e);
        showToast("Failed to initialize app", "error");
    }
}

document.addEventListener('DOMContentLoaded', bootstrap);

// ====================== GLOBAL EXPORTS ======================
window.showProfileSection = () => safeGetElement('profileModal')?.classList.remove('hidden');
window.closeProfile = () => safeGetElement('profileModal')?.classList.add('hidden');
window.loadFeed = window.loadFeed;
window.updateCurrentUser = updateCurrentUser;
