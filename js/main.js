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
import { getAudioForPublish, uploadForensicMedia } from './media.js';

import {
  collection, addDoc, doc, getDoc, setDoc, updateDoc,
  serverTimestamp, query, getDocs, orderBy, limit
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

/* ====================== GLOBAL ERROR LOGGING ====================== */
window.addEventListener('error', (event) => {
  console.error('🔴 Global Error:', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    error: event.error
  });
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('🔴 Unhandled Promise Rejection:', event.reason);
});

console.log('%c[VocalWitness] main.js loaded', 'color:#10b981;font-weight:bold');

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
  square:   'public-square',
  ledger:   'evidence-ledger',
  arena:    'live-arena',
  mycircle: 'mycircle',
  witness:  'witness'
};

/** Active styles per tab (inactive is always the same) */
const TAB_ACTIVE_CLASSES = {
  square:  ['bg-emerald-500', 'text-black', 'shadow-lg', 'shadow-emerald-500/20'],
  arena:   ['bg-sky-950/50', 'text-sky-300', 'border', 'border-sky-500'],
  witness: ['bg-amber-950/40', 'text-amber-300', 'border', 'border-amber-500'],
  // ledger + mycircle (+ default)
  default: ['bg-emerald-600/20', 'text-emerald-300', 'border', 'border-emerald-500/60']
};

const TAB_INACTIVE_CLASSES = ['bg-zinc-900', 'text-zinc-300', 'border', 'border-zinc-700'];

/** Every class we ever add for active/inactive — used to reset */
const ALL_TAB_STYLE_CLASSES = [
  ...new Set([
    ...Object.values(TAB_ACTIVE_CLASSES).flat(),
    ...TAB_INACTIVE_CLASSES
  ])
];

let isSwitchingTab = false;

window.switchTab = async function (tab) {
  if (isSwitchingTab) return;
  if (!TAB_TO_SECTION[tab]) tab = 'square';

  isSwitchingTab = true;
  console.log('[Tab] Switching to:', tab);

  try {
    // 1. Nav buttons
    document.querySelectorAll('#main-nav button[data-tab]').forEach((btn) => {
      const isActive = btn.dataset.tab === tab;
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      btn.classList.toggle('active', isActive);

      btn.classList.remove(...ALL_TAB_STYLE_CLASSES);

      if (isActive) {
        const active =
          TAB_ACTIVE_CLASSES[tab] || TAB_ACTIVE_CLASSES.default;
        btn.classList.add(...active);
      } else {
        btn.classList.add(...TAB_INACTIVE_CLASSES);
      }
    });

    // 2. Hide all sections
    Object.values(TAB_TO_SECTION).forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.add('hidden');
      el.classList.remove('block');
      el.setAttribute('hidden', '');
      el.setAttribute('aria-hidden', 'true');
    });

    // 3. Show selected section
    const sectionId = TAB_TO_SECTION[tab];
    const section = document.getElementById(sectionId);
    if (section) {
      section.classList.remove('hidden');
      section.classList.add('block');
      section.removeAttribute('hidden');
      section.setAttribute('aria-hidden', 'false');
    } else {
      console.warn('[Tab] Section not found:', sectionId);
    }

    // 4. URL hash (back/forward friendly)
    const newHash = `#${tab === 'square' ? 'citizen-talk' : tab}`;
    if (window.location.hash !== newHash) {
      history.pushState({ tab }, '', newHash);
    }

    // 5. Tab-specific init (lazy, non-blocking where possible)
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
    if (tab === 'arena' && typeof initLiveArena === 'function') {
      initLiveArena();
    }
  } catch (err) {
    console.error('[Tab] switchTab failed:', err);
  } finally {
    isSwitchingTab = false;
  }
};


/**
 * Tabs + More menu — single init, no double-bind, a11y-aware
 */
function initNavigationChrome() {
  wireTabButtons();
  initMoreMenu();
  initHashRouting();
}

