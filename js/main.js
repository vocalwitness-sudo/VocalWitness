// js/main.js - Hybrid Model (Browse Free, Post Requires Login)
import './app-state.js';
import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db, auth, storage } from './firebase-config.js';
import { initLanguage } from './i18n.js';
import * as mediaModule from './media.js';
import { CitizenTalkEngine } from '../vocalWitnessEngine.js';
import { initProfile } from './profile.js';
import { loadDynamicNavigation } from './navigation.js';
import { AppState } from './app-state.js';
import { showToast, generateSha256Hash } from './utils.js';

let engineInstance = null;
let isInitialized = false;

// ====================== TAB SWITCHING ======================
window.switchTab = async (tab) => {
    console.log(`Switching to tab: ${tab}`);
    
    document.querySelectorAll('#main-nav button[data-tab]').forEach(btn => {
        btn.classList.remove('active', 'bg-amber-900', 'text-amber-300');
        if (btn.dataset.tab === tab) {
            btn.classList.add('active');
            if (tab === 'witness') btn.classList.add('bg-amber-900', 'text-amber-300');
        }
    });

    AppState.currentTab = tab;
    AppState.currentMode = tab === 'witness' ? 'witness' : 'citizen';

    const container = document.getElementById('dynamicContainer');
    if (!container) return;

    container.innerHTML = `<div class="text-center py-20 text-zinc-400">Loading ${tab}...</div>`;

    if (tab === 'square' || tab === 'citizen') {
        container.innerHTML = `<div id="feedContainer" class="space-y-8"></div>`;
        initFeed(db, 'citizen-talk');
    } else if (tab === 'ledger') {
        container.innerHTML = `<div id="ledgerContainer" class="space-y-6"></div>`;
        if (typeof loadEvidenceLedger === 'function') loadEvidenceLedger();
    }
};

// ====================== SHOW WELCOME NOTE FOR NEW USERS ======================
function showWelcomeNote() {
    if (!auth.currentUser) return;
    
    const hasSeenWelcome = localStorage.getItem('hasSeenWelcome');
    if (hasSeenWelcome) return;

    showToast("🎉 Welcome to VocalWitness! Your voice matters.", "success");
    localStorage.setItem('hasSeenWelcome', 'true');
}

// ====================== PUBLISH TESTIMONY (Requires Login) ======================
window.publishTestimony = async () => {
    if (!auth.currentUser) {
        showToast("Please sign in to share your testimony", "info");
        return;
    }

    const textarea = document.getElementById('mainInput');
    const content = textarea ? textarea.value.trim() : '';
    if (!content) {
        showToast("Please write a testimony", "error");
        return;
    }

    const postBtn = document.getElementById('postButton');
    const originalText = postBtn ? postBtn.textContent : '🚀 Publish to the Square';

    if (postBtn) {
        postBtn.disabled = true;
        postBtn.textContent = 'Publishing...';
    }

    try {
        const { collection, addDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js");
        
        const mediaData = await mediaModule.uploadForensicMedia();
        
        const testimonyData = {
            authorId: auth.currentUser.uid,
            author: auth.currentUser.displayName || "Registered Witness",
            content,
            createdAt: serverTimestamp(),
            timestamp: Date.now(),
            isPublic: true,
            moderationStatus: "approved",
            feedVisibility: "citizen-talk",
            imageUrl: mediaData.imageUrl || null,
            audioUrl: mediaData.audioUrl || null,
            imageHash: mediaData.imageHash || null,
            audioHash: mediaData.audioHash || null,
            hasForensic: !!(mediaData.imageHash || mediaData.audioHash)
        };

        await addDoc(collection(db, "testimonies"), testimonyData);
        showToast("✅ Testimony published to the Public Square!", "success");
        
        if (textarea) textarea.value = '';
        mediaModule.resetMediaState();
        if (window.engineInstance) window.engineInstance.clearPendingMedia?.();

    } catch (err) {
        console.error("Publish error:", err);
        showToast("Failed to publish.", "error");
    } finally {
        if (postBtn) {
            postBtn.disabled = false;
            postBtn.textContent = originalText;
        }
    }
};

// ====================== PROFILE ======================
window.showProfile = () => {
    if (!auth.currentUser) {
        showToast("Please sign in to view profile", "info");
        return;
    }
    initProfile();
    document.getElementById('profileModal')?.classList.remove('hidden');
};

window.closeProfile = () => document.getElementById('profileModal')?.classList.add('hidden');

// ====================== BOOTSTRAP ======================
async function bootstrap() {
    if (isInitialized) return;
    console.log("🚀 VocalWitness starting...");

    try {
        await initAuth();
        setupEventListeners();
        if (typeof initLanguage === 'function') initLanguage();
        
        engineInstance = new CitizenTalkEngine(db, storage);
        window.engineInstance = engineInstance;

        loadDynamicNavigation();
        setTimeout(() => window.switchTab('square'), 600);

        // Show welcome for new logged-in users
        setTimeout(showWelcomeNote, 1500);

        console.log("✅ App initialized");
    } catch (e) {
        console.error("Bootstrap error:", e);
    }
}

document.addEventListener('DOMContentLoaded', bootstrap);
