// Silence the ambiguous indirect export error
if (typeof window !== 'undefined') {
  window.initDarkMode = window.initDarkMode || function () {};
}
/* ====================== IMPORTS ====================== */
import { db, auth, storage } from './firebase-config.js';
import { state, updateAppState, isUserAuthenticated } from './app-state.js';
import { initAuth, requireAuth, updateUIForAuthState, bindHeaderEvents, openAuthModal } from './auth.js';
import { bindMfaChallengeEvents } from './mfa.js';
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
import { initLiveArena } from './live-arena.js';
import { loadCircle, loadVerifiedWitnesses } from './circle.js';
import { initWitnessTab, destroyWitnessTab } from './witness-tab.js';
import {
  collection, addDoc, doc, getDoc, setDoc, updateDoc,
  serverTimestamp, query, getDocs, orderBy, limit
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { submitTestimony } from './createPost.js';

/* ====================== GLOBAL ERROR LOGGING ====================== */
window.addEventListener('error', (event) => {
  if (event.message && event.message.includes('ResizeObserver loop')) return;
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
let isSwitchingTab = false;

/* ====================== DATA SAVER ====================== */
const DATA_SAVER_KEY = 'vw_data_saver';

function getDataSaverState() {
  return localStorage.getItem(DATA_SAVER_KEY) === 'true';
}

function updateDataSaverUI(isOn) {
  ['data-saver-status', 'data-saver-status-mobile', 'footer-data-saver-status'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = isOn ? 'On' : 'Off';
  });

  const desktopBtn = document.getElementById('data-saver-btn');
  if (desktopBtn) {
    desktopBtn.className = isOn
      ? 'flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-all active:scale-95 border-emerald-500 bg-emerald-950/50 text-emerald-400 hover:border-emerald-400'
      : 'flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-all active:scale-95 border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500 hover:text-white';
  }

  const mobileBtn = document.getElementById('data-saver-btn-mobile');
  if (mobileBtn) {
    mobileBtn.className = isOn
      ? 'flex h-8 items-center gap-1 rounded-lg border px-2 text-[10px] font-medium transition-all active:scale-95 border-emerald-500 bg-emerald-950/50 text-emerald-400'
      : 'flex h-8 items-center gap-1 rounded-lg border px-2 text-[10px] font-medium transition-all active:scale-95 border-zinc-700 bg-zinc-900 text-zinc-400';
  }

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
  updateDataSaverUI(getDataSaverState());

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
      if (typeof showToast === 'function') {
        showToast(next ? 'Data Saver turned ON' : 'Data Saver turned OFF', 'info');
      } else {
        showSingleDataSaverToast(next ? 'Data Saver ON' : 'Data Saver OFF');
      }
      window.dispatchEvent(new CustomEvent('data-saver-changed', {
        detail: { enabled: next }
      }));
    });
  });
}

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
  const previousTab = window.__currentTab || 'square';
  window.__currentTab = tab;

if (previousTab === 'witness' && tab !== 'witness' && typeof destroyWitnessTab === 'function') {
  destroyWitnessTab();
}

  try {
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

    Object.values(TAB_TO_SECTION).flat().forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.add('hidden');
      el.setAttribute('hidden', '');
      el.setAttribute('aria-hidden', 'true');
    });

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

    const newHash = `#${tab === 'square' ? 'citizen-talk' : tab}`;
    if (window.location.hash !== newHash) {
      history.pushState({ tab }, '', newHash);
    }

    if (tab === 'square' && typeof initFeed === 'function') {
      initFeed(undefined, 'citizen-talk');
    }
    if (tab === 'ledger' && typeof loadEvidenceLedger === 'function') {
      loadEvidenceLedger();
    }
    if (tab === 'mycircle' && typeof loadCircle === 'function') {
      loadCircle();
    }

   // ===== WITNESS VOICE =====
if (tab === 'witness') {
  if (typeof initWitnessTab === 'function') {
    initWitnessTab();          // loads sealed Witness Voice + citizen reports
  }
}

    if (tab === 'arena') {
      try {
        if (typeof initLiveArena === 'function') {
          initLiveArena();
        } else {
          const module = await import('./live-arena.js');
          if (typeof module.initLiveArena === 'function') {
            module.initLiveArena();
          } else {
            console.error('initLiveArena not found in live-arena.js');
            showToast('Live Arena failed to load', 'error');
          }
        }
      } catch (err) {
        console.error('Failed to load Live Arena:', err);
        showToast('Could not load Live Arena', 'error');
      }
    }
  } catch (err) {
    console.error('[Tab] switchTab failed:', err);
  } finally {
    isSwitchingTab = false;
  }
};

