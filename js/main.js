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
import './composer.js';

// Firebase imports (moved to top level - better performance)
import { 
    collection, 
    addDoc, 
    serverTimestamp, 
    query, 
    getDocs, 
    limit 
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

let engineInstance = null;
let isInitialized = false;
let listenersInitialized = false;

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
            initFeed?.(db, 'citizen-talk');
        } 
        else if (tab === 'ledger') {
            container.innerHTML = `<div id="ledgerContainer" class="space-y-6"></div>`;
            loadEvidenceLedger();
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

window.refreshLedger = () => loadEvidenceLedger();

// ====================== PAYSTACK INTEGRATION ======================
window.initiatePayment = function(amount, email = null, metadata = {}) {
    if (!requireAuth("Sign in to support VocalWitness")) return;

    const handler = PaystackPop.setup({
        key: 'pk_test_xxxxxxxxxxxxxxxxxxxxxxxx', // ← Replace with your key (use env in production)
        email: email || auth.currentUser?.email || '',
        amount: amount * 100, // Convert to kobo
        currency: "NGN",
        metadata: { 
            source: "VocalWitness",
            userId: auth.currentUser?.uid,
            ...metadata 
        },
        onSuccess: (transaction) => {
            showToast(`✅ Payment successful! Ref: ${transaction.reference}`, "success");
            // TODO: Optionally save transaction record to Firestore
        },
        onCancel: () => showToast("Payment was cancelled", "info")
    });
    handler.openIframe();
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

    if (content.length > 2000) {
        showToast("Testimony is too long (max 2000 characters)", "error");
        return;
    }

    const postBtn = document.getElementById('postButton');
    if (postBtn) {
        if (postBtn.disabled) return;
        postBtn.disabled = true;
        postBtn.classList.add('publishing');
        postBtn.innerHTML = `
            <span class="flex items-center justify-center gap-3">
                <span class="animate-spin h-5 w-5 border-2 border-black border-t-transparent rounded-full"></span>
                Publishing to the Square...
            </span>
        `;
    }

    try {
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

        // Clear form
        if (textarea) textarea.value = '';
        mediaModule.resetMediaState?.();

        // Refresh feed
        initFeed?.(db, 'citizen-talk');

    } catch (err) {
        console.error("Publish error:", err);
        const msg = err.code === 'permission-denied' 
            ? "⚠️ Permission denied. Please check your Firestore security rules." 
            : "Failed to publish. Please try again.";
        showToast(msg, "error");
    } finally {
        if (postBtn) {
            postBtn.disabled = false;
            postBtn.classList.remove('publishing');
            postBtn.innerHTML = '🚀 Publish to the Square';
        }
    }
};

// ====================== EVIDENCE LEDGER ======================
async function loadEvidenceLedger() {
    const container = document.getElementById('ledgerContainer');
    if (!container) return;

    const wrapper = document.getElementById('ledgerTableWrapper') || 
                   (() => {
                       const div = document.createElement('div');
                       div.id = 'ledgerTableWrapper';
                       container.innerHTML = `
                           <div class="glass rounded-3xl p-8 border border-zinc-700/60 shadow-2xl">
                               <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8 pb-6 border-b border-zinc-800">
                                   <div>
                                       <h2 class="text-2xl font-bold text-white flex items-center gap-2">
                                           <span>📜</span> Cryptographic Evidence Ledger
                                       </h2>
                                       <p class="text-sm text-zinc-400 mt-1">Permanent, immutable record of public testimonies.</p>
                                   </div>
                                   <button onclick="window.refreshLedger()" class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-2xl text-xs font-medium text-emerald-400 transition flex items-center gap-2">
                                       🔄 Sync Ledger
                                   </button>
                               </div>
                               <div id="ledgerTableWrapper" class="overflow-x-auto"></div>
                           </div>`;
                       return div;
                   })();

    wrapper.innerHTML = `<div class="text-center py-16 text-zinc-500 animate-pulse">Loading ledger records...</div>`;

    try {
        const q = query(collection(db, "testimonies"), limit(20));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            wrapper.innerHTML = `
                <div class="text-center py-12 text-zinc-500">
                    <p class="text-base font-medium text-zinc-400">No forensic records found yet.</p>
                </div>`;
            return;
        }

        let html = `<table class="w-full text-left border-collapse">...`; // (your table code remains the same)
        // ... [Keep your existing table generation logic here] ...

        wrapper.innerHTML = html;

    } catch (err) {
        console.error("Ledger fetch error:", err);
        // Your existing error handling...
    }
}

