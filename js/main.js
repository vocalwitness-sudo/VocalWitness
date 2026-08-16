// js/main.js - Core Handlers, Tab Switching & Application Entry Setup

// 1. Static Module Imports
import { state, updateAppState, isUserAuthenticated } from './app-state.js';
import { initAuth, requireAuth, updateUIForAuthState, bindHeaderEvents } from "./auth.js";
import { initFeed } from './feed.js';
import { db, auth, storage } from './firebase-config.js';
import { initLanguage } from './i18n.js';
import * as mediaModule from './media.js';
import { CitizenTalkEngine } from './vocalWitnessEngine.js';
import { initProfile } from './profile.js';
import { loadDynamicNavigation } from './navigation.js';
import { showToast } from './utils.js';
import { initBookmarks, initBookmarksView } from './bookmarks.js';
import { loadWeeklyLeaderboard, refreshTierAndUI } from './tier.js';
import './composer.js';
import {
    collection,
    addDoc,
    serverTimestamp,
    query,
    getDocs,
    orderBy,
    limit
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

// Global Module State
let engineInstance = null;
let isInitialized = false;
let listenersInitialized = false;
let isSwitchingTab = false;

// ====================== DATA SAVER HANDLER ======================
export function initDataSaver() {
    const savedState = localStorage.getItem('vocalwitness_data_saver') === 'true';
    updateAppState({ dataSaver: savedState });
    updateDataSaverUI(savedState);
}

export function toggleDataSaver() {
    const currentState = state.dataSaver || false;
    const newState = !currentState;
    
    updateAppState({ dataSaver: newState });
    localStorage.setItem('vocalwitness_data_saver', String(newState));
    updateDataSaverUI(newState);

    if (newState) {
        showToast("⚡ Data Saver Activated: High-res media preloading paused.", "info");
    } else {
        showToast("⚡ Data Saver Deactivated: Full quality media enabled.", "info");
    }
}

function updateDataSaverUI(enabled) {
    // Desktop Status Indicator
    const statusEl = document.getElementById('data-saver-status');
    if (statusEl) {
        statusEl.textContent = enabled ? "On" : "Off";
        statusEl.style.color = enabled ? "#10b981" : "#34d399";
    }

    // Desktop Button Styling
    const desktopBtn = document.getElementById('data-saver-btn');
    if (desktopBtn) {
        if (enabled) {
            desktopBtn.classList.add('border-emerald-500', 'bg-emerald-950/40');
        } else {
            desktopBtn.classList.remove('border-emerald-500', 'bg-emerald-950/40');
        }
    }

    // Mobile Button Styling
    const mobileBtn = document.getElementById('data-saver-btn-mobile');
    if (mobileBtn) {
        if (enabled) {
            mobileBtn.classList.add('border-emerald-500', 'text-emerald-400', 'bg-emerald-950/40');
            mobileBtn.classList.remove('border-zinc-800', 'text-zinc-300', 'bg-zinc-900');
        } else {
            mobileBtn.classList.remove('border-emerald-500', 'text-emerald-400', 'bg-emerald-950/40');
            mobileBtn.classList.add('border-zinc-800', 'text-zinc-300', 'bg-zinc-900');
        }
    }
}

window.toggleDataSaver = toggleDataSaver;

// ====================== TAB SWITCHING ======================
window.switchTab = async (tab) => {
    if (isSwitchingTab) return;
    isSwitchingTab = true;

    console.log(`Switching to tab: ${tab}`);

    // Update nav button visual active state
    const navButtons = document.querySelectorAll('#main-nav button[data-tab]');
    navButtons.forEach(btn => {
        btn.classList.remove(
            'active',
            'bg-emerald-600', 'bg-emerald-500',
            'bg-sky-900/70', 'text-sky-300', 'border-sky-700',
            'bg-amber-900/70', 'bg-amber-900', 'text-amber-300', 'border-amber-700'
        );

        if (btn.dataset.tab === tab) {
            btn.classList.add('active');
        }
    });

    // Update global state
    state.currentTab = tab;
    state.currentMode = tab === 'witness' ? 'witness' : 'citizen';

    const container = document.getElementById('dynamicContainer') || document.getElementById('main-content');
    if (!container) {
        isSwitchingTab = false;
        return;
    }

    container.innerHTML = `<div class="text-center py-20 text-zinc-400">Loading ${tab}...</div>`;

    try {
        if (tab === 'square' || tab === 'citizen') {
            container.innerHTML = `<div id="feedContainer" class="space-y-8"></div>`;
            initFeed?.(db, 'citizen-talk');
        }
        else if (tab === 'ledger') {
            container.innerHTML = `<div id="ledgerContainer" class="space-y-6"></div>`;
            await loadEvidenceLedger();
        }
        else if (tab === 'witness') {
            container.innerHTML = `
                <div class="space-y-6 p-8 text-center glass rounded-3xl border border-amber-700/50">
                    <h2 class="text-3xl font-bold text-amber-400">🛡️ Witness Voice</h2>
                    <p class="text-zinc-400">ZK-Verified & High-Trust Evidence Feed</p>
                    <div id="feedContainer" class="space-y-8 mt-6"></div>
                </div>`;
            initFeed?.(db, 'witness-voice');
        }
        else if (tab === 'arena' || tab === 'mycircle') {
            container.innerHTML = `
                <div class="glass rounded-3xl p-12 text-center text-zinc-400 border border-zinc-800">
                    <div class="text-4xl mb-3">🚧</div>
                    <h3 class="text-xl font-semibold text-white mb-2">Under Active Construction</h3>
                    <p class="text-xs text-zinc-500">This module is currently being optimized for non-custodial operations.</p>
                </div>`;
        }
    } catch (e) {
        console.error("Tab switch error:", e);
        container.innerHTML = `<div class="text-red-400 text-center py-8">Failed to load tab. Please try again.</div>`;
    } finally {
        isSwitchingTab = false;
    }
};

window.refreshLedger = () => loadEvidenceLedger();

// ====================== PAYMENT GATEWAYS ======================
window.initiatePayment = function(amount, email = null, metadata = {}) {
    if (!requireAuth("Sign in to support VocalWitness")) return;

    if (typeof PaystackPop === 'undefined') {
        showToast("Payment gateway library not loaded. Please refresh.", "error");
        return;
    }

    try {
        const handler = PaystackPop.setup({
            key: 'pk_live_5d13a6db326f02375127aae9d0fb03678ed1d923',
            email: email || auth.currentUser?.email || '',
            amount: amount * 100, // Amount in kobo
            currency: "NGN",
            metadata: {
                source: "VocalWitness",
                userId: auth.currentUser?.uid,
                ...metadata
            },
            onSuccess: (transaction) => {
                showToast(`✅ Payment successful! Ref: ${transaction.reference}`, "success");
                window.closeSupportModal();
            },
            onCancel: () => showToast("Payment was cancelled", "info")
        });
        handler.openIframe();
    } catch (err) {
        console.error("Paystack startup error:", err);
        showToast("Unable to open payment gateway", "error");
    }
};

// Global click outside for dropdowns
window.addEventListener('click', (e) => {
    const dropdown = document.querySelector('.dropdown-container');
    const menu = document.getElementById('more-menu');
    if (menu && dropdown && !dropdown.contains(e.target)) {
        menu.classList.add('hidden');
    }
});

// ====================== MODAL CONTROLLERS ======================
const toggleModal = (modalId, show = true) => {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    if (show) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    } else {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
};

window.openVerificationModal = () => toggleModal('verificationModal', true);
window.closeVerificationModal = () => toggleModal('verificationModal', false);
window.openQvModal = () => toggleModal('quadratic-vote-modal', true);
window.closeQvModal = () => toggleModal('quadratic-vote-modal', false);
window.openSupportModal = () => toggleModal('supportModal', true);
window.closeSupportModal = () => toggleModal('supportModal', false);

// ====================== WELCOME NOTE ======================
function showWelcomeNote() {
    if (!auth.currentUser || localStorage.getItem('hasSeenWelcome')) return;
    showToast("🎉 Welcome to VocalWitness! Your voice matters in Citizen Talk.", "success");
    localStorage.setItem('hasSeenWelcome', 'true');
}

// ====================== PUBLISH TESTIMONY ======================
window.publishTestimony = async () => {
    if (!requireAuth("Please sign in to share your testimony in Citizen Talk.")) return;

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
        postBtn.classList.add('publishing', 'opacity-50', 'cursor-not-allowed');
        postBtn.innerHTML = `
            <span class="flex items-center justify-center gap-3">
                <span class="animate-spin h-5 w-5 border-2 border-black border-t-transparent rounded-full"></span>
                Publishing to ${state.currentMode === 'witness' ? 'Witness Voice' : 'Citizen Talk'}...
            </span>
        `;
    }

    try {
        const mediaData = (typeof mediaModule.uploadForensicMedia === 'function')
            ? await mediaModule.uploadForensicMedia()
            : {};

        const testimonyData = {
            authorId: auth.currentUser.uid,
            author: auth.currentUser.displayName || "Registered Witness",
            content,
            createdAt: serverTimestamp(),
            timestamp: Date.now(),
            isPublic: true,
            moderationStatus: "approved",
            feedVisibility: state.currentMode === 'witness' ? 'witness-voice' : 'citizen-talk',
            imageUrl: mediaData.imageUrl || null,
            audioUrl: mediaData.audioUrl || null,
            imageHash: mediaData.imageHash || null,
            audioHash: mediaData.audioHash || null,
            hasForensic: !!(mediaData.imageHash || mediaData.audioHash)
        };

        await addDoc(collection(db, "testimonies"), testimonyData);
        showToast("✅ Testimony published successfully!", "success");

        if (textarea) textarea.value = '';
        mediaModule.resetMediaState?.();
        initFeed?.(db, testimonyData.feedVisibility);

    } catch (err) {
        console.error("Publish error:", err);
        const msg = err.code === 'permission-denied'
            ? "⚠️ Permission denied. Please check your Firestore security rules."
            : "Failed to publish. Please try again.";
        showToast(msg, "error");
    } finally {
        if (postBtn) {
            postBtn.disabled = false;
            postBtn.classList.remove('publishing', 'opacity-50', 'cursor-not-allowed');
            postBtn.innerHTML = `
                <span class="relative z-10 flex items-center justify-center gap-3">
                    Publish to ${state.currentMode === 'witness' ? 'Witness Voice' : 'Citizen Talk'}
                </span>
            `;
        }
    }
};

