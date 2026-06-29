// js/main.js
import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage } from './i18n.js';
import { handleImageSelect, toggleVoiceRecording } from './media.js';

// ====================== FEED SWITCHING (Fixed Mapping) ======================
window.loadFeed = (feedType) => {
    console.log("🔄 Loading feed:", feedType);
    
    // Normalize feed types
    const feedMap = {
        'citizen': 'citizen-talk',
        'true': 'true-witness',
        'live': 'live'
    };
    const normalized = feedMap[feedType] || feedType;

    // Highlight active tab
    document.querySelectorAll('#main-nav button, .nav-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.feed === feedType) {
            btn.classList.add('active');
        }
    });

    const feedContainer = document.getElementById('feedContainer');
    if (feedContainer) {
        feedContainer.innerHTML = `<div class="py-12 text-center text-zinc-400">Loading ${normalized} feed...</div>`;
    }

    if (typeof initFeed === 'function') {
        initFeed(db, normalized);
    } else {
        console.error("❌ initFeed not available");
        showToast("Feed system not ready", "error");
    }
};

// ====================== OTHER UTILITIES ======================
window.goBack = () => {
    if (window.history.length > 1) window.history.back();
    else window.location.href = '/';
};

function attachUIListeners() {
    console.log("👂 UI Listeners Attached");

    // Direct button assignments (more reliable)
    const profileBtn = document.getElementById('btn-profile');
    if (profileBtn) {
        profileBtn.addEventListener('click', () => {
            console.log("Profile button clicked");
            window.showProfileSection();
        });
    }

    const guardianBtn = document.getElementById('btn-guardian');
    if (guardianBtn) {
        guardianBtn.addEventListener('click', () => {
            console.log("Guardian button clicked");
            document.getElementById('guardianModal')?.classList.remove('hidden');
        });
    }

    // Fallback event delegation
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;

        if (btn.id === 'btn-close-guardian') {
            document.getElementById('guardianModal')?.classList.add('hidden');
        }
    });
}
// ====================== BOOTSTRAP ======================
async function bootstrap() {
    console.log("🚀 Initializing VocalWitness...");
    try {
        await initAuth();
        initLanguage();
        attachUIListeners();

        // DEFAULT TO CITIZEN TALK
        let defaultFeed = 'citizen';
        const path = window.location.pathname;
        if (path.includes('true-witness')) defaultFeed = 'true';
        else if (path.includes('live-arena')) defaultFeed = 'live';
        
        window.loadFeed(defaultFeed);

        console.log("✅ VocalWitness Core Loaded Successfully | Default:", defaultFeed);
    } catch (error) {
        console.error("❌ Bootstrap failed:", error);
    }
}

// ====================== GLOBAL UI HANDLERS ======================
window.showProfileSection = () => {
    const modal = document.getElementById('profileModal');
    if (modal) {
        modal.classList.remove('hidden');
    } else {
        console.error("❌ Profile modal not found in DOM");
    }
};

window.closeProfile = () => {
    document.getElementById('profileModal')?.classList.add('hidden');
};

window.logout = () => {
    if (confirm("Sign out of VocalWitness?")) {
        showToast("Signed out successfully", "success");
        closeProfile();
    }
};
