import './app-state.js';
import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db, auth, storage } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage } from './i18n.js';
import * as mediaModule from './media.js';
import { CitizenTalkEngine } from '../vocalWitnessEngine.js';
import { initProfile } from './profile.js';
import { initOnboarding } from './onboarding.js';
import { loadDynamicNavigation } from './navigation.js';
import { applyTierTheme, updateTierBadge } from './tier.js';
import { AppState } from './app-state.js';

let engineInstance = null;

// ====================== TAB SWITCHING ======================
window.switchTab = (tab) => {
    document.querySelectorAll('#main-nav button').forEach(btn => {
        btn.classList.remove('active', 'bg-amber-900', 'text-amber-300');
        if (btn.dataset.tab === tab) {
            btn.classList.add('active');
            if (tab === 'witness') btn.classList.add('bg-amber-900', 'text-amber-300');
        }
    });

    AppState.currentTab = tab;
    AppState.currentMode = tab === 'witness' ? 'witness' : 'citizen';

    if (tab === 'more') {
        showMoreMenu();
        return;
    }

    loadDynamicFeed(tab);
};

function loadDynamicFeed(tab) {
    let feedType = 'citizen-talk';
    if (tab === 'ledger') feedType = 'ledger';
    else if (tab === 'arena') feedType = 'live';
    else if (tab === 'mycircle') feedType = 'my-testimonies';
    else if (tab === 'witness') feedType = 'true-witness';

    initFeed(db, feedType);
}

window.showMoreMenu = () => {
    alert("More menu - coming soon");
};

// ====================== GLOBAL MODAL FUNCTIONS ======================
window.showProfile = () => {
    document.getElementById('profileModal').classList.remove('hidden');
};

window.closeProfile = () => {
    document.getElementById('profileModal').classList.add('hidden');
};

window.editProfile = () => {
    // Bridge to the function in profile.js
    if (typeof window.openEditProfile === 'function') {
        window.openEditProfile();
    } else {
        showToast("Edit profile is loading...", "info");
    }
};


window.logout = () => {
    if (confirm("Logout?")) {
        alert("Logged out (add real logic)");
    }
};

// ====================== PUBLISH TESTIMONY (with media support) ======================
window.publishTestimony = async () => {
    const textarea = document.getElementById('mainInput');
    const content = textarea ? textarea.value.trim() : '';

    if (!content) {
        showToast("Please write a testimony", "error");
        return;
    }

    const postBtn = document.getElementById('postButton');
    if (postBtn) {
        postBtn.disabled = true;
        postBtn.textContent = 'Publishing...';
    }

    try {
        console.log("📤 Starting publish...");
        const { collection, addDoc, serverTimestamp } = await import(
            "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js"
        );

        // Get pending media from engine
        const mediaData = window.engineInstance?.getPendingMedia?.() || {};

        const testimonyData = {
            authorId: "anonymous",
            author: "Anonymous Witness",
            content,
            createdAt: serverTimestamp(),
            timestamp: Date.now(),
            isPublic: true,
            moderationStatus: "approved",
            feedVisibility: "citizen-talk",
            imageUrl: mediaData.imageUrl || null,
            audioUrl: mediaData.audioUrl || null,
        };

        const docRef = await addDoc(collection(db, "testimonies"), testimonyData);

        console.log("✅ Saved with ID:", docRef.id);
        showToast("✅ Testimony published successfully!", "success");

        // Clear form and media
        if (textarea) textarea.value = '';
        if (window.engineInstance?.clearPendingMedia) {
            window.engineInstance.clearPendingMedia();
        }

        // Refresh feed
        setTimeout(() => {
            const currentFeed = AppState.currentTab === 'witness' ? 'true-witness' : 'citizen-talk';
            initFeed(db, currentFeed);
        }, 700);
    } catch (err) {
        console.error("❌ Publish error:", err.code, "-", err.message);
        showToast("Failed to publish. Try again.", "error");
    } finally {
        if (postBtn) {
            postBtn.disabled = false;
            postBtn.textContent = 'Publish to the Square';
        }
    }
};

// ====================== BOOTSTRAP ======================
async function bootstrap() {
    try {
        await initAuth();
        initLanguage();
        initProfile();
        initOnboarding?.();
        loadDynamicNavigation?.();

        engineInstance = new CitizenTalkEngine(db, storage);
        window.engineInstance = engineInstance;

        if (mediaModule.setEngine) mediaModule.setEngine(engineInstance);

        if (typeof applyTierTheme === 'function') applyTierTheme();
        if (typeof updateTierBadge === 'function') updateTierBadge();

        setupEventListeners();

        // Initial tab
        setTimeout(() => window.switchTab('square'), 600);

        console.log("✅ VocalWitness Live Ready");
    } catch (e) {
        console.error("Bootstrap failed:", e);
    }
}

function setupEventListeners() {
    // Nav Tabs
    document.querySelectorAll('#main-nav button[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => window.switchTab(btn.dataset.tab));
    });

    // Profile Button
    const profileBtn = document.getElementById('profile-btn');
    if (profileBtn) profileBtn.addEventListener('click', window.showProfile);

    // Support Button
    const supportBtn = document.getElementById('support-btn');
    if (supportBtn) {
        supportBtn.addEventListener('click', () => {
            document.getElementById('supportModal')?.classList.remove('hidden');
        });
    }

    // Post Button
    const postBtn = document.getElementById('postButton');
    if (postBtn) {
        postBtn.addEventListener('click', window.publishTestimony);
        console.log("✅ Publish listener attached");
    }

    // ====================== MEDIA BUTTONS ======================
    const photoBtn = document.getElementById('btn-photo');
    if (photoBtn) {
        photoBtn.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = (e) => {
                const previewArea = document.getElementById('preview-area');
                if (typeof mediaModule.handleImageSelect === 'function') {
                    mediaModule.handleImageSelect(e, previewArea);
                } else {
                    showToast("📸 Media module not ready.", "error");
                }
            };
            input.click();
        });
    }

    const voiceBtn = document.getElementById('btn-voice');
    if (voiceBtn) {
        voiceBtn.addEventListener('click', (e) => {
            if (typeof mediaModule.toggleVoiceRecording === 'function') {
                mediaModule.toggleVoiceRecording(e.currentTarget);
            } else {
                showToast("🎤 Voice module not ready.", "error");
            }
        });
    }
}

// Start the app
document.addEventListener('DOMContentLoaded', bootstrap);