// ====================== EVIDENCE LEDGER ======================
async function loadEvidenceLedger() {
    const container = document.getElementById('ledgerContainer');
    if (!container) return;

    container.innerHTML = `
        <div class="glass rounded-3xl p-8 border border-zinc-700/60 shadow-2xl">
            <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8 pb-6 border-b border-zinc-800">
                <div>
                    <h2 class="text-2xl font-bold text-white flex items-center gap-2">
                        <span>📜</span> Cryptographic Evidence Ledger
                    </h2>
                    <p class="text-sm text-zinc-400 mt-1">Permanent, immutable record of public testimonies.</p>
                </div>
                <button id="syncLedgerBtn" onclick="window.refreshLedger()" class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-2xl text-xs font-medium text-emerald-400 transition flex items-center gap-2">
                    🔄 Sync Ledger
                </button>
            </div>
            <div id="ledgerTableInnerWrapper" class="overflow-x-auto">
                <div class="text-center py-16 text-zinc-500 animate-pulse">Loading ledger records...</div>
            </div>
        </div>`;

    const innerWrapper = document.getElementById('ledgerTableInnerWrapper');
    const syncBtn = document.getElementById('syncLedgerBtn');
    if (syncBtn) syncBtn.disabled = true;

    try {
        const q = query(
            collection(db, "testimonies"), 
            orderBy("timestamp", "desc"), 
            limit(20)
        );
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            innerWrapper.innerHTML = `
                <div class="text-center py-12 text-zinc-500">
                    <p class="text-base font-medium text-zinc-400">No forensic records found yet.</p>
                </div>`;
            return;
        }

        let html = `
            <table class="w-full text-left border-collapse">
                <thead>
                    <tr class="border-b border-zinc-800 text-xs text-zinc-400 uppercase tracking-wider">
                        <th class="py-3 px-4">Witness</th>
                        <th class="py-3 px-4">Content Summary</th>
                        <th class="py-3 px-4">Forensic Status</th>
                        <th class="py-3 px-4">Timestamp</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-zinc-800/60 text-sm text-zinc-300">`;

        querySnapshot.forEach((docSnapshot) => {
            const data = docSnapshot.data();
            const dateStr = data.timestamp ? new Date(data.timestamp).toLocaleString() : 'N/A';
            const hasHash = data.imageHash || data.audioHash || data.hasForensic;
            const hashDisplay = hasHash 
                ? '<span class="text-emerald-400 flex items-center gap-1 font-semibold">🔒 Verified Hash</span>' 
                : '<span class="text-zinc-500">Standard</span>';

            html += `
                <tr class="hover:bg-zinc-800/40 transition">
                    <td class="py-4 px-4 font-medium text-white">${escapeHtml(data.author || 'Anonymous Witness')}</td>
                    <td class="py-4 px-4 truncate max-w-xs text-zinc-300">${escapeHtml(data.content)}</td>
                    <td class="py-4 px-4 font-mono text-xs">${hashDisplay}</td>
                    <td class="py-4 px-4 text-zinc-500 text-xs">${dateStr}</td>
                </tr>`;
        });

        html += `</tbody></table>`;
        innerWrapper.innerHTML = html;

    } catch (err) {
        console.error("Ledger fetch error:", err);
        innerWrapper.innerHTML = `<div class="text-red-400 text-center py-8">Failed to load ledger records. Please check permissions.</div>`;
    } finally {
        if (syncBtn) syncBtn.disabled = false;
    }
}