function wireTabButtons() {
  const nav = document.getElementById('main-nav');
  if (!nav || nav.dataset.tabsWired === 'true') return;
  nav.dataset.tabsWired = 'true';

  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-tab]');
    if (!btn || !nav.contains(btn)) return;
    e.preventDefault();
    const tab = btn.dataset.tab;
    if (tab && typeof window.switchTab === 'function') {
      window.switchTab(tab);
    }
  });
}

function initMoreMenu() {
  const moreBtn = document.getElementById('more-btn');
  const moreMenu = document.getElementById('more-menu');
  if (!moreBtn || !moreMenu) return;
  if (moreBtn.dataset.moreWired === 'true') return;
  moreBtn.dataset.moreWired = 'true';

  const setOpen = (open) => {
    moreMenu.classList.toggle('hidden', !open);
    moreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  };

  moreBtn.setAttribute('aria-haspopup', 'true');
  moreBtn.setAttribute('aria-expanded', 'false');

  moreBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(moreMenu.classList.contains('hidden'));
  });

  // Outside click
  document.addEventListener('click', (e) => {
    if (moreMenu.classList.contains('hidden')) return;
    if (moreMenu.contains(e.target) || moreBtn.contains(e.target)) return;
    setOpen(false);
  });

  // Escape closes menu
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !moreMenu.classList.contains('hidden')) {
      setOpen(false);
      moreBtn.focus();
    }
  });
}

function initHashRouting() {
  if (window.__hashRoutingWired) return;
  window.__hashRoutingWired = true;

  const resolveTabFromHash = () => {
    const hash = (window.location.hash || '').slice(1);
    // Map legacy / empty hashes
    if (!hash || hash === 'citizen-talk') return 'square';
    return hash;
  };

  window.addEventListener('popstate', () => {
    if (typeof window.switchTab === 'function') {
      window.switchTab(resolveTabFromHash());
    }
  });

  // Optional: also react to hashchange (some browsers / in-app links)
  window.addEventListener('hashchange', () => {
    if (typeof window.switchTab === 'function') {
      window.switchTab(resolveTabFromHash());
    }
  });
}

