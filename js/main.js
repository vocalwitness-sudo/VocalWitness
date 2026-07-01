// js/main.js - OPTIMIZED + FIXED
import { initAuth, getCurrentUser, googleLogin as authGoogleLogin } from "./auth.js";
import { initFeed } from './feed.js';
import { db, storage } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage } from './i18n.js';
import { handleImageSelect, toggleVoiceRecording, uploadForensicMedia, resetMediaState } from './media.js';
import { CitizenTalkEngine } from '../vocalWitnessEngine.js';
import { collection, addDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

let engineInstance = null;
let currentUser = null;
let mutationObserver = null;

// Safe selector
function safeGetElement(id) {
    return document.getElementById(id);
}

// ====================== FEED ======================
window.loadFeed = (feedType) => {
    console.log("🔄 Loading feed:", feedType);
    document.querySelectorAll('#main-nav button[data-feed]').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`button[data-feed="${feedType}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    initFeed(db, feedType);
};

// ====================== PUBLISH ======================
window.publishTestimony = async () => {
    if (!currentUser) return showToast("Please sign in first", "error");

    const textarea = safeGetElement('mainInput');
    const content = textarea?.value.trim() || "";

    if (!content && !window.selectedImageFile && !engineInstance?.currentAudioBlob) {
        return showToast("Add text, photo, or voice", "error");
    }

    const postBtn = safeGetElement('postButton');
    if (postBtn) {
        postBtn.disabled = true;
        postBtn.textContent = '🚀 Publishing...';
    }

    try {
        const mediaData = await uploadForensicMedia(currentUser.uid);
        await addDoc(collection(db, "testimonies"), {
            author: currentUser.displayName || "Anonymous Witness",
            authorId: currentUser.uid,
            content,
            imageUrl: mediaData.imageUrl,
            audioUrl: mediaData.audioUrl,
            timestamp: new Date().toISOString(),
            feedVisibility: "citizen-talk"
        });

        showToast("✅ Testimony published!", "success");
        if (textarea) textarea.value = '';
        resetMediaState();
        window.loadFeed('citizen-talk');
    } catch (err) {
        console.error(err);
        showToast("Publish failed", "error");
    } finally {
        if (postBtn) {
            postBtn.disabled = false;
            postBtn.textContent = '🚀 Publish Testimony to the Square';
        }
    }
};

// ====================== AUTH UI ======================
function updateAuthUI(user) {
    const container = safeGetElement('auth-button-container');
    if (!container) return;
    if (!user) {
        container.innerHTML = `<button onclick="window.googleLogin()" class="px-5 py-2.5 bg-white text-black rounded-2xl font-medium">Sign in with Google</button>`;
    } else {
        container.innerHTML = `<button onclick="window.showProfileSection()" class="w-9 h-9 bg-emerald-600 rounded-2xl text-lg">👤</button>`;
    }
}

// ====================== UI LISTENERS ======================
function attachUIListeners() {
    console.log("👂 Attaching UI Listeners");

    safeGetElement('btn-profile')?.addEventListener('click', window.showProfileSection);
    safeGetElement('btn-guardian')?.addEventListener('click', () => safeGetElement('guardianModal')?.classList.remove('hidden'));
    safeGetElement('btn-close-guardian')?.addEventListener('click', () => safeGetElement('guardianModal')?.classList.add('hidden'));

    const photoBtn = safeGetElement('btn-photo');
    if (photoBtn) photoBtn.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => handleImageSelect(e, safeGetElement('preview-area'));
        input.click();
    });

    const voiceBtn = safeGetElement('btn-voice');
    if (voiceBtn) voiceBtn.addEventListener('click', (e) => toggleVoiceRecording(e.currentTarget));

    safeGetElement('postButton')?.addEventListener('click', window.publishTestimony);
}

// ====================== MUTATION OBSERVER (Optimized) ======================
function startMutationObserver() {
    if (mutationObserver) return;

    mutationObserver = new MutationObserver(() => {
        // Debounced re-attach
        if (window.reattachTimeout) clearTimeout(window.reattachTimeout);
        window.reattachTimeout = setTimeout(() => {
            attachUIListeners();
        }, 300);
    });

    mutationObserver.observe(document.body, { childList: true, subtree: true });
}

// ====================== BOOTSTRAP ======================
async function bootstrap() {
    console.log("🚀 Initializing VocalWitness...");
    try {
        await initAuth();
        currentUser = getCurrentUser();
        updateAuthUI(currentUser);

        initLanguage();
        initEngine();
        attachUIListeners();
        startMutationObserver();

        setTimeout(() => window.loadFeed('citizen-talk'), 800);
        console.log("✅ VocalWitness Loaded Successfully");
    } catch (e) {
        console.error("Bootstrap error:", e);
    }
}

document.addEventListener('DOMContentLoaded', bootstrap);

// Global Helpers
window.showProfileSection = () => safeGetElement('profileModal')?.classList.remove('hidden');
window.closeProfile = () => safeGetElement('profileModal')?.classList.add('hidden');
window.googleLogin = () => authGoogleLogin();
window.loadFeed = window.loadFeed;
