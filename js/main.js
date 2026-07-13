// js/main.js - Final Clean Version
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

    if (tab === 'witness') {
        AppState.currentMode = 'witness';
        showToast("🔐 Witness Circle Mode", "success");
    } else {
        AppState.currentMode = 'citizen';
    }

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
    // Remove any existing dropdown
    const existing = document.getElementById('more-dropdown');
    if (existing) existing.remove();

    const dropdown = document.createElement('div');
    dropdown.id = 'more-dropdown';
    dropdown.className = 'fixed top-20 right-6 glass rounded-3xl shadow-2xl w-64 py-2 z-[150] border border-zinc-700';
    
    dropdown.innerHTML = `
        <div class="py-1">
            <a href="groups.html" class="flex items-center gap-3 px-6 py-3 hover:bg-zinc-800 text-white">
                👥 Groups
            </a>
            <a href="my-testimonies.html" class="flex items-center gap-3 px-6 py-3 hover:bg-zinc-800 text-white">
                📜 My Testimonies
            </a>
            <a href="about.html" class="flex items-center gap-3 px-6 py-3 hover:bg-zinc-800 text-white">
                ℹ️ About Us
            </a>
            <a href="privacy.html" class="flex items-center gap-3 px-6 py-3 hover:bg-zinc-800 text-white">
                🔒 Privacy
            </a>
            <a href="safety.html" class="flex items-center gap-3 px-6 py-3 hover:bg-zinc-800 text-white">
                🛡️ Safety
            </a>
            <a href="terms.html" class="flex items-center gap-3 px-6 py-3 hover:bg-zinc-800 text-white">
                📄 Terms
            </a>
        </div>
    `;

    document.body.appendChild(dropdown);

    // Close when clicking outside
    setTimeout(() => {
        document.addEventListener('click', function handler(e) {
            if (!dropdown.contains(e.target)) {
                dropdown.remove();
                document.removeEventListener('click', handler);
            }
        });
    }, 10);
};

// ====================== PUBLISH ======================
window.publishTestimony = async () => {
    const textarea = document.getElementById('mainInput');
    const content = textarea?.value.trim() || "";

    if (!content && !mediaModule.selectedImageFile && !engineInstance?.currentAudioBlob) {
        return showToast("Please add text, photo, or voice testimony", "error");
    }

    const postBtn = document.getElementById('postButton');
    postBtn.disabled = true;
    postBtn.textContent = 'Publishing to the Square...';

    try {
        const mediaData = await mediaModule.uploadForensicMedia();

        const { collection, addDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js");

        await addDoc(collection(db, "testimonies"), {
            authorId: auth.currentUser?.uid,
            author: auth.currentUser?.displayName || "Anonymous Witness",
            content: content,
            imageUrl: mediaData.imageUrl,
            audioUrl: mediaData.audioUrl,
            imageHash: mediaData.imageHash,
            audioHash: mediaData.audioHash,
            timestamp: serverTimestamp(),
            feedVisibility: AppState.currentMode === 'witness' ? "witness" : "citizen-talk",
            status: AppState.currentMode === 'witness' ? "verified" : "public"
        });

        await window.recordTestimonyContribution?.();

        showToast("✅ Testimony published successfully!", "success");

        // Reset
        textarea.value = '';
        mediaModule.resetMediaState();
        loadDynamicFeed(AppState.currentTab);

    } catch (err) {
        console.error("Publish error:", err);
        showToast("Failed to publish. Please try again.", "error");
    } finally {
        postBtn.disabled = false;
        postBtn.textContent = 'Publish to the Square';
    }
};

// ====================== BOOTSTRAP ======================
// ====================== BOOTSTRAP ======================
async function bootstrap() {
    try {
        await initAuth();
        initLanguage();
        initProfile();
        
        // Initialize core modules
        engineInstance = new CitizenTalkEngine(db, storage);
        window.engineInstance = engineInstance;
        mediaModule.setEngine(engineInstance);

        // Apply tier styling
        if (typeof applyTierTheme === 'function') applyTierTheme();
        if (typeof updateTierBadge === 'function') updateTierBadge();

        // Event listeners
        setupEventListeners();

        // Start with Citizen Square
        setTimeout(() => window.switchTab('square'), 600);

        console.log("✅ VocalWitness Live Ready");
    } catch (e) {
        console.error("Bootstrap failed:", e);
    }
}

function setupEventListeners() {
    // Media buttons
    document.getElementById('btn-photo')?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (ev) => {
            mediaModule.handleImageSelect(ev, document.getElementById('preview-area'));
        };
        input.click();
    });

    document.getElementById('btn-voice')?.addEventListener('click', (e) => 
        mediaModule.toggleVoiceRecording(e.currentTarget)
    );

    // Publish button
    document.getElementById('postButton')?.addEventListener('click', window.publishTestimony);

    // Top bar buttons
    document.getElementById('profile-btn')?.addEventListener('click', () => {
        if (typeof window.showProfile === 'function') {
            window.showProfile();
        } else {
            showToast("Opening Profile...", "info");
        }
    });

    document.getElementById('support-btn')?.addEventListener('click', () => {
        showToast("Support & Help Center coming soon", "info");
    });

    // Language selector
    const langSelector = document.getElementById('languageSelector');
    if (langSelector) {
        langSelector.addEventListener('change', (e) => {
            // You can expand this with your i18n system
            showToast(`Language changed to ${e.target.value}`, "success");
        });
    }
}

document.addEventListener('DOMContentLoaded', bootstrap);

// Temporary fallback
window.showGroupCreationModal = () => {
    showToast("Group creation is being set up...", "info");
};