// ====================== UTILITIES ======================
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ====================== SETUP EVENT LISTENERS ======================
function setupEventListeners() {
    if (listenersInitialized) return;
    listenersInitialized = true;

    console.log("✅ Setting up all buttons...");

    // Navigation
    document.querySelectorAll('#main-nav button[data-tab]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            window.switchTab(btn.dataset.tab);
        });
    });

    // === AUTH BUTTONS (Updated for Guest → Join flow) ===
    const guestActionBtn = document.getElementById('guest-action-btn');
    if (guestActionBtn) {
        guestActionBtn.addEventListener('click', () => {
            window.showAuthModal();   // New function from auth.js
        });
    }

    document.getElementById('profile-btn')?.addEventListener('click', window.showProfile);

    document.getElementById('support-btn')?.addEventListener('click', () => {
        document.getElementById('supportModal')?.classList.remove('hidden');
    });

    // Photo & Voice buttons (protected)
    const photoBtn = document.getElementById('btn-photo');
    if (photoBtn) {
        const newBtn = photoBtn.cloneNode(true);
        photoBtn.parentNode.replaceChild(newBtn, photoBtn);
        
        newBtn.addEventListener('click', () => {
            if (!requireAuth("Sign in to upload Forensic Photo")) return;
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/jpeg,image/png,image/webp';
            input.onchange = (e) => mediaModule.handleImageSelect?.(e, document.getElementById('preview-area'));
            input.click();
        });
    }
    // ==================== NAVIGATION TAB ACTIVE HIGHLIGHT ====================
document.addEventListener('DOMContentLoaded', () => {
    const navButtons = document.querySelectorAll('.nav-tab-btn'); // Make sure your buttons have this class, or adjust selector

    navButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Remove active classes from all nav buttons
            navButtons.forEach(b => {
                b.classList.remove('bg-emerald-600/20', 'border-emerald-500', 'text-white');
                b.classList.add('text-zinc-400'); // inactive text color
            });

            // Add active classes to the clicked button
            btn.classList.add('bg-emerald-600/20', 'border-emerald-500', 'text-white');
            btn.classList.remove('text-zinc-400');
        });
    });

    // Ensure Public Square is set as default active on load if none selected
    const defaultBtn = document.querySelector('[data-tab="square"]') || navButtons[0];
    if (defaultBtn && !document.querySelector('.nav-tab-btn.bg-emerald-600\\/20')) {
        defaultBtn.classList.add('bg-emerald-600/20', 'border-emerald-500', 'text-white');
        defaultBtn.classList.remove('text-zinc-400');
    }
});

    const voiceBtn = document.getElementById('btn-voice');
    voiceBtn?.addEventListener('click', () => {
        if (!requireAuth("Sign in to record Voice Testimony")) return;
        mediaModule.toggleVoiceRecording?.(voiceBtn);
    });

    // Publish button (protected)
    const postButton = document.getElementById('postButton');
    if (postButton) {
        postButton.addEventListener('click', window.publishTestimony);
    }

    console.log("✅ All major buttons wired successfully");
}
// ====================== BOOTSTRAP ======================
async function bootstrap() {
    if (isInitialized) return;
    isInitialized = true;
    console.log("🚀 VocalWitness Bootstrap started");

    try {
        await initAuth();
        updateUIForAuthState();
        setupEventListeners();
        
        initLanguage?.();
        initProfile?.();

        engineInstance = new CitizenTalkEngine(db, storage);
        window.engineInstance = engineInstance;
        mediaModule.setEngine(engineInstance);

        loadDynamicNavigation();
        
        setTimeout(() => window.switchTab('square'), 300);
        setTimeout(showWelcomeNote, 1200);

        console.log("✅ Bootstrap finished successfully");
    } catch (e) {
        console.error("Bootstrap error:", e);
        showToast("Failed to initialize app. Please refresh.", "error");
       
    }
}

document.addEventListener('DOMContentLoaded', bootstrap);
