// Silence the ambiguous indirect export error
if (typeof window !== 'undefined') {
  window.initDarkMode = window.initDarkMode || function () {};
}
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
  // 1. Update all status texts
  ['data-saver-status', 'data-saver-status-mobile', 'footer-data-saver-status'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = isOn ? 'On' : 'Off';
  });

  // 2. Desktop button – full class rewrite (most reliable)
  const desktopBtn = document.getElementById('data-saver-btn');
  if (desktopBtn) {
    desktopBtn.className = isOn
      ? 'flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-all active:scale-95 border-emerald-500 bg-emerald-950/50 text-emerald-400 hover:border-emerald-400'
      : 'flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-all active:scale-95 border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500 hover:text-white';
  }

  // 3. Mobile button – full class rewrite
  const mobileBtn = document.getElementById('data-saver-btn-mobile');
  if (mobileBtn) {
    mobileBtn.className = isOn
      ? 'flex h-8 items-center gap-1 rounded-lg border px-2 text-[10px] font-medium transition-all active:scale-95 border-emerald-500 bg-emerald-950/50 text-emerald-400'
      : 'flex h-8 items-center gap-1 rounded-lg border px-2 text-[10px] font-medium transition-all active:scale-95 border-zinc-700 bg-zinc-900 text-zinc-400';
  }

  // 4. Icons
  const iconDesktop = document.getElementById('data-saver-icon');
  const iconMobile  = document.getElementById('data-saver-icon-mobile');
  if (iconDesktop) {
    iconDesktop.className = isOn ? 'text-emerald-400' : 'text-zinc-400';
    iconDesktop.style.opacity = isOn ? '1' : '0.7';
  }
  if (iconMobile) {
    iconMobile.className = isOn ? 'text-emerald-400' : 'text-zinc-400';
    iconMobile.style.opacity = isOn ? '1' : '0.7';
  }
}

function initDataSaver() {
  // Set initial state from localStorage
  updateDataSaverUI(getDataSaverState());

  // Wire buttons only once
  ['data-saver-btn', 'data-saver-btn-mobile'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn || btn.dataset.wired === 'true') return;

    btn.dataset.wired = 'true';

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const next = !getDataSaverState();
      localStorage.setItem(DATA_SAVER_KEY, String(next));
      updateDataSaverUI(next);

      // Single clean toast
      if (typeof showToast === 'function') {
        showToast(next ? 'Data Saver turned ON' : 'Data Saver turned OFF', 'info');
      } else {
        // Fallback single toast if showToast does not exist
        showSingleDataSaverToast(next ? 'Data Saver ON' : 'Data Saver OFF');
      }

      window.dispatchEvent(new CustomEvent('data-saver-changed', {
        detail: { enabled: next }
      }));
    });
  });
}

// Global helper used by the main click delegation
window.toggleDataSaver = function () {
  const next = !getDataSaverState();
  localStorage.setItem(DATA_SAVER_KEY, String(next));
  updateDataSaverUI(next);

  if (typeof showToast === 'function') {
    showToast(next ? 'Data Saver turned ON' : 'Data Saver turned OFF', 'info');
  } else {
    showSingleDataSaverToast(next ? 'Data Saver ON' : 'Data Saver OFF');
  }

  window.dispatchEvent(new CustomEvent('data-saver-changed', {
    detail: { enabled: next }
  }));
};

// Tiny fallback toast so we never get multiple messages
let dataSaverToastTimer = null;
function showSingleDataSaverToast(msg) {
  let toast = document.getElementById('data-saver-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'data-saver-toast';
    toast.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] rounded-xl bg-zinc-800 border border-zinc-600 px-5 py-3 text-sm text-white shadow-2xl transition-opacity duration-300 pointer-events-none';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';

  clearTimeout(dataSaverToastTimer);
  dataSaverToastTimer = setTimeout(() => {
    toast.style.opacity = '0';
  }, 2200);
}

/* ====================== TAB SWITCHING ====================== */
const TAB_TO_SECTION = {
  square:   ['public-square'],
  ledger:   ['evidence-ledger'],
  arena:    ['live-arena'],
  mycircle: ['mycircle'],
  witness:  ['witness']
};

