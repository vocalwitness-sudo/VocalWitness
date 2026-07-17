import './app-state.js';
import { initFeed } from './feed.js';
import { db, auth, storage } from './firebase-config.js';
import { initLanguage } from './i18n.js';
import { CitizenTalkEngine } from '../vocalWitnessEngine.js';
import { AppState } from './app-state.js';
import * as ledgerModule from './forensic-ledger.js';
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
            container.innerHTML = `<div id="ledgerContainer" class="space-y-4 min-h-[400px]"></div>`;
            setTimeout(() => ledgerModule.loadForensicLedger?.(), 100);
        } else if (tab === 'witness') {
            container.innerHTML = `<div id="trueWitnessContainer" class="space-y-6 p-8 text-center">
                <h2 class="text-3xl font-bold text-amber-400">🛡️ Witness Circle</h2>
                <p class="text-zinc-400 mt-4">ZK-Verified Testimonies - Coming Soon</p>
            </div>`;
        }
    } catch (e) {
        console.error("SwitchTab error:", e);
    }
};

// ====================== GLOBAL HELPERS ======================
window.showProfile = () => document.getElementById('profileModal')?.classList.remove('hidden');
window.closeProfile = () => document.getElementById('profileModal')?.classList.add('hidden');
window.logout = () => { if (confirm("Logout?")) showToast("Logged out", "info"); };

window.showMoreMenu = () => { /* your more menu code */ };

// ====================== PUBLISH TESTIMONY (FIXED) ======================
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
        const { collection, addDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js");
        
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
            imageHash: mediaData.imageHash || null,
            exif: mediaData.exif || null,
            hasForensic: !!(mediaData.imageHash || mediaData.exif)
        };

        await addDoc(collection(db, "testimonies"), testimonyData);
        
        showToast("✅ Testimony published!", "success");
        if (textarea) textarea.value = '';
        window.engineInstance?.clearPendingMedia?.();
        
    } catch (err) {
        console.error("Publish error:", err);
        showToast("Failed to publish.", "error");
    } finally {
        if (postBtn) {
            postBtn.disabled = false;
            postBtn.textContent = 'Publish to the Square';
        }
    }
};

// Light EXIF
async function getLightExif(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const dataView = new DataView(e.target.result);
                if (dataView.getUint16(0) === 0xFFD8) {
                    resolve({ hasExif: true, timestamp: new Date().toISOString() });
                } else resolve(null);
            } catch { resolve(null); }
        };
        reader.readAsArrayBuffer(file);
    });
}

// ====================== SETUP LISTENERS ======================
function setupEventListeners() {
    if (isInitialized) return;
    isInitialized = true;

    // Nav tabs
    document.querySelectorAll('#main-nav button[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => window.switchTab(btn.dataset.tab));
    });

    document.getElementById('profile-btn')?.addEventListener('click', window.showProfile);
    document.getElementById('support-btn')?.addEventListener('click', () => document.getElementById('supportModal')?.classList.remove('hidden'));
    document.getElementById('postButton')?.addEventListener('click', window.publishTestimony);

    // Forensic Photo
    const photoBtn = document.getElementById('btn-photo');
    if (photoBtn) photoBtn.addEventListener('click', () => { /* your full photo logic from earlier */ });

    // Voice
    const voiceBtn = document.getElementById('btn-voice');
    if (voiceBtn) voiceBtn.addEventListener('click', async () => { /* your full voice logic */ });

    console.log("✅ Listeners ready");
}

// ====================== BOOTSTRAP ======================
async function bootstrap() {
    if (isInitialized) return;
    console.log("🚀 Starting app...");

    setupEventListeners();
    if (typeof initLanguage === 'function') initLanguage();

    engineInstance = new CitizenTalkEngine(db, storage);
    window.engineInstance = engineInstance;

    setTimeout(() => window.switchTab('square'), 500);
}

document.addEventListener('DOMContentLoaded', bootstrap);
