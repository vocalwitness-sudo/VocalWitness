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
window.switchTab = async (tab) => {
    document.querySelectorAll('#main-nav button').forEach(btn => {
        btn.classList.remove('active', 'bg-amber-900', 'text-amber-300');
        if (btn.dataset.tab === tab) {
            btn.classList.add('active');
            if (tab === 'witness') btn.classList.add('bg-amber-900', 'text-amber-300');
        }
    });

    AppState.currentTab = tab;
    AppState.currentMode = tab === 'witness' ? 'witness' : 'citizen';

    if (tab === 'more') {
        window.showMoreMenu();
        return;
    }

    const container = document.getElementById('dynamicContainer');
    if (!container) {
        console.error("dynamicContainer not found!");
        return;
    }

    container.innerHTML = `
        <div class="text-center py-20">
            <div class="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full mx-auto"></div>
            <p class="mt-4 text-zinc-400">Loading ${tab}...</p>
        </div>`;

    try {
        if (tab === 'square' || tab === 'citizen') {
            container.innerHTML = `<div id="feedContainer" class="space-y-8"></div>`;
            initFeed(db, 'citizen-talk');
        } else if (tab === 'ledger') {
            container.innerHTML = `<div id="ledgerContainer" class="space-y-4 min-h-[400px]"></div>`;
            showToast("📜 Broadcast Ledger", "success");
        } else if (tab === 'arena') {
            container.innerHTML = `<h2 class="text-2xl font-bold text-center py-32 text-sky-400">🔴 Live Arena - Coming Soon</h2>`;
        } else if (tab === 'mycircle') {
            container.innerHTML = `<h2 class="text-2xl font-bold text-center py-32">🌐 My Network & Testimonies</h2>`;
        } else if (tab === 'witness') {
            container.innerHTML = `<h2 class="text-2xl font-bold text-amber-400 text-center py-32">🛡️ Witness Circle (ZK Protected)</h2>`;
        }
    } catch (e) {
        console.error("SwitchTab error:", e);
        container.innerHTML = `<p class="text-red-400 text-center py-20">Error loading content.</p>`;
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
    if (confirm("Logout?")) alert("Logged out (add real logic)");
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
        setTimeout(() => initFeed(db, 'citizen-talk'), 700);
    } catch (err) {
        console.error(err);
        showToast("Failed to publish.", "error");
    } finally {
        if (postBtn) {
            postBtn.disabled = false;
            postBtn.textContent = 'Publish to the Square';
        }
    }
};

// ====================== BOOTSTRAP ======================
async function bootstrap() {
    try {
        await initAuth();
        initLanguage();
        initProfile();
        initOnboarding?.();
        loadDynamicNavigation?.();

        engineInstance = new CitizenTalkEngine(db, storage);
        window.engineInstance = engineInstance;
        if (mediaModule.setEngine) mediaModule.setEngine(engineInstance);

        if (typeof applyTierTheme === 'function') applyTierTheme();
        if (typeof updateTierBadge === 'function') updateTierBadge();

        setupEventListeners();

        setTimeout(() => window.switchTab('square'), 600);
        console.log("✅ VocalWitness Live Ready");
    } catch (e) {
        console.error("Bootstrap failed:", e);
        console.log("✅ Event listeners should be attached now");
    }
}
        setupEventListeners();
        setTimeout(() => window.switchTab('square'), 600);
        console.log("✅ Event listeners should be attached now");
        console.log("✅ VocalWitness Live Ready");

    const profileBtn = document.getElementById('profile-btn');
    if (profileBtn) profileBtn.addEventListener('click', window.showProfile);

    const supportBtn = document.getElementById('support-btn');
    if (supportBtn) supportBtn.addEventListener('click', () => document.getElementById('supportModal')?.classList.remove('hidden'));

    const postBtn = document.getElementById('postButton');
    if (postBtn) postBtn.addEventListener('click', window.publishTestimony);
}

// Start
document.addEventListener('DOMContentLoaded', bootstrap);
