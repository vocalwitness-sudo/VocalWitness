/* ====================== IMPORTS ====================== */
import { db, auth, storage } from './firebase-config.js';
import { state, updateAppState, isUserAuthenticated } from './app-state.js';
import { initAuth, requireAuth, updateUIForAuthState, bindHeaderEvents } from './auth.js';
import { initFeed } from './feed.js';
import { initLanguage } from './i18n.js';
import * as mediaModule from './media.js';
import { CitizenTalkEngine } from './vocalWitnessEngine.js';
import { initProfile } from './profile.js';
import { loadDynamicNavigation } from './navigation.js';
import { showToast } from './utils.js';
import { initBookmarks, initBookmarksView } from './bookmarks.js';
import { loadWeeklyLeaderboard, refreshTierAndUI } from './tier.js';
import { wireIndexPage } from './ui-events.js';
import { initComposer } from './composer.js';
import { createEvidencePack } from './evidence-pack.js';
import { generateSha256Hash } from './utils.js';

import {
  collection, addDoc, doc, getDoc, setDoc, updateDoc,
  serverTimestamp, query, getDocs, orderBy, limit
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

/* ====================== GLOBAL MODULE STATE ====================== */
let engineInstance = null;
let isInitialized = false;
let listenersInitialized = false;
let isSwitchingTab = false;

/* ====================== DATA SAVER ====================== */
const DATA_SAVER_KEY = 'vw_data_saver';

function getDataSaverState() {
  return localStorage.getItem(DATA_SAVER_KEY) === 'true';
}

function updateDataSaverUI(isOn) {
  const statusText = isOn ? 'On' : 'Off';
  const statusClass = isOn ? 'text-emerald-400 font-bold' : 'text-zinc-400';

  ['data-saver-status', 'data-saver-status-mobile', 'footer-data-saver-status'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = statusText;
      el.className = statusClass;
    }
  });

  // Desktop button visual feedback
  const desktopBtn = document.getElementById('data-saver-btn');
  if (desktopBtn) {
    desktopBtn.classList.toggle('border-emerald-500', isOn);
    desktopBtn.classList.toggle('bg-emerald-950/40', isOn);
    desktopBtn.classList.toggle('border-zinc-800', !isOn);
    desktopBtn.classList.toggle('bg-zinc-900', !isOn);
  }

  // Mobile button visual feedback
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

function initDataSaver() {
  const isOn = getDataSaverState();
  updateDataSaverUI(isOn);

  ['data-saver-btn', 'data-saver-btn-mobile'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;

    btn.addEventListener('click', () => {
      const newState = !getDataSaverState();
      localStorage.setItem(DATA_SAVER_KEY, String(newState));
      updateDataSaverUI(newState);

      showToast?.(`Data Saver ${newState ? 'Enabled' : 'Disabled'}`, 'success');

      window.dispatchEvent(new CustomEvent('data-saver-changed', {
        detail: { enabled: newState }
      }));
    });
  });
}

function toggleDataSaver() {
  const next = !getDataSaverState();
  localStorage.setItem(DATA_SAVER_KEY, String(next));
  updateDataSaverUI(next);

  window.dispatchEvent(new CustomEvent('data-saver-changed', {
    detail: { enabled: next }
  }));

  console.log('[Data Saver]', next ? 'ON' : 'OFF');
}

window.toggleDataSaver = toggleDataSaver;
/* ====================== TAB SWITCHING ====================== */
const TAB_TO_SECTION = {
  square:    'public-square',
  ledger:    'evidence-ledger',
  arena:     'live-arena',
  mycircle:  'mycircle',
  witness:   'witness'
};

let isSwitchingTab = false;

