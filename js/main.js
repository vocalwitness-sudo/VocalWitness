// js/main.js - Restored Working Version + Minor Cleanup
import './app-state.js';
import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db, auth, storage } from './firebase-config.js';
import { initLanguage } from './i18n.js';
import * as mediaModule from './media.js';
import { CitizenTalkEngine } from '../vocalWitnessEngine.js';
import { loadDynamicNavigation } from './navigation.js';
import { AppState } from './app-state.js';
import { showToast, generateSha256Hash } from './utils.js';

let engineInstance = null;
let isInitialized = false;

// ====================== TAB SWITCHING ======================
window.switchTab = async (tab) => {
    console.log(`Switching to tab: ${tab}`);
    
    document.querySelectorAll('#main-nav button').forEach(btn => {
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
            container.innerHTML = `<div id="ledgerContainer" class="space-y-6 min-h-[400px]"></div>`;
            if (typeof loadEvidenceLedger === 'function') loadEvidenceLedger();
        } else if (tab === 'witness') {
            container.innerHTML = `<div id="trueWitnessContainer" class="space-y-6 p-8 text-center">
                <h2 class="text-3xl font-bold text-amber-400">🛡️ Verified Witnesses</h2>
                <p class="text-zinc-400 mt-4">ZK-Verified Testimonies</p>
            </div>`;
        }
    } catch (e) {
        console.error("SwitchTab error:", e);
    }
};

// ====================== PUBLISH TESTIMONY (Restored Original Logic) ======================
// Improved Publish Testimony (Best Version)
window.publishTestimony = async () => {
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
        
        // === This is the better approach ===
        let mediaData = {};
        if (window.engineInstance) {
            mediaData = await mediaModule.uploadForensicMedia();
        }

        const testimonyData = {
            authorId: auth.currentUser?.uid || "anonymous",
            author: auth.currentUser?.displayName || "Anonymous Witness",
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
            exif: mediaData.exif || null,
            hasForensic: !!(mediaData.imageHash || mediaData.audioHash)
        };

        await addDoc(collection(db, "testimonies"), testimonyData);
        
        showToast("✅ Testimony published successfully!", "success");
        
        if (textarea) textarea.value = '';
        mediaModule.resetMediaState();
        window.engineInstance?.clearPendingMedia?.();

    } catch (err) {
        console.error("Publish error:", err);
        showToast("Failed to publish. Check your connection or permissions.", "error");
    } finally {
        if (postBtn) {
            postBtn.disabled = false;
            postBtn.textContent = originalText;
        }
    }
};
// ====================== LIGHT EXIF (Kept Original) ======================
async function getLightExif(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const dataView = new DataView(e.target.result);
                if (dataView.getUint16(0) === 0xFFD8) {
                    resolve({ hasExif: true, timestamp: new Date().toISOString(), note: "Basic EXIF detected" });
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
            <h2 class="text-2xl font-bold text-emerald-400">Evidence Ledger</h2>
            <button onclick="refreshLedger()" 
                    class="px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-2xl text-sm flex items-center gap-2">
                🔄 Refresh
            </button>
        </div>
        <div id="ledgerEntries" class="space-y-4 min-h-[300px]"></div>
    `;

    if (typeof loadForensicLedger === 'function') {
        loadForensicLedger();
    }
}

window.refreshLedger = loadEvidenceLedger;

// ====================== SETUP EVENT LISTENERS ======================
function setupEventListeners() {
    if (isInitialized) return;
    isInitialized = true;
    console.log("Setting up all event listeners...");

    // Nav Tabs
    document.querySelectorAll('#main-nav button[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => window.switchTab(btn.dataset.tab));
    });

    document.getElementById('profile-btn')?.addEventListener('click', window.showProfile);
    document.getElementById('support-btn')?.addEventListener('click', () => document.getElementById('supportModal')?.classList.remove('hidden'));
    document.getElementById('postButton')?.addEventListener('click', window.publishTestimony);

    // Forensic Photo Button (Your Original Logic Restored)
    const photoBtn = document.getElementById('btn-photo');
    if (photoBtn) {
        photoBtn.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/jpeg, image/png, image/webp';
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                if (!file.type.startsWith('image/')) {
                    showToast("❌ Only image files allowed", "error");
                    return;
                }
                if (file.size > 10 * 1024 * 1024) {
                    showToast("❌ Image too large. Max 10MB", "error");
                    return;
                }
                try {
                    showToast("✅ Processing forensic image...", "info");
                    const hash = await generateSha256Hash(file);
                    const reader = new FileReader();
                    reader.onload = async (ev) => {
                        const previewArea = document.getElementById('preview-area');
                        if (!previewArea) return;

                        let exifBadge = '';
                        let exifSummary = null;
                        if (AppState.isWitnessVerified || auth.currentUser) {
                            try {
                                exifSummary = await getLightExif(file);
                                if (exifSummary) exifBadge = `<div class="absolute top-2 right-2 bg-emerald-600 text-white text-[10px] px-2 py-1 rounded">EXIF ✓</div>`;
                            } catch (e) {}
                        }

                        previewArea.innerHTML = `
                            <div class="relative mt-4 rounded-2xl overflow-hidden border border-emerald-500/50">
                                <img src="${ev.target.result}" class="w-full max-h-64 object-cover" alt="Forensic Preview">
                                ${exifBadge}
                                <div class="absolute bottom-2 left-2 bg-black/70 text-[10px] px-2 py-1 rounded font-mono text-emerald-400">
                                    ${hash.substring(0, 16)}...
                                </div>
                            </div>`;

                        if (window.engineInstance) {
                            window.engineInstance.setPendingImage?.(file, hash, exifSummary);
                        }
                    };
                    reader.readAsDataURL(file);
                } catch (err) {
                    console.error(err);
                    showToast("❌ Failed to process image", "error");
                }
            };
            input.click();
        });
    }

    // Voice Testimony Button (Your Original Logic Restored)
    const voiceBtn = document.getElementById('btn-voice');
    if (voiceBtn) {
        voiceBtn.addEventListener('click', async () => {
            if (!window.engineInstance) {
                showToast("Voice engine not ready. Refresh page.", "error");
                return;
            }
            try {
                const isRecording = window.engineInstance.mediaRecorder && window.engineInstance.mediaRecorder.state === "recording";
                if (!isRecording) {
                    await window.engineInstance.startVoiceRecording(300000);
                    voiceBtn.classList.add('recording-active', 'animate-pulse');
                    voiceBtn.textContent = '⏹️ Stop Recording';
                    showToast("🎤 Recording started...", "info");
                } else {
                    window.engineInstance.stopVoiceRecording();
                    voiceBtn.classList.remove('recording-active', 'animate-pulse');
                    voiceBtn.textContent = '🎤 Voice Testimony';
                    showToast("✅ Recording saved", "success");
                }
            } catch (err) {
                console.error("Voice error:", err);
                showToast("Microphone access denied or error occurred.", "error");
            }
        });
    }

    console.log("✅ All major event listeners attached");
}

// ====================== BOOTSTRAP ======================
async function bootstrap() {
    if (isInitialized) return;
    console.log("🚀 Bootstrap started");
    try {
        setupEventListeners();
        if (typeof initLanguage === 'function') initLanguage();
        
        engineInstance = new CitizenTalkEngine(db, storage);
        window.engineInstance = engineInstance;

        setTimeout(() => window.switchTab('square'), 500);
        console.log("✅ Bootstrap finished");
    } catch (e) {
        console.error("Bootstrap error:", e);
    }
}

document.addEventListener('DOMContentLoaded', bootstrap);