const TAB_ACTIVE_CLASSES = {
  square:  ['bg-emerald-500', 'text-black', 'shadow-lg', 'shadow-emerald-500/20'],
  arena:   ['bg-sky-950/50', 'text-sky-300', 'border', 'border-sky-500'],
  witness: ['bg-amber-950/40', 'text-amber-300', 'border', 'border-amber-500'],
  default: ['bg-emerald-600/20', 'text-emerald-300', 'border', 'border-emerald-500/60']
};

const TAB_INACTIVE_CLASSES = ['bg-zinc-900', 'text-zinc-300', 'border', 'border-zinc-700'];

const ALL_TAB_STYLE_CLASSES = [
  ...new Set([
    ...Object.values(TAB_ACTIVE_CLASSES).flat(),
    ...TAB_INACTIVE_CLASSES
  ])
];

window.switchTab = async function (tab) {
  if (isSwitchingTab) return;
  if (!TAB_TO_SECTION[tab]) tab = 'square';

  isSwitchingTab = true;
  console.log('[Tab] Switching to:', tab);

  try {
    // 1. Update nav button styles
    document.querySelectorAll('#main-nav button[data-tab]').forEach((btn) => {
      const isActive = btn.dataset.tab === tab;
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      btn.classList.toggle('active', isActive);

      btn.classList.remove(...ALL_TAB_STYLE_CLASSES);

      if (isActive) {
        const active = TAB_ACTIVE_CLASSES[tab] || TAB_ACTIVE_CLASSES.default;
        btn.classList.add(...active);
      } else {
        btn.classList.add(...TAB_INACTIVE_CLASSES);
      }
    });

    // 2. Hide every tab panel
    Object.values(TAB_TO_SECTION).flat().forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.add('hidden');
      el.setAttribute('hidden', '');
      el.setAttribute('aria-hidden', 'true');
    });

    // 3. Show the selected panel
    const sectionId = TAB_TO_SECTION[tab][0];
    const section = document.getElementById(sectionId);

    if (section) {
      section.classList.remove('hidden');
      section.removeAttribute('hidden');
      section.setAttribute('aria-hidden', 'false');
      console.log('[Tab] Opened section:', sectionId);
    } else {
      console.warn('[Tab] Section not found:', sectionId);
    }

    // 4. Update URL hash
    const newHash = `#${tab === 'square' ? 'citizen-talk' : tab}`;
    if (window.location.hash !== newHash) {
      history.pushState({ tab }, '', newHash);
    }

    // 5. Tab-specific initialization
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

  if (!moreBtn || !moreMenu) {
    console.warn('[more-menu] #more-btn or #more-menu not found in DOM');
    return;
  }

  // Prevent double-wiring
  if (moreBtn.dataset.moreWired === 'true') {
    console.log('[more-menu] Already wired – skipping');
    return;
  }
  moreBtn.dataset.moreWired = 'true';

  const setOpen = (open) => {
    moreMenu.classList.toggle('hidden', !open);
    moreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');

    // Rotate chevron for visual feedback
    const chevron = moreBtn.querySelector('svg');
    if (chevron) {
      chevron.style.transition = 'transform 0.2s ease';
      chevron.style.transform = open ? 'rotate(180deg)' : 'rotate(0deg)';
    }

    console.log('[more-menu] setOpen →', open);
  };

  // Toggle on click
  moreBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const isHidden = moreMenu.classList.contains('hidden');
    console.log('[more-menu] button clicked, currently hidden?', isHidden);
    setOpen(isHidden);
  });

  // Close when clicking outside
  document.addEventListener('click', (e) => {
    if (moreMenu.classList.contains('hidden')) return;
    if (moreMenu.contains(e.target) || moreBtn.contains(e.target)) return;
    setOpen(false);
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !moreMenu.classList.contains('hidden')) {
      setOpen(false);
      moreBtn.focus();
    }
  });

  console.log('[more-menu] Successfully initialized');
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

/**
 * Updates the visual state of the voice recorder UI
 * Call this from your existing start / pause / stop / reset handlers
 */