/* ====================== NAVIGATION CHROME ====================== */
function initNavigationChrome() {
  wireTabButtons();
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

/* ====================== DROPDOWN WIDGET ====================== */
function createDropdown(btnId, menuId) {
  const btn = document.getElementById(btnId);
  const menu = document.getElementById(menuId);
  if (!btn || !menu) {
    console.warn(`[dropdown] Missing #${btnId} or #${menuId}`);
    return;
  }
  if (btn.dataset.dropdownWired === 'true') return;
  btn.dataset.dropdownWired = 'true';

  menu.classList.add('hidden');
  menu.setAttribute('aria-hidden', 'true');
  btn.setAttribute('aria-expanded', 'false');

  const setOpen = (open) => {
    menu.classList.toggle('hidden', !open);
    menu.setAttribute('aria-hidden', open ? 'false' : 'true');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');

    const chevron = btn.querySelector('svg');
    if (chevron) {
      chevron.style.transition = 'transform 0.2s ease';
      chevron.style.transform = open ? 'rotate(180deg)' : 'rotate(0deg)';
    }
  };

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    const willOpen = menu.classList.contains('hidden');

    document.querySelectorAll('[data-dropdown-menu]').forEach((other) => {
      if (other !== menu) {
        other.classList.add('hidden');
        other.setAttribute('aria-hidden', 'true');
      }
    });
    document.querySelectorAll('[data-dropdown-btn]').forEach((otherBtn) => {
      if (otherBtn !== btn) otherBtn.setAttribute('aria-expanded', 'false');
    });

    setOpen(willOpen);
  });

  document.addEventListener('click', (e) => {
    if (menu.classList.contains('hidden')) return;
    if (btn.contains(e.target) || menu.contains(e.target)) return;
    setOpen(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.classList.contains('hidden')) {
      setOpen(false);
      btn.focus();
    }
  });

  btn.setAttribute('data-dropdown-btn', '');
  menu.setAttribute('data-dropdown-menu', '');
  console.log(`[dropdown] Wired #${btnId} → #${menuId}`);
}
function initAllDropdowns() {
  createDropdown('more-btn', 'more-menu');
  createDropdown('notification-btn', 'notification-dropdown');
  createDropdown('notification-btn-mobile', 'notification-dropdown-mobile');
}

window.toggleNotificationDropdown = function (event) {
  event?.stopPropagation?.();
  const btn = document.getElementById('notification-btn');
  if (btn) btn.click();
};

function initHashRouting() {
  if (window.__hashRoutingWired) return;
  window.__hashRoutingWired = true;

  const resolveTabFromHash = () => {
    const hash = (window.location.hash || '').slice(1);
    if (!hash || hash === 'citizen-talk') return 'square';
    return hash;
  };

  window.addEventListener('popstate', () => {
    if (typeof window.switchTab === 'function') {
      window.switchTab(resolveTabFromHash());
    }
  });

  window.addEventListener('hashchange', () => {
    if (typeof window.switchTab === 'function') {
      window.switchTab(resolveTabFromHash());
    }
  });
}

// Call once after functions are defined
initNavigationChrome();