window.switchTab = async function(tab) {
  if (isSwitchingTab) return;
  isSwitchingTab = true;

  console.log('[Tab] Switching to:', tab);

  try {
    // 1. Update nav button styles
    document.querySelectorAll('#main-nav button[data-tab]').forEach(btn => {
      const isActive = btn.dataset.tab === tab;
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      btn.classList.toggle('active', isActive);

      // Reset common classes
      btn.classList.remove(
        'bg-emerald-500', 'text-black', 'shadow-lg', 'shadow-emerald-500/20',
        'bg-sky-950/50', 'text-sky-300', 'border-sky-700/60',
        'bg-amber-950/40', 'text-amber-300', 'border-amber-700/50',
        'bg-zinc-900', 'text-zinc-300', 'border-zinc-700'
      );

      if (isActive) {
        if (tab === 'square') {
          btn.classList.add('bg-emerald-500', 'text-black', 'shadow-lg', 'shadow-emerald-500/20');
        } else if (tab === 'arena') {
          btn.classList.add('bg-sky-950/50', 'text-sky-300', 'border', 'border-sky-700/60');
        } else if (tab === 'witness') {
          btn.classList.add('bg-amber-950/40', 'text-amber-300', 'border', 'border-amber-700/50');
        } else {
          btn.classList.add('bg-zinc-900', 'text-zinc-300', 'border', 'border-zinc-700');
        }
      } else {
        btn.classList.add('bg-zinc-900', 'text-zinc-300', 'border', 'border-zinc-700');
      }
    });

    // 2. Hide all sections
    Object.values(TAB_TO_SECTION).forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.classList.add('hidden');
        el.classList.remove('block');
      }
    });

    // 3. Show the selected section
    const sectionId = TAB_TO_SECTION[tab] || 'public-square';
    const section = document.getElementById(sectionId);
    if (section) {
      section.classList.remove('hidden');
      section.classList.add('block');
    } else {
      console.warn('[Tab] Section not found:', sectionId);
    }

    // 4. Update URL hash (for bookmarking / back button)
    const newHash = `#${tab === 'square' ? 'citizen-talk' : tab}`;
    if (window.location.hash !== newHash) {
      history.pushState({ tab }, '', newHash);
    }

    // 5. Run tab-specific init
    if (tab === 'square' && typeof initFeed === 'function') {
      initFeed(undefined, 'citizen-talk');
    }
    if (tab === 'ledger' && typeof loadEvidenceLedger === 'function') {
      loadEvidenceLedger();
    }
    if (tab === 'mycircle' && typeof loadCircle === 'function') {
      loadCircle();
    }
    if (tab === 'witness' && typeof initFeed === 'function') {
      initFeed(undefined, 'witness-voice');
    }

  } finally {
    isSwitchingTab = false;
  }
};

// Wire the nav buttons once
function wireTabButtons() {
  document.querySelectorAll('#main-nav button[data-tab]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      window.switchTab(btn.dataset.tab);
    });
  });
}

// Handle browser back/forward history state
window.addEventListener('popstate', () => {
  const hash = window.location.hash.slice(1);
  const tab = hash === 'citizen-talk' || !hash ? 'square' : hash;
  window.switchTab(tab);
});

/* ====================== PAYMENT (PAYSTACK) ====================== */
const PAYSTACK_PUBLIC_KEY = 'pk_live_5d13a6db326f02375127aae9d0fb03678ed1d923'; // TODO: move to env / Remote Config

window.initiatePayment = function (amount, email = null, metadata = {}) {
  if (!requireAuth?.("Sign in to support VocalWitness")) return;

  if (typeof PaystackPop === 'undefined') {
    showToast?.("Payment gateway library not loaded. Please refresh.", "error");
    return;
  }

  const finalAmount = Number(amount);
  if (!finalAmount || finalAmount < 100) {
    showToast?.("Minimum support amount is ₦100", "error");
    return;
  }

  try {
    const handler = PaystackPop.setup({
      key: PAYSTACK_PUBLIC_KEY,
      email: email || auth?.currentUser?.email || 'guest@vocalwitness.com',
      amount: Math.round(finalAmount * 100), // kobo
      currency: "NGN",
      metadata: {
        source: "VocalWitness",
        userId: auth?.currentUser?.uid || null,
        ...metadata
      },
      onSuccess: (transaction) => {
        console.log('[Paystack] Success:', transaction);
        showToast?.(`✅ Payment successful! Ref: ${transaction.reference}`, "success");
        window.closeSupportModal?.();
      },
      onCancel: () => {
        showToast?.("Payment was cancelled", "info");
      }
    });
    handler.openIframe();
  } catch (err) {
    console.error("[Paystack] Startup error:", err);
    showToast?.("Unable to open payment gateway", "error");
  }
};

/* ====================== GLOBAL CLICK OUTSIDE ====================== */
window.addEventListener('click', (e) => {
  const dropdown = document.querySelector('.dropdown-container');
  const menu = document.getElementById('more-menu');
  if (menu && dropdown && !dropdown.contains(e.target)) {
    menu.classList.add('hidden');
  }
});

/* ====================== MODAL CONTROLLERS ====================== */
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

/* ====================== WELCOME NOTE ====================== */
function showWelcomeNote() {
  if (!auth.currentUser || localStorage.getItem('hasSeenWelcome')) return;
  showToast("🎉 Welcome to VocalWitness! Your voice matters in Citizen Talk.", "success");
  localStorage.setItem('hasSeenWelcome', 'true');
}