// ====================== CURATED NEWS TICKER ======================
async function fetchCuratedNews() {
    const tickerEl = document.getElementById('ticker-content');
    if (!tickerEl) return;

    const RSS_URL = 'https://api.rss2json.com/v1/api.json?rss_url=https://feeds.bbci.co.uk/news/world/rss.xml';

    try {
        const res = await fetch(RSS_URL);
        if (!res.ok) throw new Error(`HTTP network error: ${res.status}`);

        const data = await res.json();
        
        if (data.status === 'ok' && Array.isArray(data.items) && data.items.length > 0) {
            const headlines = data.items.slice(0, 8).map(item => {
                const safeTitle = escapeHtml(item.title || '');
                return `<span class="ticker-item"><strong class="text-emerald-400">•</strong> ${safeTitle}</span>`;
            }).join(' &nbsp;&nbsp;&nbsp; ');

            tickerEl.innerHTML = headlines;
            return;
        }

        throw new Error('Malformed RSS payload structure');
    } catch (err) {
        console.warn("News ticker fallback active:", err.message);
        tickerEl.innerHTML = `<span class="ticker-item text-slate-400">🛡️ Public Square feed active • Zero-knowledge evidence ledger online • Standby for live updates.</span>`;
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
    console.log("✅ Wiring application listeners...");

    // Data Delegation Handling for Header & Navigation Controls
    document.addEventListener('click', (e) => {
        const actionTarget = e.target.closest('[data-action]');
        if (!actionTarget) return;

        const action = actionTarget.dataset.action;

        switch (action) {
            case 'toggle-data-saver':
                e.preventDefault();
                toggleDataSaver();
                break;
            case 'open-support-modal':
                e.preventDefault();
                window.openSupportModal();
                break;
            case 'open-profile':
                e.preventDefault();
                if (typeof window.openProfile === 'function') {
                    window.openProfile();
                } else if (typeof window.showProfile === 'function') {
                    window.showProfile();
                }
                break;
            case 'open-bookmarks':
                e.preventDefault();
                document.querySelectorAll('.tab-view').forEach(view => view.classList.add('hidden'));
                document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
                initBookmarksView?.();
                break;
            case 'open-notifications':
                e.preventDefault();
                showToast("🔔 Notification center coming online...", "info");
                break;
            default:
                break;
        }
    });

    // Event Delegation for Navigation Tabs
    const mainNav = document.getElementById('main-nav');
    if (mainNav) {
        mainNav.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-tab]');
            if (btn) {
                e.preventDefault();
                window.switchTab(btn.dataset.tab);
            }
        });
    }

    // Auth & Header Bindings
    bindHeaderEvents();

    // Support Modal Paystack Payment Binding
    document.getElementById('paystackPayBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        const amountInput = document.getElementById('customSupportAmount');
        const amount = amountInput ? parseFloat(amountInput.value) || 1000 : 1000;
        window.initiatePayment(amount);
    });

    // Media Controls
    document.getElementById('btn-photo')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (!requireAuth("Sign in to upload Forensic Photo")) return;
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/jpeg,image/png,image/webp';
        input.onchange = (ev) => mediaModule.handleImageSelect?.(ev, document.getElementById('preview-area'));
        input.click();
    });

    const voiceBtn = document.getElementById('btn-voice');
    if (voiceBtn) {
        voiceBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (!requireAuth("Sign in to record Voice Testimony")) return;
            mediaModule.toggleVoiceRecording?.(voiceBtn);
        });
    }

    // Publish Button
    document.getElementById('postButton')?.addEventListener('click', (e) => {
        e.preventDefault();
        window.publishTestimony();
    });

    console.log("✅ Application listeners active");
}

