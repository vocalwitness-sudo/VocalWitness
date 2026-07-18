// js/main.js - Clean & Working Version (Mandatory Login)
import './app-state.js';
import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db, auth, storage } from './firebase-config.js';
import { initLanguage } from './i18n.js';
import * as mediaModule from './media.js';
import { CitizenTalkEngine } from '../vocalWitnessEngine.js';
import { loadDynamicNavigation } from './navigation.js';
import { AppState } from './app-state.js';
import { showToast } from './utils.js';

let engineInstance = null;
let isInitialized = false;

// ====================== TAB SWITCHING ======================
window.switchTab = async (tab) => {
    console.log(`Switching to tab: ${tab}`);
    
    document.querySelectorAll('#main-nav button[data-tab]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
        if (btn.dataset.tab === 'witness' && btn.dataset.tab === tab) {
            btn.classList.add('bg-amber-900', 'text-amber-300');
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
        showToast("Failed to load tab", "error");
    }
};

// ====================== PUBLISH TESTIMONY ======================
window.publishTestimony = async () => {
    if (!auth.currentUser) {
        showToast("Please log in to publish", "error");
        return;
    }

    const textarea = document.getElementById('mainInput');
    const content = textarea ? textarea.value.trim() : '';
    if (!content) {
        showToast("Please write a testimony", "error");
        return;
    }

    const postBtn = document.getElementById('postButton');
    const originalText = postBtn ? postBtn.textContent : 'Publish';

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
        
        showToast("✅ Testimony published to the Square!", "success");
        
        if (textarea) textarea.value = '';
        mediaModule.resetMediaState();
        if (window.engineInstance) window.engineInstance.clearPendingMedia?.();

    } catch (err) {
        console.error("Publish error:", err);
        showToast("Failed to publish. Please try again.", "error");
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

// ====================== SETUP EVENT LISTENERS ======================
function setupEventListeners() {
    if (isInitialized) return;
    isInitialized = true;

    console.log("✅ Setting up UI workers...");

    // Navigation Tabs
    document.querySelectorAll('#main-nav button[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => window.switchTab(btn.dataset.tab));
    });

    // Profile & Support
    document.getElementById('profile-btn')?.addEventListener('click', () => {
        if (auth.currentUser) window.showProfile();
        else showToast("Please log in to view profile", "info");
    });

    document.getElementById('support-btn')?.addEventListener('click', () => {
        document.getElementById('supportModal')?.classList.remove('hidden');
    });

    // Publish Button
    document.getElementById('postButton')?.addEventListener('click', window.publishTestimony);

    // Forensic Photo Button
    const photoBtn = document.getElementById('btn-photo');
    if (photoBtn) {
        photoBtn.addEventListener('click', () => {
            if (!auth.currentUser) {
                showToast("Please log in to upload photo", "info");
                return;
            }
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/jpeg,image/png,image/webp';
            input.onchange = (e) => mediaModule.handleImageSelect(e, document.getElementById('preview-area'));
            input.click();
        });
    }

    // Voice Testimony Button
    const voiceBtn = document.getElementById('btn-voice');
    if (voiceBtn) {
        voiceBtn.addEventListener('click', () => {
            if (!auth.currentUser) {
                showToast("Please log in to record voice", "info");
                return;
            }
            mediaModule.toggleVoiceRecording(voiceBtn);
        });
    }

    console.log("✅ All buttons attached");
}

// ====================== BOOTSTRAP ======================
async function bootstrap() {
    if (isInitialized) return;
    console.log("🚀 VocalWitness starting...");

    try {
        setupEventListeners();
        if (typeof initLanguage === 'function') initLanguage();
        
        engineInstance = new CitizenTalkEngine(db, storage);
        window.engineInstance = engineInstance;

        loadDynamicNavigation();

        // Default tab
        setTimeout(() => window.switchTab('square'), 400);

        console.log("✅ App initialized");
    } catch (e) {
        console.error("Bootstrap error:", e);
    }
}

document.addEventListener('DOMContentLoaded', bootstrap);
