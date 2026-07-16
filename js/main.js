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

// Import ledger (you can add more later)
import * as ledgerModule from './forensic-ledger.js';

let engineInstance = null;

// ====================== TAB SWITCHING ======================
window.switchTab = async (tab) => {
    console.log(`Switching to tab: ${tab}`);

    // Update active styles
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
            if (typeof ledgerModule.loadForensicLedger === 'function') {
                ledgerModule.loadForensicLedger();
            }

        } else if (tab === 'witness') {
            container.innerHTML = `<div id="trueWitnessContainer" class="space-y-6 p-8 text-center">
                <h2 class="text-3xl font-bold text-amber-400">🛡️ Witness Circle</h2>
                <p class="text-zinc-400 mt-4">ZK-Verified Testimonies - Coming Soon</p>
            </div>`;

        } else if (tab === 'arena') {
            container.innerHTML = `<h2 class="text-2xl font-bold text-center py-32 text-sky-400">🔴 Live Arena - Coming Soon</h2>`;

        } else if (tab === 'mycircle') {
            container.innerHTML = `<h2 class="text-2xl font-bold text-center py-32">📜 My Network & Testimonies</h2>`;
        } else if (tab === 'more') {
            window.showMoreMenu();
            return;
        }
    } catch (e) {
        console.error("SwitchTab error:", e);
        container.innerHTML = `<p class="text-red-400 text-center py-20">Failed to load tab.</p>`;
    }
};

// ====================== MORE MENU ======================
window.showMoreMenu = () => {
    let menu = document.getElementById('moreDropdown');
    if (!menu) {
        menu = document.createElement('div');
        menu.id = 'moreDropdown';
        menu.className = 'fixed top-20 right-6 glass rounded-3xl p-5 w-64 shadow-2xl z-[100] border border-zinc-700';
        menu.innerHTML = `
            <div class="flex flex-col gap-2 text-sm font-medium">
                <a href="about.html" class="flex items-center gap-3 px-4 py-3 hover:bg-zinc-800 rounded-2xl transition-colors">ℹ️ About VocalWitness</a>
                <a href="safety.html" class="flex items-center gap-3 px-4 py-3 hover:bg-zinc-800 rounded-2xl transition-colors">🛡️ Safety Center</a>
                <a href="terms.html" class="flex items-center gap-3 px-4 py-3 hover:bg-zinc-800 rounded-2xl transition-colors">📜 Terms</a>
                <a href="privacy.html" class="flex items-center gap-3 px-4 py-3 hover:bg-zinc-800 rounded-2xl transition-colors">🔒 Privacy</a>
                <a href="moderation.html" class="flex items-center gap-3 px-4 py-3 hover:bg-zinc-800 rounded-2xl transition-colors">⚖️ Moderation</a>
                <a href="admin.html" class="flex items-center gap-3 px-4 py-3 hover:bg-zinc-800 rounded-2xl transition-colors">🛠️ Admin</a>
                <hr class="my-2 border-zinc-700">
                <button onclick="logout()" class="flex items-center gap-3 px-4 py-3 hover:bg-red-900/50 text-red-400 rounded-2xl transition-colors text-left w-full">⬅️ Logout</button>
            </div>
        `;
        document.body.appendChild(menu);
    }
    menu.classList.toggle('hidden');
};

// ====================== GLOBAL MODAL FUNCTIONS ======================
window.showProfile = () => document.getElementById('profileModal').classList.remove('hidden');
window.closeProfile = () => document.getElementById('profileModal').classList.add('hidden');
window.logout = () => {
    if (confirm("Logout?")) {
        alert("Logged out (add real logic later)");
    }
};

// ====================== PROFILE & SETTINGS FUNCTIONS ======================
window.editProfile = () => {
    const editModal = document.getElementById('editProfileModal');
    const profileModal = document.getElementById('profileModal');
    
    if (profileModal) profileModal.classList.add('hidden');
    if (editModal) editModal.classList.remove('hidden');
    
    // TODO: Load current user data here later
};

window.openSettings = () => {
    const settingsModal = document.getElementById('settingsModal');
    const profileModal = document.getElementById('profileModal');
    
    if (profileModal) profileModal.classList.add('hidden');
    if (settingsModal) settingsModal.classList.remove('hidden');
};

window.closeEditProfile = () => {
    document.getElementById('editProfileModal')?.classList.add('hidden');
};

window.closeSettings = () => {
    document.getElementById('settingsModal')?.classList.add('hidden');
};

window.saveProfileChanges = () => {
    showToast("Profile changes saved (demo)", "success");
    window.closeEditProfile();
};


// ====================== PUBLISH TESTIMONY ======================
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
        };

        const docRef = await addDoc(collection(db, "testimonies"), testimonyData);
        
        showToast("✅ Testimony published!", "success");
        
        if (textarea) textarea.value = '';
        if (window.engineInstance?.clearPendingMedia) window.engineInstance.clearPendingMedia();

        // Refresh feed if on square tab
        setTimeout(() => initFeed(db, 'citizen-talk'), 700);
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

// ====================== SETUP EVENT LISTENERS ======================
function setupEventListeners() {
    console.log("Setting up all event listeners...");

    // ==================== MAIN NAV TABS ====================
    document.querySelectorAll('#main-nav button[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            console.log(`Tab clicked: ${tab}`);
            window.switchTab(tab);
        });
    });

    // ==================== TOP RIGHT BUTTONS ====================
    const profileBtn = document.getElementById('profile-btn');
    if (profileBtn) {
        profileBtn.addEventListener('click', window.showProfile);
    }

    const supportBtn = document.getElementById('support-btn');
    if (supportBtn) {
        supportBtn.addEventListener('click', () => {
            document.getElementById('supportModal')?.classList.remove('hidden');
        });
    }

    // Language Selector (if you have logic)
    const languageSelector = document.getElementById('languageSelector');
    if (languageSelector) {
        languageSelector.addEventListener('change', (e) => {
            console.log("Language changed to:", e.target.value);
            // Call your i18n function here later
        });
    }

    // ==================== COMPOSER BUTTONS ====================
    const postBtn = document.getElementById('postButton');
    if (postBtn) {
        postBtn.addEventListener('click', window.publishTestimony);
    }

    const photoBtn = document.getElementById('btn-photo');
    if (photoBtn) {
        photoBtn.addEventListener('click', () => showToast("📸 Forensic Photo clicked", "info"));
    }

    const voiceBtn = document.getElementById('btn-voice');
    if (voiceBtn) {
        voiceBtn.addEventListener('click', () => showToast("🎤 Voice Testimony clicked", "info"));
    }

    console.log("✅ All major event listeners attached successfully");
}
// ====================== BOOTSTRAP ======================
async function bootstrap() {
    console.log("🚀 Bootstrap started - MINIMAL");

    // Force attach listeners immediately
    setupEventListeners();

    // Minimal initial load
    setTimeout(() => {
        console.log("Loading initial tab...");
        window.switchTab('square');
    }, 500);

    console.log("✅ Minimal bootstrap finished");
}
// Start the app
document.addEventListener('DOMContentLoaded', bootstrap);
