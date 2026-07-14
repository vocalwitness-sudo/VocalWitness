// js/main.js - Final Clean Version for Public Launch
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
    const existing = document.getElementById('more-dropdown');
    if (existing) existing.remove();

    const dropdown = document.createElement('div');
    dropdown.id = 'more-dropdown';
    dropdown.className = 'fixed top-20 right-6 glass rounded-3xl shadow-2xl w-64 py-2 z-[150] border border-zinc-700';

    dropdown.innerHTML = `
        <div class="py-1">
            <a href="groups.html" class="flex items-center gap-3 px-6 py-3 hover:bg-zinc-800 text-white">👥 Groups</a>
            <a href="my-testimonies.html" class="flex items-center gap-3 px-6 py-3 hover:bg-zinc-800 text-white">📜 My Testimonies</a>
            <a href="about.html" class="flex items-center gap-3 px-6 py-3 hover:bg-zinc-800 text-white">ℹ️ About Us</a>
            <a href="privacy.html" class="flex items-center gap-3 px-6 py-3 hover:bg-zinc-800 text-white">🔒 Privacy</a>
            <a href="safety.html" class="flex items-center gap-3 px-6 py-3 hover:bg-zinc-800 text-white">🛡️ Safety</a>
            <a href="terms.html" class="flex items-center gap-3 px-6 py-3 hover:bg-zinc-800 text-white">📄 Terms</a>
        </div>
    `;

    document.body.appendChild(dropdown);

    setTimeout(() => {
        const closeHandler = (e) => {
            if (!dropdown.contains(e.target)) {
                dropdown.remove();
                document.removeEventListener('click', closeHandler);
            }
        };
        document.addEventListener('click', closeHandler);
    }, 100);
};

// ====================== PUBLISH ======================
window.publishTestimony = async () => {
    const textarea = document.getElementById('mainInput');
    const content = textarea?.value.trim() || "";

    if (!content && !mediaModule.selectedImageFile && !engineInstance?.currentAudioBlob) {
        return showToast("Please add text, photo, or voice testimony", "error");
    }

    const postBtn = document.getElementById('postButton');
    if (postBtn) {
        postBtn.disabled = true;
        postBtn.textContent = 'Publishing to the Square...';
    }

    try {
        const mediaData = await mediaModule.uploadForensicMedia();

        const { collection, addDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js");

        const testimonyData = {
            authorId: auth.currentUser?.uid,
            author: auth.currentUser?.displayName || "Anonymous Witness",
            content: content,
            imageUrl: mediaData?.imageUrl || null,
            audioUrl: mediaData?.audioUrl || null,
            imageHash: mediaData?.imageHash || null,
            audioHash: mediaData?.audioHash || null,
            timestamp: serverTimestamp(),
            feedVisibility: AppState.currentMode || "citizen-talk",
            moderationStatus: "approved",
            status: "public",
            credibilityScore: 10,
            createdAt: serverTimestamp()
        };

        await addDoc(collection(db, "testimonies"), testimonyData);
        await window.recordTestimonyContribution?.();

        showToast("✅ Testimony published successfully!", "success");

        if (textarea) textarea.value = '';
        if (mediaModule.resetMediaState) mediaModule.resetMediaState();
        loadDynamicFeed(AppState.currentTab || 'square');
    } catch (err) {
        console.error("Publish error:", err);
        showToast("Failed to publish. Please try again.", "error");
    } finally {
        if (postBtn) {
            postBtn.disabled = false;
            postBtn.textContent = 'Publish to the Square';
        }
    }
};

// ====================== SUPPORT MODAL ======================
function initSupportButton() {
    const supportBtn = document.getElementById('support-btn');
    if (!supportBtn) return;

    supportBtn.addEventListener('click', () => {
        const modal = document.getElementById('supportModal');
        if (modal) {
            modal.classList.remove('hidden');
            // Re-apply translations if available
            setTimeout(() => {
                if (typeof applyTranslations === 'function') applyTranslations();
            }, 100);
        } else {
            showToast("Support modal not found. Please refresh.", "error");
        }
    });
}

// ====================== BOOTSTRAP ======================
async function bootstrap() {
    try {
        await initAuth();
        initLanguage();
        initProfile();
        initOnboarding?.();           // safe call
        loadDynamicNavigation?.();

        engineInstance = new CitizenTalkEngine(db, storage);
        window.engineInstance = engineInstance;

        if (mediaModule.setEngine) mediaModule.setEngine(engineInstance);

        if (typeof applyTierTheme === 'function') applyTierTheme();
        if (typeof updateTierBadge === 'function') updateTierBadge();

        setupEventListeners();

        // Initial tab
        setTimeout(() => window.switchTab('square'), 600);

        console.log("✅ VocalWitness Live Ready");
    } catch (e) {
        console.error("Bootstrap failed:", e);
        showToast("App failed to initialize. Please refresh.", "error");
    }
}

function setupEventListeners() {
    // Photo upload
    const photoBtn = document.getElementById('btn-photo');
    if (photoBtn) {
        photoBtn.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = (ev) => {
                if (typeof mediaModule.handleImageSelect === 'function') {
                    mediaModule.handleImageSelect(ev, document.getElementById('preview-area'));
                } else {
                    showToast("📸 Media module not ready yet. Refresh page.", "error");
                }
            };
            input.click();
        });
    }

    // Voice recording
    const voiceBtn = document.getElementById('btn-voice');
    if (voiceBtn) {
        voiceBtn.addEventListener('click', (e) => {
            if (typeof mediaModule.toggleVoiceRecording === 'function') {
                mediaModule.toggleVoiceRecording(e.currentTarget);
            } else {
                showToast("🎤 Voice recording not available yet.", "error");
            }
        });
    }

    // Publish button
    const postBtn = document.getElementById('postButton');
    if (postBtn) postBtn.addEventListener('click', window.publishTestimony);

    // Profile button
    const profileBtn = document.getElementById('profile-btn');
    if (profileBtn) {
        profileBtn.addEventListener('click', () => {
            if (typeof window.showProfile === 'function') {
                window.showProfile();
            } else {
                showToast("👤 Profile section coming soon", "info");
            }
        });
    }

    // Language selector
    const langSelector = document.getElementById('languageSelector');
    if (langSelector) {
        langSelector.addEventListener('change', (e) => {
            const newLang = e.target.value;
            if (typeof window.changeLanguage === 'function') {
                window.changeLanguage(newLang);
            }
            showToast(`🌍 Language switched to ${newLang.toUpperCase()}`, "success");
        });
    }
}

// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
    bootstrap();
    initSupportButton();

    // Extra safety for profile button (in case DOM elements load late)
    const profileBtn = document.getElementById('profile-btn');
    if (profileBtn) {
        profileBtn.addEventListener('click', () => {
            window.showProfile?.() || showToast("Profile module not loaded", "error");
        });
    }
});
