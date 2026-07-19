// js/main.js - COMPLETE FIXED VERSION (Hybrid Model)
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

    try {
        if (tab === 'square' || tab === 'citizen') {
            container.innerHTML = `<div id="feedContainer" class="space-y-8"></div>`;
            initFeed(db, 'citizen-talk');
        } else if (tab === 'ledger') {
            container.innerHTML = `<div id="ledgerContainer" class="space-y-6"></div>`;
            if (typeof loadEvidenceLedger === 'function') loadEvidenceLedger();
        } else if (tab === 'witness') {
            container.innerHTML = `
                <div class="space-y-6 p-8 text-center">
                    <h2 class="text-3xl font-bold text-amber-400">🛡️ Verified Witnesses</h2>
                    <p class="text-zinc-400">ZK-Verified Testimonies</p>
                </div>`;
        }
    } catch (e) {
        console.error("Tab switch error:", e);
    }
};

// ====================== WELCOME NOTE ======================
function showWelcomeNote() {
    if (!auth.currentUser) return;
    if (localStorage.getItem('hasSeenWelcome')) return;
    
    showToast("🎉 Welcome to VocalWitness! Your voice matters in the Public Square.", "success");
    localStorage.setItem('hasSeenWelcome', 'true');
}

// ====================== PUBLISH TESTIMONY ======================
window.publishTestimony = async () => {
    if (!auth.currentUser) {
        showToast("Please sign in to share your testimony", "info");
        return;
    }

    const textarea = document.getElementById('mainInput');
    const content = textarea ? textarea.value.trim() : '';
    if (!content) {
        showToast("Please write something before publishing", "error");
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
        showToast("✅ Testimony published successfully!", "success");
        
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

// ====================== EVIDENCE LEDGER ======================
async function loadEvidenceLedger() {
    const container = document.getElementById('ledgerContainer');
    if (!container) return;

    container.innerHTML = `
        <div class="flex justify-between items-center mb-6">
            <h2 class="text-2xl font-bold text-emerald-400">📊 Evidence Ledger</h2>
            <button onclick="refreshLedger()" class="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-2xl text-sm flex items-center gap-2">🔄 Refresh</button>
        </div>
        <div id="ledgerEntries" class="space-y-4"></div>
    `;

    if (typeof loadForensicLedger === 'function') loadForensicLedger();
}

window.refreshLedger = loadEvidenceLedger;

// ====================== PROFILE ======================
window.showProfile = () => {
    if (!auth.currentUser) {
        showToast("Please sign in to access your Profile", "info");
        return;
    }

    const modal = document.getElementById('profileModal');
    if (!modal) {
        showToast("Profile modal not found. Try refreshing.", "error");
        return;
    }

    modal.classList.remove('hidden');
    initProfile(); 
};

window.closeProfile = () => {
    const modal = document.getElementById('profileModal');
    if (modal) {
        modal.classList.add('hidden');
    }
};

// Event listener for clicking outside the modal
document.getElementById('profileModal')?.addEventListener('click', function(e) {
    if (e.target === this) {
        window.closeProfile();
    }
});

// ====================== SETUP EVENT LISTENERS ======================
function setupEventListeners() {
    if (isInitialized) return;
    isInitialized = true;
    console.log("✅ Setting up all buttons...");

    // Tabs
    document.querySelectorAll('#main-nav button[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => window.switchTab(btn.dataset.tab));
    });

    // Profile & Support
    document.getElementById('profile-btn')?.addEventListener('click', window.showProfile);
    document.getElementById('support-btn')?.addEventListener('click', () => {
        document.getElementById('supportModal')?.classList.remove('hidden');
    });

    // Publish
    document.getElementById('postButton')?.addEventListener('click', window.publishTestimony);
    
    // Photo
  const photoBtn = document.getElementById('btn-photo');
if (photoBtn) {
    photoBtn.addEventListener('click', () => {
        if (!auth.currentUser) {
            showToast("Sign in to upload Forensic Photo", "info");
            // Optional: You can open sign-in modal here later
            return;
        }
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/jpeg,image/png,image/webp';
        input.onchange = (e) => mediaModule.handleImageSelect(e, document.getElementById('preview-area'));
        input.click();
    });
}

    // Voice
    const voiceBtn = document.getElementById('btn-voice');
if (voiceBtn) {
    voiceBtn.addEventListener('click', () => {
        if (!auth.currentUser) {
            showToast("Sign in to record Voice Testimony", "info");
            return;
        }
        mediaModule.toggleVoiceRecording(voiceBtn);
    });
}
    console.log("✅ All buttons initialized");
}

// ====================== BOOTSTRAP ======================
async function bootstrap() {
    if (isInitialized) return;
    console.log("🚀 VocalWitness Bootstrap started");

    try {
        await initAuth();
        setupEventListeners();
        if (typeof initLanguage === 'function') initLanguage();
        
        engineInstance = new CitizenTalkEngine(db, storage);
        window.engineInstance = engineInstance;

        loadDynamicNavigation();
        setTimeout(() => window.switchTab('square'), 600);
        setTimeout(showWelcomeNote, 1500);

        console.log("✅ Bootstrap finished");
    } catch (e) {
        console.error("Bootstrap error:", e);
    }
}

document.addEventListener('DOMContentLoaded', bootstrap);