// ====================== BOOTSTRAP ======================
async function bootstrap() {
    if (isInitialized) return;
    isInitialized = true;
    console.log("🚀 VocalWitness Bootstrap started");

    try {
        // 1. Initialize tier systems & data saver
        initDataSaver();
        refreshTierAndUI();
        loadWeeklyLeaderboard();

        // 2. Wire global listeners before firing auth check
        window.addEventListener('auth-changed', (e) => {
            const user = e.detail?.user;
            console.log("🔐 Auth state confirmed:", user ? `Logged in as ${user.uid}` : "Guest session");

            if (typeof updateUIForAuthState === 'function') {
                updateUIForAuthState(user);
            }

            // Default to 'square' tab on cold load
            if (!state.currentTab) {
                window.switchTab('square');
            }
            showWelcomeNote();
        });

        // 3. Static module setups
        setupEventListeners();
        initLanguage?.();
        initProfile?.();

        if (typeof CitizenTalkEngine === 'function') {
            engineInstance = new CitizenTalkEngine(db, storage);
            window.engineInstance = engineInstance;
            mediaModule.setEngine?.(engineInstance);
        }

        loadDynamicNavigation?.();
        fetchCuratedNews();

        // 4. Trigger auth initialization
        await initAuth();

        console.log("✅ Bootstrap finished successfully");
    } catch (e) {
        console.error("Bootstrap error:", e);
        showToast?.("Failed to initialize app. Please refresh.", "error");
    }
}

document.addEventListener('DOMContentLoaded', bootstrap);
