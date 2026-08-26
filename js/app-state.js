// js/app-state.js - Centralized Plain-Object Application State
import { db } from './firebase-config.js';
import { CitizenTalkEngine, WitnessVoiceEngine } from './vocalWitnessEngine.js';
import { TIERS, PROFILE_MODES } from './tier.js';

// Memory cleanup trackers for Object URLs
let currentActiveAudioUrl = null;
let currentActiveImageUrls = [];

// Safely rank verification tiers
const TIER_RANKS = {
  tier_1_basic: 1,
  tier_2_verified: 2,
  tier_3_auditor: 3,
  citizen: 1,
  verified_citizen: 2,
  elite_witness: 3,
  steward: 3
};

function getTierRank(tierInput) {
  if (typeof tierInput === 'number') return tierInput;
  if (!isNaN(Number(tierInput))) return Number(tierInput);
  if (typeof tierInput === 'object' && tierInput?.rank) return Number(tierInput.rank);
  return TIER_RANKS[tierInput] || 1;
}

// ====================== ENGINE INSTANTIATION ======================
export const citizenEngine = new CitizenTalkEngine(db);
export const witnessEngine = new WitnessVoiceEngine(db);

if (typeof window !== 'undefined') {
  window.citizenEngine = citizenEngine;
  window.witnessEngine = witnessEngine;
}

// ====================== CENTRAL STATE OBJECT ======================
export const state = {
  isAuthenticated: false,
  currentUser: null,
  userRole: 'guest',
  currentTab: 'square',
  currentMode: 'citizen',
  activeFeed: 'citizen_talk',
  selectedLanguage: localStorage.getItem('vw_lang') || 'en',
  
  // Tier & Progression
  userTier: TIERS?.TIER_1_BASIC?.id || 'tier_1_basic',
  isPhoneVerified: false,
  isZkReady: false,
  zkIdentityCommitment: null,

  // Network Status
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,

  // Privacy & Identity Settings
  profileMode: localStorage.getItem('vw_profile_mode') || PROFILE_MODES?.ANONYMOUS || 'ANONYMOUS'
};

// Listen for network connectivity changes
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    state.isOnline = true;
    window.dispatchEvent(new CustomEvent('network:status-changed', { detail: { isOnline: true } }));
  });

  window.addEventListener('offline', () => {
    state.isOnline = false;
    window.dispatchEvent(new CustomEvent('network:status-changed', { detail: { isOnline: false } }));
  });
}

// ====================== STATE ACCESSORS & MUTATORS ======================

export function isUserAuthenticated() {
  return state.isAuthenticated && !!state.currentUser;
}

export function canAccessFeed(feedName) {
  const currentRank = getTierRank(state.userTier);

  if (feedName === 'citizen-talk' || feedName === 'citizen_talk') return true;
  if (feedName === 'citizen-circle') {
    return state.isPhoneVerified || currentRank >= 2;
  }
  if (feedName === 'witness-voice' || feedName === 'witness-circle') {
    return state.isZkReady && currentRank >= 3;
  }
  return false;
}

export function getActiveIdentityConfig() {
  const anonymousMode = PROFILE_MODES?.ANONYMOUS || 'ANONYMOUS';
  const boldMode = PROFILE_MODES?.BOLD_WITNESS || 'BOLD_WITNESS';
  const isBoldWitness = state.profileMode === boldMode;

  return {
    mode: state.profileMode || anonymousMode,
    isPublic: isBoldWitness,
    displayName: isBoldWitness 
      ? (state.currentUser?.displayName || 'Bold Witness') 
      : (state.currentUser?.anonymousHandle || 'CitizenObserver'),
    scrubMetadata: !isBoldWitness,
    obfuscateVoice: !isBoldWitness
  };
}

export function updateAppState(newState = {}) {
  if (!newState || typeof newState !== 'object') return;

  Object.assign(state, newState);

  if (newState.currentUser !== undefined) {
    state.isAuthenticated = !!newState.currentUser;
  }

  if (newState.profileMode) {
    localStorage.setItem('vw_profile_mode', newState.profileMode);
  }

  if (newState.selectedLanguage) {
    localStorage.setItem('vw_lang', newState.selectedLanguage);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('app-state-changed', { detail: state }));
  }
}

