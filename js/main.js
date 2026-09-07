// js/main.js - Core Handlers, Tab Switching & Application Entry Setup
// 1. Static Module Imports
import { state, updateAppState, isUserAuthenticated } from './app-state.js';
import { initAuth, requireAuth, updateUIForAuthState, bindHeaderEvents } from "./auth.js";
import { initFeed } from './feed.js';
import { initLanguage } from './i18n.js';
import * as mediaModule from './media.js';
import { CitizenTalkEngine } from './vocalWitnessEngine.js';
import { initProfile } from './profile.js';
import { loadDynamicNavigation } from './navigation.js';
import { showToast } from './utils.js';
import { initBookmarks, initBookmarksView } from './bookmarks.js';
import { loadWeeklyLeaderboard, refreshTierAndUI } from './tier.js';
import { initComposer } from './composer.js';
import { createEvidencePack } from './evidence-pack.js';
import { generateSha256Hash } from './utils.js';
import {
    collection,
    addDoc,
    doc,
    getDoc,          // ← add
    setDoc,          // ← add
    updateDoc,
    serverTimestamp,
    query,
    getDocs,
    orderBy,
    limit
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import {
    collection,
    addDoc,
    doc,
    updateDoc,
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
const DATA_SAVER_KEY = 'vw_data_saver';

/**
 * Read current state from localStorage
 */
function getDataSaverState() {
  return localStorage.getItem(DATA_SAVER_KEY) === 'true';
}

/**
 * Update all status texts + button styles
 */
function updateDataSaverUI(isOn) {
  const statusText = isOn ? 'On' : 'Off';
  const statusClass = isOn ? 'text-emerald-400 font-bold' : 'text-zinc-400';

  // Update every status element that exists
  ['data-saver-status', 'data-saver-status-mobile', 'footer-data-saver-status'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = statusText;
      el.className = statusClass;
    }
  });

  // Desktop button
  const desktopBtn = document.getElementById('data-saver-btn');
  if (desktopBtn) {
    desktopBtn.classList.toggle('border-emerald-500', isOn);
    desktopBtn.classList.toggle('bg-emerald-950/40', isOn);
    desktopBtn.classList.toggle('border-zinc-800', !isOn);
    desktopBtn.classList.toggle('bg-zinc-900', !isOn);
  }

  // Mobile button
  const mobileBtn = document.getElementById('data-saver-btn-mobile');
  if (mobileBtn) {
    mobileBtn.classList.toggle('border-emerald-500', isOn);
    mobileBtn.classList.toggle('bg-emerald-950/40', isOn);
    mobileBtn.classList.toggle('text-emerald-400', isOn);
    mobileBtn.classList.toggle('border-zinc-800', !isOn);
    mobileBtn.classList.toggle('bg-zinc-900', !isOn);
    mobileBtn.classList.toggle('text-zinc-300', !isOn);
  }
}

/**
 * Main toggle function (called by both desktop & mobile buttons)
 */
function toggleDataSaver() {
  const current = getDataSaverState();
  const next = !current;

  // Save new state
  localStorage.setItem(DATA_SAVER_KEY, String(next));

  // Update UI immediately
  updateDataSaverUI(next);

  // Optional: let other parts of the app know
  window.dispatchEvent(new CustomEvent('data-saver-changed', {
    detail: { enabled: next }
  }));

  console.log('[Data Saver]', next ? 'ON' : 'OFF');
}

// Expose for the onclick="toggleDataSaver()" in HTML
window.toggleDataSaver = toggleDataSaver;

