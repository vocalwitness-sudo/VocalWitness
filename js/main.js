// js/main.js - Clean Orchestrator Version
import './app-state.js';
import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db, auth, storage } from './firebase-config.js';
import { initLanguage } from './i18n.js';
import * as mediaModule from './media.js';
import { CitizenTalkEngine } from '../vocalWitnessEngine.js';
import { initProfile } from './profile.js';
import { loadDynamicNavigation } from './navigation.js';
import { applyTierTheme, updateTierBadge } from './tier.js';
import { AppState } from './app-state.js';
import { showToast } from './utils.js';

// Global engine reference
let engineInstance = null;
let isInitialized = false;

// ====================== TAB SWITCHING ======================
window.switchTab = async (tab) => {
    console.log(`Switching to tab: ${tab}`);
    
    // Update active nav buttons
    document.querySelectorAll('#main-nav button[data-tab]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
        btn.classList.toggle('bg-amber-900', btn.dataset.tab === 'witness' && btn.dataset.tab === tab);
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

// ====================== PUBLISH TESTIMONY (Main Action Worker) ======================
window.publishTestimony = async () => {
    const textarea = document.getElementById('mainInput');
    const content = textarea?.value.trim();
    
    if (!content) {
        showToast("Please write a testimony", "error");
        return;
    }

    const postBtn = document.getElementById('postButton');
    const originalBtnText = postBtn?.textContent;

    if (postBtn) {
        postBtn.disabled = true;
        postBtn.textContent = 'Publishing...';
    }

    try {
        const { collection, addDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js");
        
        // Get media from engine + upload
        const mediaData = await mediaModule.uploadForensicMedia();
        
        const testimonyData = {
            authorId: auth.currentUser?.uid || "anonymous",
            author: auth.currentUser?.displayName || "Anonymous Witness",
            content,
            createdAt: serverTimestamp(),
            timestamp: Date.now(),
            isPublic: true,
            moderationStatus: "approved",
            feedVisibility: "citizen-talk",
            ...mediaData,
            hasForensic: !!(mediaData.imageHash || mediaData.audioHash)
        };

        await addDoc(collection(db, "testimonies"), testimonyData);
        
        showToast("✅ Testimony published to the Square!", "success");
        
        // Reset form
        if (textarea) textarea.value = '';
        mediaModule.resetMediaState();
        window.engineInstance?.clearPendingMedia?.();

    } catch (err) {
        console.error("Publish error:", err);
        showToast("Failed to publish. Please try again.", "error");
    } finally {
        if (postBtn) {
            postBtn.disabled = false;
            postBtn.textContent = originalBtnText || '🚀 Publish to the Square';
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
            <button onclick="refreshLedger()" 
                    class="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-2xl text-sm flex items-center gap-2">
                🔄 Refresh
            </button>
        </div>
        <div id="ledgerEntries" class="space-y-4"></div>
    `;

    if (typeof loadForensicLedger === 'function') {
        loadForensicLedger();
    }
}

window.refreshLedger = () => {
    if (typeof loadForensicLedger === 'function') loadForensicLedger();
};

// ====================== SETUP EVENT LISTENERS (UI Workers) ======================
function setupEventListeners() {
    if (isInitialized) return;
    isInitialized = true;

    console.log("✅ Setting up event listeners...");

    // Navigation Tabs
    document.querySelectorAll('#main-nav button[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => window.switchTab(btn.dataset.tab));
    });

    // Profile & Support
    document.getElementById('profile-btn')?.addEventListener('click', window.showProfile);
    document.getElementById('support-btn')?.addEventListener('click', () => {
        document.getElementById('supportModal')?.classList.remove('hidden');
    });

    // Publish Button
    document.getElementById('postButton')?.addEventListener('click', window.publishTestimony);

    // Media Buttons - Delegated to media module
    const photoBtn = document.getElementById('btn-photo');
    if (photoBtn) photoBtn.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/jpeg,image/png,image/webp';
        input.onchange = (e) => mediaModule.handleImageSelect(e, document.getElementById('preview-area'));
        input.click();
    });

    const voiceBtn = document.getElementById('btn-voice');
    if (voiceBtn) {
        voiceBtn.addEventListener('click', () => {
            mediaModule.toggleVoiceRecording(voiceBtn);
        });
    }

    console.log("✅ All major UI workers attached");
}

// ====================== BOOTSTRAP ======================
async function bootstrap() {
    if (isInitialized) return;
    console.log("🚀 VocalWitness Bootstrap started");

    try {
        setupEventListeners();
        if (typeof initLanguage === 'function') initLanguage();
        
        // Initialize core engine
        engineInstance = new CitizenTalkEngine(db, storage);
        window.engineInstance = engineInstance;
        
        // Initialize navigation
        loadDynamicNavigation();

        // Default to Public Square
        setTimeout(() => window.switchTab('square'), 300);

        console.log("✅ VocalWitness initialized successfully");
    } catch (e) {
        console.error("Bootstrap error:", e);
        showToast("Failed to initialize app", "error");
    }
}

document.addEventListener('DOMContentLoaded', bootstrap);