/**
 * Updates the visual state of the voice recorder UI
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
      amount: Math.round(finalAmount * 100),
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
window.openSupportPackagesModal = window.openSupportModal; // alias

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

  // Capture composer metadata for standard/field-note posting styles and roles
  const postingStyle   = typeof currentPostingStyle !== 'undefined' ? currentPostingStyle : (window.currentPostingStyle || 'citizen');
  const fieldNoteRole  = document.getElementById('field-note-role')?.value.trim() || window.selectedRole || null;
  const fieldNoteOrg   = document.getElementById('field-note-org')?.value.trim() || null;

  if (!content) {
    showToast("Please write something before publishing", "error");
    return;
  }

  // Title is UI-only (not written to Firestore — rules reject unknown keys)
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
    try {
      const { remindUserOfAIRestrictions } = await import('./ai-services.js');
      remindUserOfAIRestrictions("publish");
    } catch (aiErr) {
      console.warn("[publish] AI notice skipped:", aiErr);
    }

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

    // Channel from index.html #targetFeedSelect
    const targetFeedEl = document.getElementById('targetFeedSelect');
    let channel = targetFeedEl?.value === 'witness-voice' ? 'witness-voice' : 'citizen-talk';

    // Witness Voice only if user is Witness Circle (matches firestore.rules isWitnessCircle)
    if (channel === 'witness-voice') {
      const ud = userSnap.exists() ? userSnap.data() : {};
      const isWitness = ud.tier === 'witness_circle' || ud.zkVerified === true;
      if (!isWitness) {
        console.warn('[publish] Witness Voice selected but not Witness Circle — using citizen-talk');
        showToast('Witness Voice needs Witness Circle. Publishing to Citizen Talk instead.', 'warning');
        channel = 'citizen-talk';
      }
    }

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

    try {
      if (content && typeof generateSha256Hash === 'function') {
        const textBlob = new Blob([content], { type: 'text/plain' });
        mediaData.bodyHash = await generateSha256Hash(textBlob);
      }
    } catch (hashErr) {
      console.warn('[publish] Could not compute bodyHash:', hashErr);
    }

    // ZK only when Witness Voice. Optional / non-blocking.
    // Do NOT write zk* fields to Firestore (rules forbid them).
    let zkResult = {
      isFallback: true,
      proofType: 'NONE',
      proof: null,
      publicSignals: []
    };

    if (channel === 'witness-voice') {
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
        console.warn('[publish] ZK failed, continuing without proof:', zkErr);
        showToast('ZK unavailable. Publishing without higher-trust proof.', 'warning');
      }
    }

    const primaryForensicHash =
      mediaData.imageHash ||
      mediaData.videoHash ||
      mediaData.audioHash ||
      mediaData.bodyHash ||
      null;

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
          mode: 'IDENTIFIED',
          authorId: currentUser.uid,
          displayName: currentUser.displayName || 'Registered Witness',
        },
        channel,
        clientCaptureMs: Date.now(),
        testimonyId: null,
        forensicHash: primaryForensicHash,
      });

      console.log('[publish] Evidence Pack created →', evidencePackResult.packCoreHash?.slice(0, 12) + '…');
    } catch (packErr) {
      console.warn('[publish] Evidence Pack creation failed (non-blocking):', packErr);
    }

    const hasAnyHash = !!(
      mediaData.imageHash ||
      mediaData.videoHash ||
      mediaData.audioHash ||
      mediaData.bodyHash ||
      evidencePackResult?.packCoreHash
    );

const testimonyData = {
  content,
  channel,
  authorId: currentUser.uid,
  author: currentUser.displayName || 'Registered Witness',
  isAnonymous: false,
  postingStyle: postingStyle === 'field-note' ? 'field-note' : 'citizen',
  fieldNoteRole: postingStyle === 'field-note' ? (fieldNoteRole || null) : null,
  fieldNoteOrg: postingStyle === 'field-note' ? (fieldNoteOrg || null) : null,
  forensicHash: (typeof primaryForensicHash === 'string' && primaryForensicHash.length === 64)
    ? primaryForensicHash
    : null,
  imageUrl: mediaData.imageUrl || null,
  videoUrl: mediaData.videoUrl || null,
  audioUrl: mediaData.audioUrl || null,
  evidencePack: evidencePackResult?.firestorePack || null,
  packCoreHash: evidencePackResult?.packCoreHash || null,
  reactions: { respect: 0, truth: 0, solidarity: 0, impact: 0 },
  commentsCount: 0,
  isPinned: false,
  isDeleted: false,
  feedVisibility: channel,
  visibility: 'public',   // rules require == 'public' on create
  createdAt: serverTimestamp(),
};
    const docRef = await addDoc(collection(db, 'testimonies'), testimonyData);
    
  
    const id = await submitTestimony({
  content,
  channel,
  mediaFile: null, // media already uploaded; pass URLs via a small extension OR
  isAnonymous: false,
  postingStyle: postingStyle === 'field-note' ? 'field-note' : 'citizen',
  fieldNoteRole: ...,
  fieldNoteOrg: ...,
});
    console.log('[publish] SUCCESS →', docRef.id, '| channel:', channel);

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
          channel,
          clientCaptureMs: Date.now(),
          testimonyId: docRef.id,
          forensicHash: testimonyData.forensicHash || primaryForensicHash,
        });

        await setDoc(docRef, {
          evidencePack: finalPack.firestorePack,
          packCoreHash: finalPack.packCoreHash,
        }, { merge: true });
      } catch (finalPackErr) {
        console.warn('[publish] Could not finalize Evidence Pack with ID:', finalPackErr);
      }
    }

    if (typeof window.loadEvidenceLedger === 'function') {
      window.loadEvidenceLedger();
    }
    if (typeof window.loadForensicLedger === 'function') {
      window.loadForensicLedger();
    }
    window.dispatchEvent(new CustomEvent('vocalWitness:posted'));

    await setDoc(userRef, {
      lastTestimonyAt: serverTimestamp()
    }, { merge: true });

    const isZkOk = Boolean(zkResult.proofType === 'SNARK_GROTH16_SERVER' && !zkResult.isFallback);
    if (isZkOk) {
      showToast("🛡️ Report sealed with Zero-Knowledge proof", "success");
    } else {
      showToast("🛡️ Report sealed and published", "success");
    }

    const successEl = document.getElementById('publish-success');
    const downloadPackBtn = document.getElementById('download-pack-after-publish');
    const viewSquareBtn = document.getElementById('view-in-square-btn');
    const publishedId = docRef?.id;

    if (successEl) {
      successEl.classList.remove('hidden');
      if (postBtn) postBtn.classList.add('hidden');

      if (downloadPackBtn) {
        downloadPackBtn.onclick = async () => {
          try {
            downloadPackBtn.disabled = true;
            downloadPackBtn.textContent = 'Generating…';
            showToast('Generating cryptographic Evidence Pack…', 'info');

            if (typeof handleDownloadEvidencePack === 'function' && publishedId) {
              await handleDownloadEvidencePack(publishedId);
            } else if (evidencePackResult) {
              const { downloadEvidencePack } = await import('./evidence-pack.js');
              downloadEvidencePack(
                evidencePackResult.fullPack || evidencePackResult,
                publishedId || 'report'
              );
              showToast('✅ Evidence Pack downloaded', 'success');
            } else {
              showToast('Evidence Pack will be available on the post shortly', 'info');
            }
          } catch (err) {
            console.error('[publish] Pack download failed:', err);
            showToast('Could not prepare Evidence Pack', 'error');
          } finally {
            downloadPackBtn.disabled = false;
            downloadPackBtn.innerHTML = '📥 Download Evidence Pack';
          }
        };
      }

      if (viewSquareBtn) {
        viewSquareBtn.onclick = () => {
          document.getElementById('feed-container')?.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        };
      }

      setTimeout(() => {
        successEl.classList.add('hidden');
        if (postBtn) postBtn.classList.remove('hidden');

        if (titleInput) titleInput.value = '';
        if (textarea) textarea.value = '';
        if (typeof mediaModule?.resetMediaState === 'function') {
          mediaModule.resetMediaState();
        }
        const fileInputEl = document.getElementById('mediaInput') || document.querySelector('input[type="file"]');
        if (fileInputEl) fileInputEl.value = '';

        window.dispatchEvent(new CustomEvent('media-changed'));
      }, 12000);
    } else {
      if (titleInput) titleInput.value = '';
      if (textarea) textarea.value = '';
      if (typeof mediaModule?.resetMediaState === 'function') {
        mediaModule.resetMediaState();
      }
      const fileInputEl = document.getElementById('mediaInput') || document.querySelector('input[type="file"]');
      if (fileInputEl) fileInputEl.value = '';
    }

    if (typeof initFeed === 'function') {
      initFeed(db, channel);
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
  const container = document.getElementById('ledger-list') ||
                    document.getElementById('ledgerContainer') ||
                    document.getElementById('evidence-ledger');

  if (!container) {
    console.warn('[Ledger] No container found');
    return;
  }

  // Keep the existing section header if present; only replace the list area
  let listTarget = document.getElementById('ledger-list');
  if (!listTarget) {
    listTarget = container;
  }

  listTarget.innerHTML = `
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

    // Store data for the modal
    window.__ledgerDocs = {};

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
      const id = docSnapshot.id;
      window.__ledgerDocs[id] = { id, ...data };

      const ts = data.timestamp || data.createdAt;
      const dateStr = ts
        ? (ts.toDate ? ts.toDate() : new Date(ts)).toLocaleString()
        : 'N/A';

      const hasHash = data.imageHash || data.audioHash || data.videoHash || data.bodyHash || data.hasForensic;
      const hashDisplay = hasHash
        ? `<span class="inline-flex items-center gap-1 font-semibold text-emerald-400">🔒 Verified</span>`
        : `<span class="text-zinc-500">Standard</span>`;

      const summary = (data.content || data.headline || data.title || '').slice(0, 90);

      html += `
        <tr class="hover:bg-zinc-800/40 transition cursor-pointer group"
            data-ledger-id="${id}"
            role="button"
            tabindex="0"
            title="View sealed record (read-only)">
          <td class="py-3.5 px-3 sm:px-4 font-medium text-white group-hover:text-emerald-300">${escapeHtml(data.author || 'Anonymous')}</td>
          <td class="py-3.5 px-3 sm:px-4 max-w-[180px] sm:max-w-xs truncate text-zinc-300">${escapeHtml(summary)}</td>
          <td class="py-3.5 px-3 sm:px-4 font-mono text-xs">${hashDisplay}</td>
          <td class="py-3.5 px-3 sm:px-4 text-xs text-zinc-500">${dateStr}</td>
        </tr>`;
    });

    html += `</tbody></table>
      <p class="mt-4 text-center text-xs text-zinc-500">Click any row to view the sealed record (read-only)</p>`;
    innerWrapper.innerHTML = html;

    // Wire clicks (event delegation)
    innerWrapper.onclick = (e) => {
      const row = e.target.closest('tr[data-ledger-id]');
      if (!row) return;
      const id = row.getAttribute('data-ledger-id');
      if (id && typeof window.viewSealedReport === 'function') {
        window.viewSealedReport(id);
      }
    };

    // Keyboard support
    innerWrapper.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const row = e.target.closest('tr[data-ledger-id]');
        if (row) {
          e.preventDefault();
          const id = row.getAttribute('data-ledger-id');
          window.viewSealedReport?.(id);
        }
      }
    };

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

window.loadEvidenceLedger = loadEvidenceLedger;
window.refreshLedger = loadEvidenceLedger;

/* ====================== SEALED REPORT VIEWER (read-only) ====================== */
window.viewSealedReport = function (id) {
  const data = window.__ledgerDocs?.[id];
  if (!data) {
    showToast?.('Record not found', 'error');
    return;
  }

  // Remove any existing modal
  document.getElementById('sealed-report-modal')?.remove();

  const ts = data.timestamp || data.createdAt;
  const dateStr = ts
    ? (ts.toDate ? ts.toDate() : new Date(ts)).toLocaleString()
    : 'N/A';

  const hashes = [];
  if (data.bodyHash) hashes.push(`Body: ${data.bodyHash.slice(0, 16)}…`);
  if (data.imageHash) hashes.push(`Image: ${data.imageHash.slice(0, 16)}…`);
  if (data.audioHash) hashes.push(`Audio: ${data.audioHash.slice(0, 16)}…`);
  if (data.videoHash) hashes.push(`Video: ${data.videoHash.slice(0, 16)}…`);

  const modal = document.createElement('div');
  modal.id = 'sealed-report-modal';
  modal.className = 'fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 p-4';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.innerHTML = `
    <div class="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl">
      <div class="sticky top-0 flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-5 py-4">
        <div>
          <h3 class="text-lg font-bold text-white">Sealed Record</h3>
          <p class="text-xs text-emerald-400 mt-0.5">🔒 Read-only • Immutable</p>
        </div>
        <button type="button" data-close-sealed
                class="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white transition">
          ✕
        </button>
      </div>
      <div class="space-y-4 p-5 text-sm">
        <div>
          <p class="text-xs uppercase tracking-wider text-zinc-500 mb-1">Witness</p>
          <p class="font-medium text-white">${escapeHtml(data.author || 'Anonymous')}</p>
        </div>
        <div>
          <p class="text-xs uppercase tracking-wider text-zinc-500 mb-1">Timestamp</p>
          <p class="text-zinc-300">${dateStr}</p>
        </div>
        <div>
          <p class="text-xs uppercase tracking-wider text-zinc-500 mb-1">Content</p>
          <p class="text-zinc-200 whitespace-pre-wrap leading-relaxed">${escapeHtml(data.content || data.headline || data.title || '—')}</p>
        </div>
        ${hashes.length ? `
        <div>
          <p class="text-xs uppercase tracking-wider text-zinc-500 mb-1">Cryptographic hashes</p>
          <ul class="font-mono text-xs text-emerald-400/90 space-y-1">
            ${hashes.map(h => `<li>${escapeHtml(h)}</li>`).join('')}
          </ul>
        </div>` : ''}
        <div class="rounded-xl border border-zinc-700 bg-zinc-950/60 px-4 py-3 text-xs text-zinc-400">
          This record is sealed. The original cannot be edited or deleted by anyone.
        </div>
      </div>
      <div class="flex gap-3 border-t border-zinc-800 px-5 py-4">
        <button type="button" data-close-sealed
                class="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 py-2.5 text-sm font-medium text-zinc-200 hover:bg-zinc-700 transition">
          Close
        </button>
        <button type="button" id="sealed-download-pack"
                class="flex-1 rounded-xl bg-emerald-500 py-2.5 text-sm font-bold text-black hover:bg-emerald-400 transition">
          📥 Evidence Pack
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';

  const close = () => {
    modal.remove();
    document.body.style.overflow = '';
  };

  modal.addEventListener('click', (e) => {
    if (e.target === modal || e.target.closest('[data-close-sealed]')) close();
  });

  document.getElementById('sealed-download-pack')?.addEventListener('click', async () => {
    if (typeof handleDownloadEvidencePack === 'function') {
      await handleDownloadEvidencePack(id);
    } else {
      showToast?.('Evidence Pack download not available', 'info');
    }
  });

  document.addEventListener('keydown', function escHandler(e) {
    if (e.key === 'Escape') {
      close();
      document.removeEventListener('keydown', escHandler);
    }
  });
};

/* ====================== LIVE BREAKING TICKER ====================== */
async function fetchCuratedNews() {
  const tickerEl = document.getElementById('ticker-content');
  if (!tickerEl) return;

  if (tickerEl.dataset.loading === '1') return;
  tickerEl.dataset.loading = '1';

  const CACHE_KEY = 'vw_ticker_headlines_v2';
  const CACHE_TTL = 20 * 60 * 1000; // 20 minutes

  // Always enough items so the strip never looks like a stuck pole
  const fallbackItems = [
    '🛡️ VocalWitness Public Square is live • Zero-knowledge ledger online',
    '🌍 Citizen reporting active across Africa & the world',
    '⚡ Share what you saw — evidence stays protected',
    '🔒 Every sealed report is cryptographically timestamped',
    '🎤 Live Voice carries higher evidence weight',
    '📜 Immutable Record protects the original forever',
    '🏛️ DAO governance: quadratic voting is open',
    '✅ Verify integrity without revealing identity'
  ];
  function restartTickerAnimation() {
  tickerEl.style.animation = 'none';
  void tickerEl.offsetWidth;
  tickerEl.style.animation = 'ticker-scroll 45s linear infinite';
  tickerEl.classList.remove('ticker-paused');
}

  function applyTicker(items) {
    let list = Array.isArray(items) ? items.filter(Boolean).map(String) : [];
    if (list.length < 4) list = fallbackItems.slice();

    // Pad so the marquee never sits still with 1–2 lines
    while (list.length < 10) {
      list = list.concat(list);
    }
    list = list.slice(0, 16);

    const html = list
      .map((title) => {
        const safe = String(title)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
        return `<span class="ticker-item px-8 whitespace-nowrap"><strong class="text-emerald-400">•</strong> ${safe}</span>`;
      })
      .join('');

    // Duplicate strip for seamless -50% loop
    tickerEl.innerHTML = html + html;
    restartTickerAnimation();
  }

  // Paint something immediately (cache or fallback) so UI never freezes
  let usedCache = false;
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (
      cached &&
      Array.isArray(cached.items) &&
      cached.items.length >= 3 &&
      Date.now() - (cached.ts || 0) < CACHE_TTL * 3 // allow slightly stale
    ) {
      applyTicker(cached.items);
      usedCache = true;
    } else {
      applyTicker(fallbackItems);
    }
  } catch (_) {
    applyTicker(fallbackItems);
  }

  try {
    const FUNCTION_URL =
      "https://us-central1-vocalwitness-3affa.cloudfunctions.net/getCuratedNews";

    const res = await fetch(FUNCTION_URL, {
      method: "GET",
      signal: AbortSignal.timeout(12000)
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const finalHeadlines = Array.isArray(data.headlines)
      ? data.headlines.filter((t) => typeof t === "string" && t.trim().length > 12)
      : [];

    if (finalHeadlines.length >= 3) {
      try {
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ ts: Date.now(), items: finalHeadlines })
        );
      } catch (_) {}
      applyTicker(finalHeadlines);
    } else if (!usedCache) {
      applyTicker(fallbackItems);
    }
  } catch (err) {
    console.warn("[Ticker] Network path failed, keeping current strip:", err?.message || err);
    if (!tickerEl.innerHTML || tickerEl.innerHTML.length < 40) {
      applyTicker(fallbackItems);
    } else {
      restartTickerAnimation();
    }
  } finally {
    tickerEl.dataset.loading = "0";
  }
}

// Refresh every 15 minutes
if (!window.__vwTickerRefresh) {
  window.__vwTickerRefresh = setInterval(() => {
    fetchCuratedNews();
  }, 15 * 60 * 1000);
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

  // Global click delegation (data-action + tabs)
  document.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('#main-nav button[data-tab]');
    if (tabBtn && typeof window.switchTab === 'function') {
      e.preventDefault();
      window.switchTab(tabBtn.dataset.tab);
      return;
    }

    const actionTarget = e.target.closest('[data-action]');
    if (!actionTarget) {
      if (e.target.closest('#data-saver-btn') || e.target.closest('#data-saver-btn-mobile')) {
        e.preventDefault();
        if (typeof window.toggleDataSaver === 'function') window.toggleDataSaver();
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
        if (typeof window.toggleDataSaver === 'function') window.toggleDataSaver();
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
        } else if (typeof window.openProfileModal === 'function') {
          window.openProfileModal();
        }
        break;

      case 'open-bookmarks':
        e.preventDefault();
        document.querySelectorAll('.tab-view, [role="tabpanel"]').forEach(view => {
          view.classList.add('hidden');
        });
        document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
        if (typeof window.initBookmarksView === 'function') {
          window.initBookmarksView();
        } else if (typeof initBookmarksView === 'function') {
          initBookmarksView();
        }
        break;

      case 'close-bookmarks':
        e.preventDefault();
        if (typeof window.closeBookmarksView === 'function') {
          window.closeBookmarksView();
        }
        break;

      case 'open-notifications':
        // Handled by unified dropdown system
        break;

      default:
        break;
    }
  });

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

// Header events from auth.js
if (typeof bindHeaderEvents === 'function') {
  bindHeaderEvents();
}

// MFA challenge modal handlers
if (typeof bindMfaChallengeEvents === 'function') {
  bindMfaChallengeEvents();
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
} // ← function ends here

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

/* ====================== FOCUS BANNER (rotating education) ====================== */
function initFocusBanner() {
  const banner = document.getElementById('focus-banner');
  const textEl = document.getElementById('focus-banner-text');
  if (!banner || !textEl) return;

  const DISMISS_KEY = 'vw_focus_banner_dismissed';
  if (localStorage.getItem(DISMISS_KEY) === '1') {
    banner.remove();
    return;
  }

  // Short educational messages about the platform
  const messages = [
    {
      icon: '🎯',
      html: `<span class="font-medium text-emerald-300">Social citizen journalism.</span>
             <span class="text-zinc-400"> Anyone can report — only sealed records stay public.</span>`
    },
    {
      icon: '🔒',
      html: `<span class="font-medium text-emerald-300">Sealed on your device.</span>
             <span class="text-zinc-400"> Photos & voice are fingerprinted before upload — the original can’t be quietly changed.</span>`
    },
    {
      icon: '🛡️',
      html: `<span class="font-medium text-emerald-300">Evidence Packs for anyone.</span>
             <span class="text-zinc-400"> Download a verification file. No app needed. Prove integrity offline.</span>`
    },
    {
      icon: '🌍',
      html: `<span class="font-medium text-emerald-300">Africa-first public square.</span>
             <span class="text-zinc-400"> Built in Enugu. Open to every citizen who has something to report.</span>`
    },
    {
      icon: '⚖️',
      html: `<span class="font-medium text-emerald-300">Trust is earned, never sold.</span>
             <span class="text-zinc-400"> Higher tiers come from verification and participation — not payment.</span>`
    }
  ];

  let idx = 0;
  const iconEl = banner.querySelector('span[aria-hidden="true"]');

  function showMessage(i) {
    const msg = messages[i % messages.length];
    textEl.style.opacity = '0';
    if (iconEl) iconEl.style.opacity = '0';

    setTimeout(() => {
      if (iconEl) iconEl.textContent = msg.icon;
      textEl.innerHTML = msg.html;
      textEl.style.opacity = '1';
      if (iconEl) iconEl.style.opacity = '1';
    }, 280);
  }

  // Show first message immediately
  showMessage(0);

  // Rotate every 7.5 seconds
  const rotateTimer = setInterval(() => {
    if (!document.getElementById('focus-banner')) {
      clearInterval(rotateTimer);
      return;
    }
    idx = (idx + 1) % messages.length;
    showMessage(idx);
  }, 7500);

  // X still dismisses permanently for this browser
  document.getElementById('dismiss-focus-banner')?.addEventListener('click', () => {
    localStorage.setItem(DISMISS_KEY, '1');
    clearInterval(rotateTimer);
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

  if (!textarea || !postBtn) return;

  const updateState = () => {
    const text = textarea.value.trim();
    const len = text.length;
    const hasMedia = !!(window.selectedImageFile || window.selectedVideoFile ||
                        (typeof getAudioForPublish === 'function' && getAudioForPublish()));

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

    const canPublish = len >= 15 || hasMedia;
    postBtn.disabled = !canPublish;
  };

  textarea.addEventListener('input', updateState);
  titleInput?.addEventListener('input', updateState);
  window.addEventListener('media-changed', updateState);
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
    console.log('[Bootstrap] Initializing core UI...');
    initDataSaver();
    initFocusBanner();
    initHeaderSearch();

    if (typeof refreshTierAndUI === 'function') {
      console.log('[Bootstrap] Refreshing tier UI...');
      refreshTierAndUI();
    }
    if (typeof loadWeeklyLeaderboard === 'function') {
      loadWeeklyLeaderboard();
    }

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

    if (typeof wireIndexPage === 'function') wireIndexPage();
    if (typeof initLanguage === 'function') initLanguage();
    if (typeof initProfile === 'function') initProfile();

    if (typeof CitizenTalkEngine === 'function' && db && storage) {
      console.log('[Bootstrap] Starting CitizenTalkEngine...');
      engineInstance = new CitizenTalkEngine(db, storage);
      window.engineInstance = engineInstance;
      mediaModule.setEngine?.(engineInstance);

      if (typeof mediaModule.initMediaButtons === 'function') {
        mediaModule.initMediaButtons();
      }
    } else {
      console.warn('[Bootstrap] CitizenTalkEngine / db / storage not ready — engine skipped');
    }

    if (typeof loadDynamicNavigation === 'function') loadDynamicNavigation();
    fetchCuratedNews();

    console.log('[Bootstrap] Initializing auth...');
    await initAuth();

    setupEventListeners();

    if (typeof initComposerLiveState === 'function') {
      initComposerLiveState();
    }

    const initialHash = window.location.hash.slice(1);
    const initialTab = (initialHash === 'citizen-talk' || !initialHash) ? 'square' : initialHash;
    console.log('[Bootstrap] Setting initial tab:', initialTab);

    if (typeof window.switchTab === 'function') {
      window.switchTab(initialTab);
    } else {
      console.error('[Bootstrap] window.switchTab is not defined!');
    }

    console.log('%c✅ Bootstrap finished successfully', 'color:#10b981;font-weight:bold');

    // Force splash removal after bootstrap
    setTimeout(() => {
      hideSplash();
      removeSplash();
    }, 300);

  } catch (e) {
    console.error('%c❌ Bootstrap error:', 'color:red;font-weight:bold', e);
    showToast?.("Failed to initialize app. Please refresh.", "error");
  }
}

/* ====================== SPLASH SCREEN REMOVAL ====================== */
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

  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
}

function hideSplash() {
  const splash = document.getElementById('app-splash-screen');
  if (!splash) return;

  splash.classList.add('fade-out');
  splash.style.opacity = '0';
  splash.style.transition = 'opacity 0.4s ease';
  splash.style.pointerEvents = 'none';

  setTimeout(() => {
    splash.remove();
  }, 450);
}

/* ====================== DOM READY ====================== */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await bootstrap();
  } catch (err) {
    console.error('Bootstrap failed:', err);
  } finally {
    removeSplash();
  }

  setTimeout(() => {
    if (typeof wireTestimonyComposer === 'function') {
      wireTestimonyComposer();
    }
  }, 500);
});