function updateVoiceUI(state) {
  const btn = document.getElementById('btn-voice');
  const btnText = document.getElementById('btn-voice-text');
  const badge = document.getElementById('btn-voice-badge');
  const instruction = document.getElementById('voice-instruction');
  const replayBtn = document.getElementById('rec-replay-btn');
  const rerecordBtn = document.getElementById('rec-rerecord-btn');
  const pauseBtn = document.getElementById('rec-pause-btn');
  const stopBtn = document.getElementById('rec-stop-btn');

  if (!btn || !btnText) return;

  // Reset classes
  btn.classList.remove('bg-emerald-500', 'text-zinc-950', 'bg-red-600', 'text-white', 'bg-amber-600', 'text-white');
  btn.classList.add('text-emerald-400');

  switch (state) {
    case 'idle':
      btnText.textContent = 'Record Live Voice';
      if (badge) badge.classList.remove('hidden');
      if (instruction) instruction.textContent = 'Tap the button above to start recording. Speak clearly.';
      if (replayBtn) replayBtn.classList.add('hidden');
      if (rerecordBtn) rerecordBtn.classList.add('hidden');
      if (pauseBtn) pauseBtn.classList.remove('hidden');
      if (stopBtn) stopBtn.classList.remove('hidden');
      break;

    case 'recording':
      btnText.textContent = 'Recording…';
      btn.classList.remove('text-emerald-400');
      btn.classList.add('bg-red-600', 'text-white');
      if (badge) badge.classList.add('hidden');
      if (instruction) instruction.textContent = 'Recording in progress… Speak now.';
      if (replayBtn) replayBtn.classList.add('hidden');
      if (rerecordBtn) rerecordBtn.classList.add('hidden');
      break;

    case 'paused':
      btnText.textContent = 'Recording Paused';
      btn.classList.remove('text-emerald-400');
      btn.classList.add('bg-amber-600', 'text-white');
      if (badge) badge.classList.add('hidden');
      if (instruction) instruction.textContent = 'Recording paused. Press Resume or Stop.';
      break;

    case 'stopped':
      btnText.textContent = 'Voice Ready ✓';
      btn.classList.remove('text-emerald-400');
      btn.classList.add('bg-emerald-500', 'text-zinc-950');
      if (badge) badge.classList.add('hidden');
      if (instruction) instruction.textContent = 'Voice recorded. You can replay or re-record.';
      if (replayBtn) replayBtn.classList.remove('hidden');
      if (rerecordBtn) rerecordBtn.classList.remove('hidden');
      if (pauseBtn) pauseBtn.classList.add('hidden');
      if (stopBtn) stopBtn.classList.add('hidden');
      break;
  }
}

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

// ====================== WRITE TO FIRESTORE ======================

// 1. Generate ZK proof (needs the hashes we already have)
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

// 2. Build real Evidence Pack
let evidencePackResult = null;
try {
  const { createEvidencePack } = await import('./evidence-pack.js');

  evidencePackResult = await createEvidencePack({
    content,
    bodyHash: mediaData.bodyHash,
    media: {
      imageUrl: mediaData.imageUrl,
      imageHash: mediaData.imageHash,
      videoUrl: mediaData.videoUrl,
      videoHash: mediaData.videoHash,
      audioUrl: mediaData.audioUrl,
      audioHash: mediaData.audioHash,
    },
    identity: {
      mode: 'IDENTIFIED',                     // change to 'ANONYMOUS' if needed
      authorId: currentUser.uid,
      displayName: currentUser.displayName || 'Registered Witness',
    },
    channel: 'citizen-talk',
    clientCaptureMs: Date.now(),
    testimonyId: null,                        // will be filled after we get the doc ID
    forensicHash: mediaData.imageHash || mediaData.videoHash || mediaData.audioHash || mediaData.bodyHash || null,
  });

  console.log('[publish] Evidence Pack created →', evidencePackResult.packCoreHash?.slice(0, 12) + '…');
} catch (packErr) {
  console.warn('[publish] Evidence Pack creation failed (non-blocking):', packErr);
}