/* ====================== PUBLISH TESTIMONY ====================== */
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

  // Auto-generate title if empty
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
    // 1. Ensure user document exists
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

    // 2. Media handling (fail-closed)
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

    const userSelectedMedia = typeof mediaModule?.hasPendingMedia === 'function'
      ? mediaModule.hasPendingMedia()
      : false;

    if (typeof mediaModule?.uploadForensicMedia === 'function') {
      try {
        const uploaded = await mediaModule.uploadForensicMedia();
        if (uploaded) {
          mediaData = { ...mediaData, ...uploaded };
        } else if (userSelectedMedia) {
          throw new Error('Media upload returned empty result');
        }
      } catch (mediaErr) {
        console.error('[publish] Media upload failed – aborting:', mediaErr);

        const isCorsLike = mediaErr?.message?.includes('Network error') ||
                           mediaErr?.message?.includes('CORS') ||
                           mediaErr?.name === 'NetworkError';

        showToast(
          isCorsLike
            ? 'Media upload blocked (CORS). Open https://vocalwitness.com and try again. Report was NOT published.'
            : 'Media upload failed. Report was NOT published. Please try again.',
          'error'
        );

        window.__isPublishing = false;
        if (postBtn) {
          postBtn.disabled = false;
          postBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
        return;
      }
    }

    // 2b. Body hash
    try {
      if (content && typeof generateSha256Hash === 'function') {
        const textBlob = new Blob([content], { type: 'text/plain' });
        mediaData.bodyHash = await generateSha256Hash(textBlob);
      }
    } catch (hashErr) {
      console.warn('[publish] Could not compute bodyHash:', hashErr);
    }

    // 3. Final payload
    const testimonyData = {
      authorId: currentUser.uid,
      content,
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

    console.log('[publish] FINAL PAYLOAD:', {
      ...testimonyData,
      createdAt: '[serverTimestamp]',
      contentLen: content.length
    });

    // 4. Write to Firestore
    const docRef = await addDoc(collection(db, 'testimonies'), testimonyData);
    console.log('[publish] SUCCESS →', docRef.id);

    // 5. Update throttle
    await setDoc(userRef, {
      lastTestimonyAt: serverTimestamp()
    }, { merge: true });

    showToast("🛡️ Report sealed and published", "success");

    // Reset UI
    if (titleInput) titleInput.value = '';
    if (textarea) textarea.value = '';
    if (typeof mediaModule?.resetMediaState === 'function') {
      mediaModule.resetMediaState();
    }
    if (typeof initFeed === 'function') {
      initFeed(db, 'citizen-talk');
    }

  } catch (err) {
    console.error('[publish] FULL ERROR:', err);
    console.error('[publish] code:', err.code, 'message:', err.message);

    if (err.code === 'permission-denied') {
      showToast("Permission denied. Check console for exact rule failure.", "error");
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


/* ====================== EVIDENCE LEDGER ====================== */
async function loadEvidenceLedger() {
  // Support both possible container IDs for compatibility
  const container = document.getElementById('ledger-list') || 
                    document.getElementById('ledgerContainer') ||
                    document.getElementById('evidence-ledger');

  if (!container) {
    console.warn('[Ledger] No container found');
    return;
  }

  // Clear and show loading state
  container.innerHTML = `
    <div class="glass rounded-3xl p-6 sm:p-8 border border-zinc-700/60 shadow-2xl">
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 pb-5 border-b border-zinc-800">
        <div>
          <h2 class="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <span>📜</span> Public Record
          </h2>
          <p class="text-sm text-zinc-400 mt-1">Permanent • Timestamped • Immutable</p>
        </div>
        <button id="syncLedgerBtn" type="button"
                class="flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs font-medium text-emerald-400 transition hover:border-emerald-500/50 hover:bg-zinc-800 active:scale-95">
          🔄 Refresh
        </button>
      </div>
      <div id="ledgerTableInnerWrapper" class="overflow-x-auto">
        <div class="text-center py-16 text-zinc-500 animate-pulse">
          Loading sealed records...
        </div>
      </div>
    </div>`;

  const innerWrapper = document.getElementById('ledgerTableInnerWrapper');
  const syncBtn = document.getElementById('syncLedgerBtn');

  if (syncBtn) {
    syncBtn.addEventListener('click', () => {
      if (typeof window.refreshLedger === 'function') {
        window.refreshLedger();
      } else {
        loadEvidenceLedger();
      }
    }, { once: true });
    syncBtn.disabled = true;
  }

  try {
    const q = query(
      collection(db, "testimonies"),
      orderBy("timestamp", "desc"),
      limit(25)
    );

    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      innerWrapper.innerHTML = `
        <div class="text-center py-14 text-zinc-500">
          <p class="text-base font-medium text-zinc-400">No sealed records yet.</p>
          <p class="mt-1 text-sm text-zinc-600">Published reports will appear here permanently.</p>
        </div>`;
      return;
    }

    let html = `
      <table class="w-full text-left border-collapse">
        <thead>
          <tr class="border-b border-zinc-800 text-xs text-zinc-400 uppercase tracking-wider">
            <th class="py-3 px-3 sm:px-4">Witness</th>
            <th class="py-3 px-3 sm:px-4">Summary</th>
            <th class="py-3 px-3 sm:px-4">Status</th>
            <th class="py-3 px-3 sm:px-4">Timestamp</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-zinc-800/60 text-sm text-zinc-300">`;

    querySnapshot.forEach((docSnapshot) => {
      const data = docSnapshot.data();
      const dateStr = data.timestamp
        ? new Date(data.timestamp).toLocaleString()
        : 'N/A';

      const hasHash = data.imageHash || data.audioHash || data.videoHash || data.bodyHash || data.hasForensic;
      const hashDisplay = hasHash
        ? `<span class="inline-flex items-center gap-1 font-semibold text-emerald-400">🔒 Verified</span>`
        : `<span class="text-zinc-500">Standard</span>`;

      html += `
        <tr class="hover:bg-zinc-800/40 transition">
          <td class="py-3.5 px-3 sm:px-4 font-medium text-white">${escapeHtml(data.author || 'Anonymous')}</td>
          <td class="py-3.5 px-3 sm:px-4 max-w-[180px] sm:max-w-xs truncate text-zinc-300">${escapeHtml(data.content || '')}</td>
          <td class="py-3.5 px-3 sm:px-4 font-mono text-xs">${hashDisplay}</td>
          <td class="py-3.5 px-3 sm:px-4 text-xs text-zinc-500">${dateStr}</td>
        </tr>`;
    });

    html += `</tbody></table>`;
    innerWrapper.innerHTML = html;

  } catch (err) {
    console.error("[Ledger] Fetch error:", err);
    if (innerWrapper) {
      innerWrapper.innerHTML = `
        <div class="text-center py-10 text-red-400">
          Failed to load ledger records.<br>
          <span class="text-sm text-zinc-500">Please check permissions or try again.</span>
        </div>`;
    }
  } finally {
    if (syncBtn) syncBtn.disabled = false;
  }
}

/* ====================== CURATED NEWS TICKER ====================== */
async function fetchCuratedNews() {
  const tickerEl = document.getElementById('ticker-content');
  if (!tickerEl) return;

  const RSS_URL = 'https://api.rss2json.com/v1/api.json?rss_url=https://feeds.bbci.co.uk/news/world/rss.xml';

  try {
    const res = await fetch(RSS_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();

    if (data.status === 'ok' && Array.isArray(data.items) && data.items.length > 0) {
      const headlines = data.items.slice(0, 8).map(item => {
        const safeTitle = escapeHtml(item.title || '');
        return `<span class="ticker-item"><strong class="text-emerald-400">•</strong> ${safeTitle}</span>`;
      }).join(' &nbsp;&nbsp;&nbsp; ');

      tickerEl.innerHTML = headlines;
      return;
    }

    throw new Error('Malformed RSS payload');
  } catch (err) {
    console.warn("[Ticker] Fallback active:", err.message);
    tickerEl.innerHTML = `
      <span class="ticker-item text-slate-400">
        🛡️ Public Square active • Zero-knowledge ledger online • Standby for live updates
      </span>`;
  }
}

/* ====================== UTILITIES ====================== */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ====================== SETUP EVENT LISTENERS ====================== */
function setupEventListeners() {
  if (window.listenersInitialized) return;
  window.listenersInitialized = true;

  console.log("✅ Wiring application listeners...");

  // Global click delegation
  document.addEventListener('click', (e) => {
    const actionTarget = e.target.closest('[data-action]');

    // Fallback for buttons without data-action
    if (!actionTarget) {
      if (e.target.closest('#data-saver-btn') || e.target.closest('#data-saver-btn-mobile')) {
        e.preventDefault();
        if (typeof toggleDataSaver === 'function') toggleDataSaver();
        return;
      }
      if (e.target.closest('#openSupportModalBtn') || e.target.closest('#openSupportModalBtnMobile')) {
        e.preventDefault();
        if (typeof window.openSupportModal === 'function') window.openSupportModal();
        return;
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
        if (typeof window.openAuthModal === 'function') {
          window.openAuthModal();
        } else if (typeof window.openAuthModalBtn === 'function') {
          // fallback
        }
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
        document.querySelectorAll('.tab-view, [role="tabpanel"]').forEach(view => {
          view.classList.add('hidden');
        });
        document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
        if (typeof initBookmarksView === 'function') initBookmarksView();
        break;

      case 'open-notifications':
        e.preventDefault();
        showToast?.("🔔 Notification center coming online...", "info");
        break;

      default:
        break;
    }
  });

  // Notification dropdown
  const notifBtn = document.getElementById('notification-btn') || 
                   document.getElementById('notification-btn-mobile');
  if (notifBtn && typeof window.toggleNotificationDropdown === 'function') {
    notifBtn.addEventListener('click', window.toggleNotificationDropdown);
  }

  // Language selectors
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

  // Main navigation tabs
  const mainNav = document.getElementById('main-nav');
  if (mainNav) {
    mainNav.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-tab]');
      if (btn && typeof window.switchTab === 'function') {
        e.preventDefault();
       wireTabButtons();
      }
    });
  }

  // Header-specific events
  if (typeof bindHeaderEvents === 'function') {
    bindHeaderEvents();
  }

  // Composer
  if (typeof initComposer === 'function') {
    initComposer();
  }

  // Paystack button
  document.getElementById('paystackPayBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    const amountInput = document.getElementById('customSupportAmount');
    const amount = amountInput ? parseFloat(amountInput.value) || 15 : 15;
    if (typeof window.initiatePayment === 'function') {
      window.initiatePayment(amount);
    }
  });

  console.log("✅ Application listeners active");
}

