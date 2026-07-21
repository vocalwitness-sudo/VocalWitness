// js/main.js - Polished & Robust Main Entry Point
import './app-state.js';
import { initAuth, requireAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db, auth, storage } from './firebase-config.js';
import { initLanguage } from './i18n.js';
import * as mediaModule from './media.js';
import { CitizenTalkEngine } from '../vocalWitnessEngine.js';
import { initProfile } from './profile.js';
import { loadDynamicNavigation } from './navigation.js';
import { AppState } from './app-state.js';
import { showToast } from './utils.js';
import './compose.js';

let engineInstance = null;
let isInitialized = false;

// ====================== TAB SWITCHING ======================
window.switchTab = async (tab) => {
    console.log(`Switching to tab: ${tab}`);

    // Update active tab UI
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

    // Show loading state
    container.innerHTML = `<div class="text-center py-20 text-zinc-400">Loading ${tab}...</div>`;

    try {
        if (tab === 'square' || tab === 'citizen') {
            container.innerHTML = `<div id="feedContainer" class="space-y-8"></div>`;
            if (typeof initFeed === 'function') {
                initFeed(db, 'citizen-talk');
            } else {
                container.innerHTML = `<div class="p-8 text-center text-amber-400">Public Square feed coming soon...</div>`;
            }
        } 
        else if (tab === 'ledger') {
            container.innerHTML = `<div id="ledgerContainer" class="space-y-6"></div>`;
            if (typeof loadEvidenceLedger === 'function') {
                loadEvidenceLedger();
            } else {
                container.innerHTML = `<div class="p-8 text-center text-zinc-400">Evidence Ledger coming soon...</div>`;
            }
        } 
        else if (tab === 'witness') {
            container.innerHTML = `
                <div class="space-y-6 p-8 text-center">
                    <h2 class="text-3xl font-bold text-amber-400">🛡️ Verified Witnesses</h2>
                    <p class="text-zinc-400">ZK-Verified Testimonies</p>
                </div>`;
        } 
        else if (tab === 'arena' || tab === 'mycircle') {
            container.innerHTML = `<div class="p-8 text-center text-zinc-400">This section is under construction</div>`;
        }
    } catch (e) {
        console.error("Tab switch error:", e);
        container.innerHTML = `<div class="text-red-400 text-center py-8">Failed to load tab. Please try again.</div>`;
    }
};

// ====================== WELCOME NOTE ======================
function showWelcomeNote() {
    if (!auth.currentUser || localStorage.getItem('hasSeenWelcome')) return;
    showToast("🎉 Welcome to VocalWitness! Your voice matters in the Public Square.", "success");
    localStorage.setItem('hasSeenWelcome', 'true');
}

// ====================== PUBLISH TESTIMONY ======================
window.publishTestimony = async () => {
    if (!requireAuth("Please sign in to share your testimony in the Public Square.")) return;

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
        
        // Refresh feed
        if (typeof initFeed === 'function') initFeed(db, 'citizen-talk');
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

// ====================== HELPERS ======================
async function loadEvidenceLedger() {
    const container = document.getElementById('ledgerContainer');
    if (!container) return;
    container.innerHTML = `<div class="text-center py-12 text-zinc-400">Evidence Ledger coming soon...</div>`;
}

window.refreshLedger = loadEvidenceLedger;

window.showProfile = () => {
    if (!auth.currentUser) {
        showToast("Please sign in to access your Profile", "info");
        return;
    }
    const modal = document.getElementById('profileModal');
    if (modal) {
        modal.classList.remove('hidden');
        if (typeof initProfile === 'function') initProfile();
    }
};

window.closeProfile = () => {
    const modal = document.getElementById('profileModal');
    if (modal) modal.classList.add('hidden');
};

// ====================== SETUP EVENT LISTENERS ======================
function setupEventListeners() {
    if (isInitialized) return;
    isInitialized = true;

    console.log("✅ Setting up all buttons...");

    // Navigation tabs
    document.querySelectorAll('#main-nav button[data-tab]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            window.switchTab(btn.dataset.tab);
        });
    });

    // Profile button
    document.getElementById('profile-btn')?.addEventListener('click', window.showProfile);

    // Support button
    document.getElementById('support-btn')?.addEventListener('click', () => {
        const modal = document.getElementById('supportModal');
        if (modal) modal.classList.remove('hidden');
        else showToast("Support page coming soon", "info");
    });

    // Sign-in button
    document.getElementById('signin-btn')?.addEventListener('click', () => {
        const modal = document.getElementById('loginModal');
        if (modal) modal.classList.remove('hidden');
    });

    // Forensic Photo
    document.getElementById('btn-photo')?.addEventListener('click', () => {
        if (!requireAuth("Sign in to upload Forensic Photo")) return;
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/jpeg,image/png,image/webp';
        input.onchange = (e) => {
            const previewArea = document.getElementById('preview-area');
            if (previewArea && typeof mediaModule.handleImageSelect === 'function') {
                mediaModule.handleImageSelect(e, previewArea);
            }
        };
        input.click();
    });

    // Voice Testimony
    document.getElementById('btn-voice')?.addEventListener('click', () => {
        if (!requireAuth("Sign in to record Voice Testimony")) return;
        if (typeof mediaModule.toggleVoiceRecording === 'function') {
            mediaModule.toggleVoiceRecording(document.getElementById('btn-voice'));
        }
    });

    // Publish button
    document.getElementById('postButton')?.addEventListener('click', window.publishTestimony);

    console.log("✅ All major buttons wired successfully");
}

// ====================== BOOTSTRAP ======================
async function bootstrap() {
    if (isInitialized) return;
    console.log("🚀 VocalWitness Bootstrap started");

    try {
        await initAuth();
        setupEventListeners();
        
        if (typeof initLanguage === 'function') initLanguage();

        // Initialize Engine
        engineInstance = new CitizenTalkEngine(db, storage);
        window.engineInstance = engineInstance;
        mediaModule.setEngine(engineInstance);

        loadDynamicNavigation();
        
        // Default to Public Square
        setTimeout(() => window.switchTab('square'), 300);
        setTimeout(showWelcomeNote, 1200);

        console.log("✅ Bootstrap finished successfully");
    } catch (e) {
        console.error("Bootstrap error:", e);
        showToast("Failed to initialize app. Please refresh.", "error");
    }
}

document.addEventListener('DOMContentLoaded', bootstrap);