// Call once after DOM is ready (bootstrap / setupEventListeners)
initNavigationChrome();

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

  const currentUser = auth.currentUser;
  if (!currentUser) {
    showToast("Session expired. Please re-authenticate.", "error");
    return;
  }

  const titleInput = document.getElementById('testimonyTitle');
  const textarea = document.getElementById('mainInput');
  let title = titleInput ? titleInput.value.trim() : '';
  const content = textarea ? textarea.value.trim() : '';

  if (!content) {
    showToast("Please write something before publishing", "error");
    return;
  }

  // Auto-generate title if empty
  if (!title && content) {
    title = content.length <= 80
      ? content
      : content.slice(0, 80).replace(/\s+\S*$/, '') + '...';
  }

  const postBtn = document.getElementById('postButton') || document.getElementById('postBtn');
  const originalBtnHTML = postBtn ? postBtn.innerHTML : '';

  window.__isPublishing = true;
  if (postBtn) {
    postBtn.disabled = true;
    postBtn.classList.add('opacity-75', 'cursor-not-allowed', 'scale-[0.98]');
    postBtn.innerHTML = `
      <span class="inline-block w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin mr-2 align-middle"></span>
      <span class="align-middle">Sealing & Publishing...</span>
    `;
  }

  try {
    // AI notice (non-blocking)
    try {
      const { remindUserOfAIRestrictions } = await import('./ai-services.js');
      remindUserOfAIRestrictions("publish");
    } catch (aiErr) {
      console.warn("[publish] AI notice skipped:", aiErr);
    }

    // Ensure user document exists
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

    // ====================== MEDIA HANDLING (FAIL-CLOSED) ======================
    const audioInfo = typeof getAudioForPublish === 'function' ? getAudioForPublish() : null;

    let mediaData = {
      imageUrl: null,
      videoUrl: null,
      audioUrl: null,
      audioSource: null,
      audioLabel: null,
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
      : !!(audioInfo || window.selectedImageFile || window.selectedVideoFile);

    const uploaderFunc = typeof uploadForensicMedia === 'function'
      ? uploadForensicMedia
      : mediaModule?.uploadForensicMedia;

    if (typeof uploaderFunc === 'function') {
      try {
        const activeImg = typeof activeImageFile !== 'undefined' ? activeImageFile : window.selectedImageFile;
        const activeVid = typeof activeVideoFile !== 'undefined' ? activeVideoFile : window.selectedVideoFile;

        const uploaded = await uploaderFunc(
          activeImg,
          activeVid,
          audioInfo ? audioInfo.blob : null
        );

        if (uploaded) {
          mediaData = {
            ...mediaData,
            ...uploaded,
            audioSource: audioInfo ? audioInfo.source : null
          };
          if (audioInfo?.isLive) {
            mediaData.audioLabel = 'Live Voice';
          } else if (audioInfo) {
            mediaData.audioLabel = 'Uploaded Audio';
          }
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
        return;
      }
    }

    // Body hash
    try {
      if (content && typeof generateSha256Hash === 'function') {
        const textBlob = new Blob([content], { type: 'text/plain' });
        mediaData.bodyHash = await generateSha256Hash(textBlob);
      }
    } catch (hashErr) {
      console.warn('[publish] Could not compute bodyHash:', hashErr);
    }

    // ========== GENERATE ZK PROOF ==========
    let zkResult = {
      isFallback: true,
      proofType: 'NONE',
      proof: null,
      publicSignals: []
    };

    try {
      const { generateZKProofAsync } = await import('./zk-client.js');
      const contentHash = mediaData.bodyHash || await generateSha256Hash(new Blob([content]));
      const authorHash  = await generateSha256Hash(currentUser.uid);

      zkResult = await generateZKProofAsync({
        contentHash,
        authorHash,
        timestamp: Date.now().toString(),
        mediaHash: mediaData.imageHash || mediaData.videoHash || mediaData.audioHash || mediaData.bodyHash || '0'
      });

      console.log('[publish] ZK result:', zkResult.proofType, zkResult.isFallback ? '(fallback)' : '(real proof)');
    } catch (zkErr) {
      console.warn('[publish] ZK generation failed, continuing without proof:', zkErr);
    }

    // Final payload
    const testimonyData = {
      authorId: currentUser.uid,
      content,
      createdAt: serverTimestamp(),
      channel: 'citizen-talk',
      title: title || null,
      author: currentUser.displayName || 'Registered Witness',
      feedVisibility: 'citizen-talk',
      timestamp: Date.now(),

      // Media
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
      packCoreHash: mediaData.packCoreHash || null,

      // ZK Proof
      zkProof: zkResult.proof || null,
      zkPublicSignals: zkResult.publicSignals || [],
      proofType: zkResult.proofType || 'NONE',
      isZkVerified: !zkResult.isFallback
    };

    // Write to Firestore
    const docRef = await addDoc(collection(db, 'testimonies'), testimonyData);
    console.log('[publish] SUCCESS →', docRef.id);

    // Update throttle
    await setDoc(userRef, {
      lastTestimonyAt: serverTimestamp()
    }, { merge: true });

    // Success toast
    if (testimonyData.isZkVerified) {
      showToast("🛡️ Report sealed with Zero-Knowledge proof", "success");
    } else {
      showToast("🛡️ Report sealed and published", "success");
    }

    // Reset UI
    if (titleInput) titleInput.value = '';
    if (textarea) textarea.value = '';
    if (typeof mediaModule?.resetMediaState === 'function') {
      mediaModule.resetMediaState();
    }
    const fileInputEl = document.getElementById('mediaInput') || document.querySelector('input[type="file"]');
    if (fileInputEl) fileInputEl.value = '';

    if (typeof initFeed === 'function') {
      initFeed(db, 'citizen-talk');
    }

  } catch (err) {
    console.error('[publish] FULL ERROR:', err);
    if (err.code === 'permission-denied') {
      showToast("Permission denied. Check console for exact rule failure.", "error");
    } else {
      showToast("Failed to publish. See console.", "error");
    }
  } finally {
    window.__isPublishing = false;
    if (postBtn) {
      postBtn.disabled = false;
      postBtn.classList.remove('opacity-75', 'cursor-not-allowed', 'scale-[0.98]');
      postBtn.innerHTML = originalBtnHTML;
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

  // Proper re-bindable refresh button (no { once: true })
  if (syncBtn) {
    syncBtn.onclick = () => {
      if (typeof window.refreshLedger === 'function') {
        window.refreshLedger();
      } else {
        loadEvidenceLedger();
      }
    };
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

      // Safe timestamp handling (works with both number and Firestore Timestamp)
      const ts = data.timestamp;
      const dateStr = ts
        ? (ts.toDate ? ts.toDate() : new Date(ts)).toLocaleString()
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

  // ---------- Global click delegation (data-action + tabs) ----------
  document.addEventListener('click', (e) => {
    // Tab buttons
    const tabBtn = e.target.closest('#main-nav button[data-tab]');
    if (tabBtn && typeof window.switchTab === 'function') {
      e.preventDefault();
      window.switchTab(tabBtn.dataset.tab);
      return;
    }

    // data-action buttons
    const actionTarget = e.target.closest('[data-action]');
    if (!actionTarget) {
      // Fallbacks for buttons without data-action
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
        document.querySelectorAll('.tab-view, [role="tabpanel"]').forEach(view => {
          view.classList.add('hidden');
        });
        document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
        if (typeof initBookmarksView === 'function') initBookmarksView();
        break;
      case 'open-notifications':
        // Handled by dedicated listeners
        break;
      default:
        break;
    }
  });

  // ---------- More Menu ----------
  const moreBtn = document.getElementById('more-btn');
  const moreMenu = document.getElementById('more-menu');

  if (moreBtn && moreMenu) {
    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      moreMenu.classList.toggle('hidden');
      // Close notification dropdowns
      document.getElementById('notification-dropdown')?.classList.add('hidden');
      document.getElementById('notification-dropdown-mobile')?.classList.add('hidden');
    });
  }

  // ---------- Notification Toggles ----------
  function toggleNotification(id) {
    const dropdown = document.getElementById(id);
    if (!dropdown) return;

    moreMenu?.classList.add('hidden');
    document.getElementById('notification-dropdown')?.classList.add('hidden');
    document.getElementById('notification-dropdown-mobile')?.classList.add('hidden');

    dropdown.classList.toggle('hidden');
  }

  document.getElementById('notification-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleNotification('notification-dropdown');
  });

  document.getElementById('notification-btn-mobile')?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleNotification('notification-dropdown-mobile');
  });

  // ---------- Global click-outside closer ----------
  document.addEventListener('click', (e) => {
    // More menu
    if (moreMenu && !moreMenu.contains(e.target) && !moreBtn?.contains(e.target)) {
      moreMenu.classList.add('hidden');
    }
    // Desktop notifications
    const notifDesktop = document.getElementById('notification-dropdown');
    const notifBtnDesktop = document.getElementById('notification-btn');
    if (notifDesktop && !notifDesktop.contains(e.target) && !notifBtnDesktop?.contains(e.target)) {
      notifDesktop.classList.add('hidden');
    }
    // Mobile notifications
    const notifMobile = document.getElementById('notification-dropdown-mobile');
    const notifBtnMobile = document.getElementById('notification-btn-mobile');
    if (notifMobile && !notifMobile.contains(e.target) && !notifBtnMobile?.contains(e.target)) {
      notifMobile.classList.add('hidden');
    }
  });

  // ---------- Language selectors ----------
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

  // ---------- Header-specific events ----------
  if (typeof bindHeaderEvents === 'function') {
    bindHeaderEvents();
  }

  // ---------- Composer ----------
  if (typeof initComposer === 'function') {
    initComposer();
  }

  // ---------- Paystack button ----------
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
  const postBtn = document.getElementById('postButton');
  if (postBtn && !postBtn.dataset.wired) {
    postBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window.publishTestimony();
    });
    postBtn.dataset.wired = 'true';
  }
  console.log('✅ Testimony composer wired (publish only)');
}