// 3. Final complete payload
const hasAnyHash = !!(
  mediaData.imageHash ||
  mediaData.videoHash ||
  mediaData.audioHash ||
  mediaData.bodyHash ||
  evidencePackResult?.packCoreHash
);

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

  // Forensic / Evidence flags (this is what makes the name true)
  hasForensic: hasAnyHash,
  forensicVerified: hasAnyHash,                 // ← Critical for Forensic Ledger
  hash: mediaData.imageHash || mediaData.videoHash || mediaData.audioHash || mediaData.bodyHash || evidencePackResult?.packCoreHash || null,
  packCoreHash: evidencePackResult?.packCoreHash || null,
  hasEvidencePack: !!evidencePackResult,
  evidencePack: evidencePackResult?.firestorePack || null,

  // ZK Proof
  zkProof: zkResult.proof || null,
  zkPublicSignals: zkResult.publicSignals || [],
  proofType: zkResult.proofType || 'NONE',
  isZkVerified: !zkResult.isFallback,
};

// 4. Write once
const docRef = await addDoc(collection(db, 'testimonies'), testimonyData);
console.log('[publish] SUCCESS →', docRef.id);

// 5. Update the pack with the real testimony ID
if (evidencePackResult && docRef.id) {
  try {
    const { createEvidencePack } = await import('./evidence-pack.js');
    const finalPack = await createEvidencePack({
      content,
      bodyHash: mediaData.bodyHash,
      media: {
        imageUrl: mediaData.imageUrl,
        imageHash: mediaData.imageHash,
        videoUrl: mediaData.videoUrl,
        videoHash: mediaData.videoHash,
        audioUrl: mediaData.audioUrl,
        audioHash: mediaData.audioHash,
      },
      identity: {
        mode: 'IDENTIFIED',
        authorId: currentUser.uid,
        displayName: currentUser.displayName || 'Registered Witness',
      },
      channel: 'citizen-talk',
      clientCaptureMs: Date.now(),
      testimonyId: docRef.id,
      forensicHash: testimonyData.hash,
    });

    await setDoc(docRef, {
      evidencePack: finalPack.firestorePack,
      packCoreHash: finalPack.packCoreHash,
    }, { merge: true });

  } catch (finalPackErr) {
    console.warn('[publish] Could not finalize Evidence Pack with ID:', finalPackErr);
  }
}

// 5.1 Refresh UI ledgers and notify application components
if (typeof window.loadEvidenceLedger === 'function') {
  window.loadEvidenceLedger();
}
if (typeof window.loadForensicLedger === 'function') {
  window.loadForensicLedger();
}
window.dispatchEvent(new CustomEvent('vocalWitness:posted'));

