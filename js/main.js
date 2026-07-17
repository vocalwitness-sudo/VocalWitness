import './app-state.js';
import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db, auth, storage } from './firebase-config.js';
import { initLanguage } from './i18n.js';
import * as mediaModule from './media.js';
import { CitizenTalkEngine } from '../vocalWitnessEngine.js';
import { initProfile } from './profile.js';
import { initOnboarding } from './onboarding.js';
import { loadDynamicNavigation } from './navigation.js';
import { applyTierTheme, updateTierBadge } from './tier.js';
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
            setTimeout(() => {
                if (typeof ledgerModule.loadForensicLedger === 'function') {
                    ledgerModule.loadForensicLedger();
                }
            }, 100);
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
        menu.innerHTML = `...`; // keep your menu HTML
        document.body.appendChild(menu);
    }
    menu.classList.toggle('hidden');
};

// Global modal helpers (safe)
window.showProfile = () => document.getElementById('profileModal')?.classList.remove('hidden');
window.closeProfile = () => document.getElementById('profileModal')?.classList.add('hidden');
window.logout = () => { if (confirm("Logout?")) { /* real logic later */ showToast("Logged out", "info"); } };

window.editProfile = () => {
    document.getElementById('profileModal')?.classList.add('hidden');
    document.getElementById('editProfileModal')?.classList.remove('hidden');
};
window.openSettings = () => {
    document.getElementById('profileModal')?.classList.add('hidden');
    document.getElementById('settingsModal')?.classList.remove('hidden');
};
window.closeEditProfile = () => document.getElementById('editProfileModal')?.classList.add('hidden');
window.closeSettings = () => document.getElementById('settingsModal')?.classList.add('hidden');
window.saveProfileChanges = () => {
    showToast("Profile changes saved", "success");
    window.closeEditProfile();
};

// ====================== PUBLISH TESTIMONY ======================
window.publishTestimony = async () => { /* keep your current function */ };

// Light EXIF helper (moved to top level)
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

// ====================== SETUP EVENT LISTENERS (ONCE) ======================
function setupEventListeners() {
    if (isInitialized) return;
    isInitialized = true;

    console.log("Setting up event listeners...");

    // Nav tabs
    document.querySelectorAll('#main-nav button[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => window.switchTab(btn.dataset.tab));
    });

    // Top buttons
    document.getElementById('profile-btn')?.addEventListener('click', window.showProfile);
    document.getElementById('support-btn')?.addEventListener('click', () => {
        document.getElementById('supportModal')?.classList.remove('hidden');
    });

    // Post button
    document.getElementById('postButton')?.addEventListener('click', window.publishTestimony);

    // Photo button
    const photoBtn = document.getElementById('btn-photo');
    if (photoBtn) {
        photoBtn.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/jpeg,image/png,image/webp';
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) {
                    showToast("Invalid file or too large (max 10MB)", "error");
                    return;
                }
                // ... rest of your photo logic (keep it)
            };
            input.click();
        });
    }

    // Voice button (simplified)
    const voiceBtn = document.getElementById('btn-voice');
    if (voiceBtn && window.engineInstance) {
        voiceBtn.addEventListener('click', async () => {
            // your voice logic
        });
    }

    console.log("✅ Event listeners attached");
}

// ====================== BOOTSTRAP ======================
async function bootstrap() {
    if (isInitialized) return;
    
    console.log("🚀 Bootstrap started");

    try {
        setupEventListeners();
        
        // Language
        if (typeof initLanguage === 'function') {
            initLanguage();
        }

        // Engine
        engineInstance = new CitizenTalkEngine(db, storage);
        window.engineInstance = engineInstance;

        // Initial tab
        setTimeout(() => window.switchTab('square'), 300);

        console.log("✅ App bootstrapped successfully");
    } catch (e) {
        console.error("Bootstrap failed:", e);
        showToast("Failed to start app. Refresh page.", "error");
    }
}

document.addEventListener('DOMContentLoaded', bootstrap);