/* ====================== BOOTSTRAP ====================== */
async function bootstrap() {
  if (isInitialized) {
    console.warn('[Bootstrap] Already initialized – skipped');
    return;
  }
  isInitialized = true;

  console.log('%c🚀 VocalWitness Bootstrap started', 'color:#10b981;font-weight:bold');

  try {
    // Core UI
    console.log('[Bootstrap] Initializing core UI...');
    initDataSaver();
    initFocusBanner();
    initHeaderSearch();

    // Tier + leaderboard
    if (typeof refreshTierAndUI === 'function') {
      console.log('[Bootstrap] Refreshing tier UI...');
      refreshTierAndUI();
    }
    if (typeof loadWeeklyLeaderboard === 'function') {
      loadWeeklyLeaderboard();
    }

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
      console.log('[Bootstrap] Starting CitizenTalkEngine...');
      engineInstance = new CitizenTalkEngine(db, storage);
      window.engineInstance = engineInstance;
      mediaModule.setEngine?.(engineInstance);

      // Wire Record Live Voice vs Upload existing audio (once)
      if (typeof mediaModule.initMediaButtons === 'function') {
        mediaModule.initMediaButtons();
      }
    } else {
      console.warn('[Bootstrap] CitizenTalkEngine / db / storage not ready — engine skipped');
    }
      
    // Navigation + news
    if (typeof loadDynamicNavigation === 'function') loadDynamicNavigation();
    fetchCuratedNews();

    // Auth
    console.log('[Bootstrap] Initializing auth...');
    await initAuth();

    // Event listeners
    setupEventListeners();

    // Set initial tab
    const initialHash = window.location.hash.slice(1);
    const initialTab = (initialHash === 'citizen-talk' || !initialHash) ? 'square' : initialHash;
    console.log('[Bootstrap] Setting initial tab:', initialTab);

    if (typeof window.switchTab === 'function') {
      window.switchTab(initialTab);
    } else {
      console.error('[Bootstrap] window.switchTab is not defined!');
    }

    console.log('%c✅ Bootstrap finished successfully', 'color:#10b981;font-weight:bold');

  } catch (e) {
    console.error('%c❌ Bootstrap error:', 'color:red;font-weight:bold', e);
    showToast?.("Failed to initialize app. Please refresh.", "error");
  }
}
/* ====================== AGGRESSIVE SPLASH SCREEN REMOVAL ====================== */
function removeSplash() {
  const selectors = [
    '#app-splash-screen',
    '#splash',
    '#loading',
    '#loader',
    '.splash',
    '.loading-screen',
    '.loader',
    '[id*="splash"]',
    '[class*="splash"]',
    '[id*="loading"]',
    '[class*="loading"]'
  ];

  selectors.forEach(selector => {
    document.querySelectorAll(selector).forEach(el => {
      el.style.transition = 'opacity 0.3s ease';
      el.style.opacity = '0';
      el.style.pointerEvents = 'none';
      el.style.visibility = 'hidden';
      setTimeout(() => {
        el.remove();
      }, 350);
    });
  });

  // Restore scrolling just in case
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
}

// At the very end of the Bootstrap process (right after "✅ Bootstrap finished successfully")
function hideSplash() {
  const splash = document.getElementById('app-splash-screen');
  if (!splash) return;

  splash.classList.add('fade-out');          // optional CSS class
  splash.style.opacity = '0';
  splash.style.transition = 'opacity 0.4s ease';
  splash.style.pointerEvents = 'none';

  setTimeout(() => {
    splash.remove();
  }, 450);
}

// Call it when everything is ready
hideSplash();

/* ====================== DOM READY ====================== */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await bootstrap();
  } catch (err) {
    console.error('Bootstrap failed:', err);
  } finally {
    removeSplash();
  }

  // Wire composer after a short delay to ensure all elements exist
  setTimeout(() => {
    if (typeof wireTestimonyComposer === 'function') {
      wireTestimonyComposer();
    }
  }, 500);
});
