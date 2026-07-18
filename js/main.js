// js/main.js - Full Expanded Version (Mandatory Login + Profile Fix)
import './app-state.js';
import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db, auth } from './firebase-config.js';
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

// ====================== PUBLISH TESTIMONY ======================
window.publishTestimony = async () => {
    if (!auth.currentUser) {
        showToast("Please sign in to publish a testimony", "error");
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
        
        showToast("✅ Testimony published successfully!", "success");
        
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

// ====================== LIGHT EXIF ======================
async function getLightExif(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const dataView = new DataView(e.target.result);
                if (dataView.getUint16(0) === 0xFFD8) {
                    resolve({ hasExif: true, timestamp: new Date().toISOString() });
                } else {
                    resolve(null);
                }
            } catch (err) {
                resolve(null);
            }
        };
        reader.readAsArrayBuffer(file);
    });
}

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
        showToast("Please sign in to view profile", "info");
        return;
    }
    initProfile();
    document.getElementById('profileModal')?.classList.remove('hidden');
};

window.closeProfile = () => document.getElementById('profileModal')?.classList.add('hidden');

// ====================== SETUP EVENT LISTENERS ======================
function setupEventListeners() {
    if (isInitialized) return;
    isInitialized = true;
    console.log("✅ Setting up all buttons...");

    // Navigation
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

    // Forensic Photo
    const photoBtn = document.getElementById('btn-photo');
    if (photoBtn) {
        photoBtn.addEventListener('click', () => {
            if (!auth.currentUser) {
                showToast("Please sign in to upload forensic photo", "info");
                return;
            }
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/jpeg, image/png, image/webp';
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                try {
                    const hash = await generateSha256Hash(file);
                    const reader = new FileReader();
                    reader.onload = async (ev) => {
                        const previewArea = document.getElementById('preview-area');
                        if (!previewArea) return;
                        previewArea.innerHTML = `
                            <div class="relative mt-4 rounded-2xl overflow-hidden border border-emerald-500/50">
                                <img src="${ev.target.result}" class="w-full max-h-64 object-cover" alt="Preview">
                                <div class="absolute bottom-2 left-2 bg-black/70 text-[10px] px-2 py-1 rounded font-mono text-emerald-400">
                                    ${hash.substring(0, 16)}...
                                </div>
                            </div>`;
                        if (window.engineInstance) window.engineInstance.setPendingImage?.(file, hash);
                    };
                    reader.readAsDataURL(file);
                } catch (err) {
                    showToast("Failed to process image", "error");
                }
            };
            input.click();
        });
    }

    // Voice Testimony
    const voiceBtn = document.getElementById('btn-voice');
    if (voiceBtn) {
        voiceBtn.addEventListener('click', () => {
            if (!auth.currentUser) {
                showToast("Please sign in to record voice testimony", "info");
                return;
            }
            if (!window.engineInstance) return showToast("Engine not ready", "error");
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
        await initAuth();                    // Important: Init auth first
        setupEventListeners();
        if (typeof initLanguage === 'function') initLanguage();
        
        engineInstance = new CitizenTalkEngine(db, storage);
        window.engineInstance = engineInstance;

        loadDynamicNavigation();
        setTimeout(() => window.switchTab('square'), 500);

        console.log("✅ Bootstrap finished - Please sign in");
    } catch (e) {
        console.error("Bootstrap error:", e);
    }
}

document.addEventListener('DOMContentLoaded', bootstrap);