// 6. Update throttle
await setDoc(userRef, {
  lastTestimonyAt: serverTimestamp()
}, { merge: true });
    
    // ====================== SUCCESS STATE ======================
    if (testimonyData.isZkVerified) {
      showToast("🛡️ Report sealed with Zero-Knowledge proof", "success");
    } else {
      showToast("🛡️ Report sealed and published", "success");
    }

    // Show success UI (preferred path)
    const successEl = document.getElementById('publish-success');
    if (successEl) {
      successEl.classList.remove('hidden');
      if (postBtn) postBtn.classList.add('hidden');

      // Auto-hide after 4.5 seconds and restore form
      setTimeout(() => {
        successEl.classList.add('hidden');
        if (postBtn) postBtn.classList.remove('hidden');

        // Reset form
        if (titleInput) titleInput.value = '';
        if (textarea) textarea.value = '';
        if (typeof mediaModule?.resetMediaState === 'function') {
          mediaModule.resetMediaState();
        }
        const fileInputEl = document.getElementById('mediaInput') || document.querySelector('input[type="file"]');
        if (fileInputEl) fileInputEl.value = '';

        // Trigger state update
        window.dispatchEvent(new CustomEvent('media-changed'));
      }, 4500);
    } else {
      // Fallback reset
      if (titleInput) titleInput.value = '';
      if (textarea) textarea.value = '';
      if (typeof mediaModule?.resetMediaState === 'function') {
        mediaModule.resetMediaState();
      }
      const fileInputEl = document.getElementById('mediaInput') || document.querySelector('input[type="file"]');
      if (fileInputEl) fileInputEl.value = '';
    }

    if (typeof initFeed === 'function') {
      initFeed(db, 'citizen-talk');
    }

  } catch (err) {
    console.error('[publish] FULL ERROR:', err);
    if (err.code === 'permission-denied') {
      showToast("Permission denied. Check console for exact rule failure.", "error");
    } else {
      showToast(err.message || "Failed to publish. See console.", "error");
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
      const headlines = data.items
        .slice(0, 8)
        .map(item => {
          const safeTitle = escapeHtml(item.title || '');
          return `<span class="ticker-item"><strong class="text-emerald-400">•</strong> ${safeTitle}</span>`;
        })
        .join('&nbsp;&nbsp;&nbsp;&nbsp;');

      // Duplicate the content → this is what makes the infinite scroll seamless
      tickerEl.innerHTML = headlines + '&nbsp;&nbsp;&nbsp;&nbsp;' + headlines;

      // Optional: restart animation cleanly (helps on some browsers)
      tickerEl.style.animation = 'none';
      tickerEl.offsetHeight; // trigger reflow
      tickerEl.style.animation = '';

      return;
    }

    throw new Error('Malformed RSS payload');
  } catch (err) {
    console.warn("[Ticker] Fallback active:", err.message);

    const fallback = `
      <span class="ticker-item text-slate-400">
        🛡️ Public Square active • Zero-knowledge ledger online • Standby for live updates
      </span>`;

    // Also duplicate the fallback so it still scrolls
    tickerEl.innerHTML = fallback + '&nbsp;&nbsp;&nbsp;&nbsp;' + fallback;
  }
}
const focusMessages = [
  {
    title: "Social citizen journalism.",
    text: "Anyone can report — only sealed records stay public."
  },
  {
    title: "Zero-Knowledge sealed.",
    text: "Your identity stays private while the evidence stays verifiable."
  },
  {
    title: "Record Live Voice recommended.",
    text: "Audio evidence is harder to fake and carries higher weight."
  },
  {
    title: "Forensic hashes enabled.",
    text: "Every media file is cryptographically fingerprinted on upload."
  },
  {
    title: "Public Square is live.",
    text: "Browse verified citizen reports from around the world."
  }
];

let focusIndex = 0;

function rotateFocusBanner() {
  const el = document.getElementById('focus-banner-text');
  if (!el) return;

  el.style.opacity = '0';

  setTimeout(() => {
    const msg = focusMessages[focusIndex];
    el.innerHTML = `
      <span class="font-medium text-emerald-300">${msg.title}</span>
      <span class="text-zinc-400"> ${msg.text}</span>
    `;
    el.style.opacity = '1';
    focusIndex = (focusIndex + 1) % focusMessages.length;
  }, 300);
}