// Initialise the correct state when the page loads
document.addEventListener('DOMContentLoaded', () => {
  updateDataSaverUI(getDataSaverState());
});
// ====================== TAB SWITCHING ======================
window.switchTab = async (tab) => {
    if (isSwitchingTab) return;
    isSwitchingTab = true;
    console.log(`Switching to tab: ${tab}`);

    // 1. Update nav button visual state
    document.querySelectorAll('#main-nav button[data-tab]').forEach(btn => {
        const isActive = btn.dataset.tab === tab;
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        btn.classList.toggle('active', isActive);

        btn.classList.remove(
            'bg-emerald-500', 'border-emerald-400/50', 'text-black',
            'bg-emerald-950/70', 'text-emerald-300', 'border-emerald-700/60',
            'bg-sky-900/70', 'text-sky-300', 'border-sky-700',
            'bg-amber-900/70', 'text-amber-300', 'border-amber-700',
            'bg-zinc-900', 'text-zinc-200', 'border-zinc-700'
        );

        if (isActive) {
            if (tab === 'square') {
                btn.classList.add('bg-emerald-500', 'border-emerald-400/50', 'text-black');
            } else if (tab === 'ledger') {
                btn.classList.add('bg-emerald-950/70', 'text-emerald-300', 'border-emerald-700/60');
            } else if (tab === 'arena') {
                btn.classList.add('bg-sky-900/70', 'text-sky-300', 'border-sky-700');
            } else if (tab === 'witness') {
                btn.classList.add('bg-amber-900/70', 'text-amber-300', 'border-amber-700');
            } else {
                btn.classList.add('bg-zinc-900', 'text-zinc-200', 'border-zinc-700');
            }
        } else {
            if (btn.dataset.tab === 'ledger') {
                btn.classList.add('bg-emerald-950/70', 'text-emerald-300', 'border-emerald-700/60');
            } else if (btn.dataset.tab === 'arena') {
                btn.classList.add('bg-sky-900/70', 'text-sky-300', 'border-sky-700');
            } else if (btn.dataset.tab === 'witness') {
                btn.classList.add('bg-amber-900/70', 'text-amber-300', 'border-amber-700');
            } else {
                btn.classList.add('bg-zinc-900', 'text-zinc-200', 'border-zinc-700');
            }
        }
    });

    // 2. Hide all tab panels
    const panels = ['public-square', 'evidence-ledger', 'live-arena', 'mycircle', 'witness'];
    panels.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    // 3. Show the correct panel and load data
    try {
        if (tab === 'square' || tab === 'citizen') {
            const panel = document.getElementById('public-square');
            if (panel) panel.classList.remove('hidden');
            const feedEl = document.getElementById('testimonies-feed') || document.getElementById('feed-container');
            if (feedEl && typeof initFeed === 'function') {
                initFeed(db, 'citizen-talk');
            }
        } else if (tab === 'ledger') {
            const panel = document.getElementById('evidence-ledger');
            if (panel) panel.classList.remove('hidden');
            await loadEvidenceLedger();
        } else if (tab === 'arena') {
            const panel = document.getElementById('live-arena');
            if (panel) panel.classList.remove('hidden');
        } else if (tab === 'mycircle') {
            const panel = document.getElementById('mycircle');
            if (panel) panel.classList.remove('hidden');
        } else if (tab === 'witness') {
            const panel = document.getElementById('witness');
            if (panel) panel.classList.remove('hidden');
            if (typeof initFeed === 'function') {
                initFeed(db, 'witness-voice');
            }
        }
    } catch (e) {
        console.error('Tab switch error:', e);
        showToast('Failed to load tab', 'error');
    } finally {
        isSwitchingTab = false;
        state.currentTab = tab;
    }
};

window.refreshLedger = () => loadEvidenceLedger();