// ====================== MEDIA PREVIEW HELPERS ======================

export function clearMediaPreviews() {
  const previewContainer = document.getElementById('preview-area') || document.getElementById('mediaPreviewContainer');

  if (currentActiveAudioUrl) {
    URL.revokeObjectURL(currentActiveAudioUrl);
    currentActiveAudioUrl = null;
  }

  currentActiveImageUrls.forEach(url => URL.revokeObjectURL(url));
  currentActiveImageUrls = [];

  if (previewContainer) {
    previewContainer.innerHTML = '<span class="text-xs text-zinc-500">Preview will appear here...</span>';
    previewContainer.classList.remove('hidden');
  }

  if (typeof citizenEngine?.clearPendingMedia === 'function') citizenEngine.clearPendingMedia();
  if (typeof witnessEngine?.clearPendingMedia === 'function') witnessEngine.clearPendingMedia();
}

export function renderAudioPreview(blob) {
  if (!blob) return;

  const previewContainer = document.getElementById('preview-area') || document.getElementById('mediaPreviewContainer');
  if (!previewContainer) return;

  if (currentActiveAudioUrl) {
    URL.revokeObjectURL(currentActiveAudioUrl);
    currentActiveAudioUrl = null;
  }

  previewContainer.innerHTML = ''; 
  currentActiveAudioUrl = URL.createObjectURL(blob);

  const wrapper = document.createElement('div');
  wrapper.className = 'w-full flex items-center justify-between gap-3 p-3 bg-zinc-800/90 rounded-2xl border border-zinc-700/80 transition-all';

  const audioEl = document.createElement('audio');
  audioEl.controls = true;
  audioEl.src = currentActiveAudioUrl;
  audioEl.className = 'w-full h-8 max-w-xs';

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'text-red-400 hover:text-red-300 hover:bg-red-950/40 text-xs font-semibold px-3 py-1.5 rounded-xl border border-red-800/50 transition cursor-pointer';
  removeBtn.textContent = 'Remove';
  removeBtn.addEventListener('click', () => clearMediaPreviews());

  wrapper.appendChild(audioEl);
  wrapper.appendChild(removeBtn);
  previewContainer.appendChild(wrapper);
}

export function renderImagePreview(files = []) {
  const previewContainer = document.getElementById('preview-area') || document.getElementById('mediaPreviewContainer');
  if (!previewContainer) return;

  if (!files || files.length === 0) {
    clearMediaPreviews();
    return;
  }

  // Revoke previous URLs before re-rendering
  currentActiveImageUrls.forEach(url => URL.revokeObjectURL(url));
  currentActiveImageUrls = [];
  previewContainer.innerHTML = '';

  const validFiles = Array.from(files).filter(file => file.type.startsWith('image/'));

  validFiles.forEach((file, index) => {
    const objectUrl = URL.createObjectURL(file);
    currentActiveImageUrls.push(objectUrl);

    const card = document.createElement('div');
    card.className = 'relative group w-24 h-24 rounded-xl overflow-hidden border border-zinc-700 bg-zinc-900 shrink-0';

    const img = document.createElement('img');
    img.src = objectUrl;
    img.alt = `Preview ${index + 1}`;
    img.className = 'w-full h-full object-cover';

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'absolute top-1 right-1 bg-black/70 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs transition cursor-pointer';
    removeBtn.innerHTML = '✕';
    
    removeBtn.addEventListener('click', () => {
      const updatedFiles = validFiles.filter((_, fIndex) => fIndex !== index);
      if (typeof citizenEngine?.setPendingImages === 'function') citizenEngine.setPendingImages(updatedFiles);
      if (typeof witnessEngine?.setPendingImages === 'function') witnessEngine.setPendingImages(updatedFiles);
      renderImagePreview(updatedFiles);
    });

    card.appendChild(img);
    card.appendChild(removeBtn);
    previewContainer.appendChild(card);
  });
}

// Exports
export { state as AppState };
export default state;