// Rotate every 8 seconds
setInterval(rotateFocusBanner, 8000);


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

    // ---------- More Menu (robust version) ----------
  const moreBtn = document.getElementById('more-btn');
  const moreMenu = document.getElementById('more-menu');

  if (moreBtn && moreMenu) {
    // Prevent double-wiring
    if (!moreBtn.dataset.moreWired) {
      moreBtn.dataset.moreWired = 'true';

      const setOpen = (open) => {
        moreMenu.classList.toggle('hidden', !open);
        moreBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        console.log('[more-menu] setOpen →', open);
      };

      moreBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isOpen = !moreMenu.classList.contains('hidden');
        setOpen(!isOpen);

        // Close other dropdowns
        document.getElementById('notification-dropdown')?.classList.add('hidden');
        document.getElementById('notification-dropdown-mobile')?.classList.add('hidden');
      });

      // Close when clicking outside
      document.addEventListener('click', (e) => {
        if (!moreBtn.contains(e.target) && !moreMenu.contains(e.target)) {
          setOpen(false);
        }
      });

      // Close on Escape
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') setOpen(false);
      });
    }
  }

  // ---------- Notification Toggles (accessible + reliable) ----------
  function setNotificationOpen(dropdownId, open) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;

    const isDesktop = dropdownId === 'notification-dropdown';
    const btnId = isDesktop ? 'notification-btn' : 'notification-btn-mobile';
    const btn = document.getElementById(btnId);

    // Close the other dropdown first
    const otherId = isDesktop ? 'notification-dropdown-mobile' : 'notification-dropdown';
    const otherDropdown = document.getElementById(otherId);
    const otherBtnId = isDesktop ? 'notification-btn-mobile' : 'notification-btn';
    const otherBtn = document.getElementById(otherBtnId);

    if (otherDropdown) {
      otherDropdown.classList.add('hidden');
      otherDropdown.setAttribute('aria-hidden', 'true');
    }
    if (otherBtn) {
      otherBtn.setAttribute('aria-expanded', 'false');
    }

    // Close more menu if open
    document.getElementById('more-menu')?.classList.add('hidden');
    document.getElementById('more-btn')?.setAttribute('aria-expanded', 'false');

    // Set current dropdown state
    dropdown.classList.toggle('hidden', !open);
    dropdown.setAttribute('aria-hidden', open ? 'false' : 'true');

    if (btn) {
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
  }

  function toggleNotification(id) {
    const dropdown = document.getElementById(id);
    if (!dropdown) return;

    const isCurrentlyHidden = dropdown.classList.contains('hidden');
    setNotificationOpen(id, isCurrentlyHidden); // open if currently hidden
  }

  // Desktop button
  document.getElementById('notification-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleNotification('notification-dropdown');
  });

  // Mobile button
  document.getElementById('notification-btn-mobile')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleNotification('notification-dropdown-mobile');
  });

  // ---------- Global click-outside closer ----------
  document.addEventListener('click', (e) => {
    // More menu
    const moreMenu = document.getElementById('more-menu');
    const moreBtn = document.getElementById('more-btn');
    if (moreMenu && !moreMenu.contains(e.target) && !moreBtn?.contains(e.target)) {
      moreMenu.classList.add('hidden');
      moreBtn?.setAttribute('aria-expanded', 'false');
    }

    // Desktop notifications
    const notifDesktop = document.getElementById('notification-dropdown');
    const notifBtnDesktop = document.getElementById('notification-btn');
    if (notifDesktop && !notifDesktop.contains(e.target) && !notifBtnDesktop?.contains(e.target)) {
      setNotificationOpen('notification-dropdown', false);
    }

    // Mobile notifications
    const notifMobile = document.getElementById('notification-dropdown-mobile');
    const notifBtnMobile = document.getElementById('notification-btn-mobile');
    if (notifMobile && !notifMobile.contains(e.target) && !notifBtnMobile?.contains(e.target)) {
      setNotificationOpen('notification-dropdown-mobile', false);
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

/* ====================== NOTIFICATION HELPER ====================== */
window.toggleNotificationDropdown = function (event) {
  event?.stopPropagation();
  toggleNotification('notification-dropdown');
};
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
/* ====================== COMPOSER LIVE STATE ====================== */
function initComposerLiveState() {
  const textarea = document.getElementById('mainInput');
  const titleInput = document.getElementById('testimonyTitle');
  const charCount = document.getElementById('char-count');
  const postBtn = document.getElementById('postButton');
  const successEl = document.getElementById('publish-success');

  if (!textarea || !postBtn) return;

  const updateState = () => {
    const text = textarea.value.trim();
    const len = text.length;
    const hasMedia = !!(window.selectedImageFile || window.selectedVideoFile || 
                        (typeof getAudioForPublish === 'function' && getAudioForPublish()));

    // Character counter colours
    if (charCount) {
      charCount.textContent = `${len} / 2000`;
      charCount.classList.remove('text-zinc-500', 'text-emerald-400', 'text-red-400');
      if (len === 0) {
        charCount.classList.add('text-zinc-500');
      } else if (len >= 1800) {
        charCount.classList.add('text-red-400');
      } else {
        charCount.classList.add('text-emerald-400');
      }
    }

    // Enable / disable Publish button
    const canPublish = len >= 15 || hasMedia;
    postBtn.disabled = !canPublish;
  };

  textarea.addEventListener('input', updateState);
  titleInput?.addEventListener('input', updateState);

  // Also listen for media changes
  window.addEventListener('media-changed', updateState);

  // Initial state
  updateState();
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

    // Event listeners & Live Composer State
    setupEventListeners();

    if (typeof initComposerLiveState === 'function') {
      initComposerLiveState();
    }

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

    // Force splash removal
    setTimeout(() => {
      hideSplash();
      removeSplash();
    }, 300);

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