// ====================== PAYMENT GATEWAYS ======================
window.initiatePayment = function (amount, email = null, metadata = {}) {
    if (!requireAuth("Sign in to support VocalWitness")) return;

    if (typeof PaystackPop === 'undefined') {
        showToast("Payment gateway library not loaded. Please refresh.", "error");
        return;
    }

    try {
        const handler = PaystackPop.setup({
            key: 'pk_live_5d13a6db326f02375127aae9d0fb03678ed1d923',
            email: email || auth.currentUser?.email || '',
            amount: amount * 100,
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

// ====================== PUBLISH TESTIMONY (HARDENED + FAIL-CLOSED MEDIA) ======================
window.publishTestimony = async () => {
  if (window.__isPublishing) {
    console.warn('[publish] Already publishing – ignored');
    return;
  }
  window.__isPublishing = true;

  const currentUser = auth.currentUser;
  if (!currentUser) {
    showToast("Session expired. Please re-authenticate.", "error");
    window.__isPublishing = false;
    return;
  }

  const titleInput = document.getElementById('testimonyTitle');
  const textarea = document.getElementById('mainInput');
  let title = titleInput ? titleInput.value.trim() : '';
  const content = textarea ? textarea.value.trim() : '';

  if (!content) {
    showToast("Please write something before publishing", "error");
    window.__isPublishing = false;
    return;
  }

  if (!title && content) {
    title = content.length <= 80
      ? content
      : content.slice(0, 80).replace(/\s+\S*$/, '') + '...';
  }

  const postBtn = document.getElementById('postButton');
  if (postBtn) {
    postBtn.disabled = true;
    postBtn.classList.add('opacity-50', 'cursor-not-allowed');
  }

  try {
    // ---------- 1. Ensure user document exists (safe creation) ----------
    const userRef = doc(db, 'users', currentUser.uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      console.log('[publish] Creating missing user document...');
      await setDoc(userRef, {
        uid: currentUser.uid,
        email: currentUser.email || '',
        displayName: currentUser.displayName || 'Registered Witness',
        createdAt: serverTimestamp(),
        tier: 'citizen',
        isVerified: false
      }, { merge: true });
    }

    // ---------- 2. Media (STRICT – fail closed if user selected media) ----------
    let mediaData = {
      imageUrl: null,
      videoUrl: null,
      audioUrl: null,
      imageHash: null,
      videoHash: null,
      audioHash: null,
      bodyHash: null,
      hasEvidencePack: false,
      evidencePack: null,
      packCoreHash: null
    };

    // Detect whether the user actually selected media
    const userSelectedMedia = typeof mediaModule?.hasPendingMedia === 'function'
      ? mediaModule.hasPendingMedia()
      : false;

    if (typeof mediaModule?.uploadForensicMedia === 'function') {
      try {
        const uploaded = await mediaModule.uploadForensicMedia();

        if (uploaded) {
          mediaData = { ...mediaData, ...uploaded };
        } else if (userSelectedMedia) {
          // User picked media but upload returned nothing → treat as failure
          throw new Error('Media upload returned empty result');
        }
      } catch (mediaErr) {
        console.error('[publish] Media upload failed – aborting publish to protect ledger:', mediaErr);

        const isCorsLike = mediaErr?.message?.includes('Network error') ||
                           mediaErr?.message?.includes('CORS') ||
                           mediaErr?.name === 'NetworkError';

        showToast(
          isCorsLike
            ? 'Media upload blocked (CORS). Open https://vocalwitness.com (without www) and try again. Report was NOT published.'
            : 'Media upload failed. Report was NOT published. Please try again.',
          'error'
        );

        window.__isPublishing = false;
        if (postBtn) {
          postBtn.disabled = false;
          postBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
        return; // HARD STOP – no testimony is written
      }
    }

    // ---------- 2b. Body hash (forensic fingerprint of the written text) ----------
    // Proves the text content has not been altered after publish.
    try {
      if (content && typeof generateSha256Hash === 'function') {
        const textBlob = new Blob([content], { type: 'text/plain' });
        mediaData.bodyHash = await generateSha256Hash(textBlob);
      }
    } catch (hashErr) {
      console.warn('[publish] Could not compute bodyHash:', hashErr);
      // Non-fatal – we still publish, just without the body hash
    }

    // ---------- 3. STRICT payload that matches the rules exactly ----------
    const testimonyData = {
      authorId: currentUser.uid,
      content: content,
      createdAt: serverTimestamp(),
      channel: 'citizen-talk',

      title: title || null,
      author: currentUser.displayName || 'Registered Witness',
      feedVisibility: 'citizen-talk',
      timestamp: Date.now(),

      imageUrl: mediaData.imageUrl || null,
      videoUrl: mediaData.videoUrl || null,
      audioUrl: mediaData.audioUrl || null,
      imageHash: mediaData.imageHash || null,
      videoHash: mediaData.videoHash || null,
      audioHash: mediaData.audioHash || null,
      bodyHash: mediaData.bodyHash || null,

      hasForensic: !!(mediaData.imageHash || mediaData.videoHash || mediaData.audioHash || mediaData.bodyHash),
      hasEvidencePack: !!mediaData.hasEvidencePack,
      evidencePack: mediaData.evidencePack || null,
      packCoreHash: mediaData.packCoreHash || null
    };

    console.log('[publish] FINAL PAYLOAD:', JSON.stringify({
      ...testimonyData,
      createdAt: '[serverTimestamp]',
      contentLen: content.length
    }, null, 2));

    // ---------- 4. The write ----------
    const docRef = await addDoc(collection(db, 'testimonies'), testimonyData);
    console.log('[publish] SUCCESS →', docRef.id);

    // ---------- 5. Update throttle (safe) ----------
    await setDoc(userRef, {
      lastTestimonyAt: serverTimestamp()
    }, { merge: true });

    showToast("🛡️ Report sealed and published", "success");

    // Reset UI
    if (titleInput) titleInput.value = '';
    if (textarea) textarea.value = '';
    if (typeof mediaModule?.resetMediaState === 'function') mediaModule.resetMediaState();
    if (typeof initFeed === 'function') initFeed(db, 'citizen-talk');

  } catch (err) {
    console.error('[publish] FULL ERROR:', err);
    console.error('[publish] code:', err.code, 'message:', err.message);

    if (err.code === 'permission-denied') {
      showToast("Permission denied. Check console for exact rule failure.", "error");
      console.warn('→ Open Firestore Rules Playground and simulate create on /testimonies/{id} with the payload above as this UID');
    } else {
      showToast("Failed to publish. See console.", "error");
    }
  } finally {
    window.__isPublishing = false;
    if (postBtn) {
      postBtn.disabled = false;
      postBtn.classList.remove('opacity-50', 'cursor-not-allowed');
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
                <button id="syncLedgerBtn" type="button"
                        class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-2xl text-xs font-medium text-emerald-400 transition flex items-center gap-2">
                    🔄 Sync Ledger
                </button>
            </div>
            <div id="ledgerTableInnerWrapper" class="overflow-x-auto">
                <div class="text-center py-16 text-zinc-500 animate-pulse">Loading ledger records...</div>
            </div>
        </div>`;

    const innerWrapper = document.getElementById('ledgerTableInnerWrapper');
    const syncBtn = document.getElementById('syncLedgerBtn');

    // CSP-safe listener
    if (syncBtn) {
        syncBtn.addEventListener('click', () => {
            if (typeof window.refreshLedger === 'function') {
                window.refreshLedger();
            } else {
                // fallback – just reload this ledger
                loadEvidenceLedger();
            }
        });
        syncBtn.disabled = true;   // disable while loading
    }

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
    if (window.listenersInitialized) return;
    window.listenersInitialized = true;
    console.log("✅ Wiring application listeners...");

    // 1. Global Click Delegation for [data-action] and specific buttons
    document.addEventListener('click', (e) => {
        const actionTarget = e.target.closest('[data-action]');
        
        // Handle explicit ID lookups if data-action is missing
        if (!actionTarget) {
            if (e.target.closest('#data-saver-btn') || e.target.closest('#data-saver-btn-mobile')) {
                e.preventDefault();
                if (typeof toggleDataSaver === 'function') toggleDataSaver();
            }
            if (e.target.closest('#openSupportModalBtn') || e.target.closest('#openSupportModalBtnMobile')) {
                e.preventDefault();
                if (typeof window.openSupportModal === 'function') window.openSupportModal();
            }
            return;
        }

        const action = actionTarget.dataset.action;
        switch (action) {
            case 'toggle-data-saver':
                e.preventDefault();
                if (typeof toggleDataSaver === 'function') toggleDataSaver();
                break;
            case 'open-support-modal':
                e.preventDefault();
                if (typeof window.openSupportModal === 'function') window.openSupportModal();
                break;
            case 'open-auth-modal':
                e.preventDefault();
                if (typeof window.openAuthModal === 'function') window.openAuthModal();
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
                if (typeof initBookmarksView === 'function') initBookmarksView();
                break;
            case 'open-notifications':
                e.preventDefault();
                if (typeof showToast === 'function') showToast("🔔 Notification center coming online...", "info");
                break;
            default:
                break;
        }
    });

    // 2. Notification Dropdown Toggle
    const notifBtn = document.getElementById('notification-btn') || document.getElementById('notification-btn-mobile');
    if (notifBtn && typeof window.toggleNotificationDropdown === 'function') {
        notifBtn.addEventListener('click', window.toggleNotificationDropdown);
    }

    // 3. Language Selection Changes (supporting both desktop & mobile IDs)
    ['languageSelect', 'languageSelectMobile'].forEach(id => {
        const selectEl = document.getElementById(id);
        if (selectEl) {
            selectEl.addEventListener('change', (e) => {
                const langCode = e.target.value;
                if (langCode && typeof window.changeLanguage === 'function') {
                    window.changeLanguage(langCode);
                }
            });
        }
    });

    // 4. Main Navigation Tab Switching
    const mainNav = document.getElementById('main-nav');
    if (mainNav) {
        mainNav.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-tab]');
            if (btn) {
                e.preventDefault();
                if (typeof window.switchTab === 'function') {
                    window.switchTab(btn.dataset.tab);
                }
            }
        });
    }

    // 5. Bind Header Specific Events
    if (typeof bindHeaderEvents === 'function') {
        bindHeaderEvents();
    }

    // 6. Initialize Composer Event Listeners & AI Moderation Pipeline
    if (typeof initComposer === 'function') {
        initComposer();
    }

    // 7. Paystack Support Button
    document.getElementById('paystackPayBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        const amountInput = document.getElementById('customSupportAmount');
        const amount = amountInput ? parseFloat(amountInput.value) || 1000 : 1000;
        if (typeof window.initiatePayment === 'function') {
            window.initiatePayment(amount);
        }
    });

    console.log("✅ Application listeners active");
}

// ====================== NOTIFICATION DROPDOWN ======================
window.toggleNotificationDropdown = function (event) {
    event.stopPropagation();
    const dropdown = document.getElementById('notification-dropdown');
    if (!dropdown) return;
    document.getElementById('more-menu')?.classList.add('hidden');
    dropdown.classList.toggle('hidden');
};

document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('notification-dropdown');
    const container = document.getElementById('notification-container');
    const mobileBtn = document.getElementById('notification-btn-mobile');
    if (dropdown && !dropdown.classList.contains('hidden')) {
        if (!container?.contains(e.target) && !mobileBtn?.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    }
});

// ====================== MOBILE + GLOBAL SEARCH LOGIC ======================
function initHeaderSearch() {
    const mobileSearch = document.getElementById('searchInputMobile');
    const feedSearch = document.getElementById('feedSearchInput');

    const performSearch = (query) => {
        if (feedSearch && feedSearch.value !== query) {
            feedSearch.value = query;
            feedSearch.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (typeof window.applySearchAndFilter === 'function') {
            window.applySearchAndFilter();
        }
    };

    if (mobileSearch) {
        let debounce;
        mobileSearch.addEventListener('input', (e) => {
            clearTimeout(debounce);
            debounce = setTimeout(() => {
                performSearch(e.target.value.trim());
            }, 280);
        });
        mobileSearch.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                performSearch(e.target.value.trim());
            }
        });
    }
}

// ====================== FOCUS BANNER ======================
function initFocusBanner() {
    const banner = document.getElementById('focus-banner');
    if (!banner) return;

    const key = 'vw_focus_banner_dismissed';
    if (localStorage.getItem(key) === '1') {
        banner.remove();
        return;
    }

    document.getElementById('dismiss-focus-banner')?.addEventListener('click', () => {
        localStorage.setItem(key, '1');
        banner.remove();
    });
}

// ====================== COMPOSER WIRING ======================
function wireTestimonyComposer() {
    // Photo / media button + change listener are already handled by composer.js → initComposer()
    // We only wire the voice button and the Publish button here.

    const btnVoice = document.getElementById('btn-voice');
    if (btnVoice && !btnVoice.dataset.wired) {
        btnVoice.addEventListener('click', () => {
            mediaModule.toggleVoiceRecording?.(btnVoice);
        });
        btnVoice.dataset.wired = 'true';
    }

    const postBtn = document.getElementById('postButton');
    if (postBtn && !postBtn.dataset.wired) {
        postBtn.addEventListener('click', () => {
            window.publishTestimony();
        });
        postBtn.dataset.wired = 'true';
    }

    console.log('✅ Testimony composer wired (photo button handled by composer.js)');
}
// ====================== BOOTSTRAP ======================
async function bootstrap() {
    if (isInitialized) return;
    isInitialized = true;
    console.log("🚀 VocalWitness Bootstrap started");

    try {
        initDataSaver();
        refreshTierAndUI();
        loadWeeklyLeaderboard();

        window.addEventListener('auth-changed', (e) => {
            const user = e.detail?.user;
            console.log("🔐 Auth state confirmed:", user ? `Logged in as ${user.uid}` : "Guest session");
            if (typeof updateUIForAuthState === 'function') {
                updateUIForAuthState(user);
            }
            if (!state.currentTab) {
                window.switchTab('square');
            }
            showWelcomeNote();
        });

        setupEventListeners();
        initLanguage?.();
        initProfile?.();
        initFocusBanner();

        if (typeof CitizenTalkEngine === 'function') {
            engineInstance = new CitizenTalkEngine(db, storage);
            window.engineInstance = engineInstance;
            mediaModule.setEngine?.(engineInstance);
        }

        loadDynamicNavigation?.();
        fetchCuratedNews();

        // Initialize Firebase Auth (Dispatches 'auth-changed' when resolved)
        await initAuth();

        console.log("✅ Bootstrap finished successfully");
    } catch (e) {
        console.error("Bootstrap error:", e);
        showToast?.("Failed to initialize app. Please refresh.", "error");
    } finally {
        // Smoothly fade out and remove the global splash screen once everything is settled
        const splash = document.getElementById('app-splash-screen');
        if (splash) {
            splash.style.opacity = '0';
            setTimeout(() => splash.remove(), 300);
        }
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await bootstrap();
    setTimeout(wireTestimonyComposer, 600);
    initHeaderSearch();
});