/* ====================== NOTIFICATION DROPDOWN ====================== */
window.toggleNotificationDropdown = function (event) {
  event?.stopPropagation();
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

/* ====================== MOBILE + GLOBAL SEARCH ====================== */
function initHeaderSearch() {
  const mobileSearch = document.getElementById('searchInputMobile') || 
                       document.getElementById('global-search');
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

/* ====================== FOCUS BANNER ====================== */
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

/* ====================== COMPOSER WIRING ====================== */
function wireTestimonyComposer() {
  // Photo/video handled by composer.js → initComposer()
  // We only wire voice + publish here

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

  console.log('✅ Testimony composer wired');
}

/* ====================== BOOTSTRAP ====================== */
async function bootstrap() {
  if (isInitialized) return;
  isInitialized = true;

  console.log("🚀 VocalWitness Bootstrap started");

  try {
    // Core UI
    initDataSaver();
    initFocusBanner();
    initHeaderSearch();

    // Tier + leaderboard
    if (typeof refreshTierAndUI === 'function') refreshTierAndUI();
    if (typeof loadWeeklyLeaderboard === 'function') loadWeeklyLeaderboard();

    // Auth state listener
    window.addEventListener('auth-changed', (e) => {
      const user = e.detail?.user;
      console.log("🔐 Auth state:", user ? `Logged in as ${user.uid}` : "Guest");

      if (typeof updateUIForAuthState === 'function') {
        updateUIForAuthState(user);
      }

      if (!state?.currentTab) {
        window.switchTab?.('square');
      }

      showWelcomeNote();
    });

    // Page wiring
    if (typeof wireIndexPage === 'function') wireIndexPage();
    if (typeof initLanguage === 'function') initLanguage();
    if (typeof initProfile === 'function') initProfile();

    // Engine
    if (typeof CitizenTalkEngine === 'function' && db && storage) {
      engineInstance = new CitizenTalkEngine(db, storage);
      window.engineInstance = engineInstance;
      mediaModule.setEngine?.(engineInstance);
    } else {
      console.warn("CitizenTalkEngine / db / storage not ready — engine skipped");
    }

    // Navigation + news
    if (typeof loadDynamicNavigation === 'function') loadDynamicNavigation();
    fetchCuratedNews();

    // Auth
    await initAuth();

    // Event listeners
    setupEventListeners();

    console.log("✅ Bootstrap finished successfully");

  } catch (e) {
    console.error("Bootstrap error:", e);
    showToast?.("Failed to initialize app. Please refresh.", "error");
  } finally {
    // Fade out splash screen
    const splash = document.getElementById('app-splash-screen');
    if (splash) {
      splash.style.opacity = '0';
      setTimeout(() => splash.remove(), 350);
    }
  }
}

/* ====================== DOM READY ====================== */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await bootstrap();
  } catch (err) {
    console.error('Bootstrap failed:', err);
  }

  // Wire composer after a short delay to ensure all elements exist
  setTimeout(() => {
    if (typeof wireTestimonyComposer === 'function') {
      wireTestimonyComposer();
    }
  }, 500);
});
