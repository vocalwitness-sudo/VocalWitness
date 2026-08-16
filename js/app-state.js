// js/app-state.js - Centralized Application State & Engine Exports
import { db } from './firebase-config.js';
import { CitizenTalkEngine, WitnessVoiceEngine } from './vocalWitnessEngine.js';

// Track active Object URLs to prevent browser memory leaks
let currentActiveAudioUrl = null;

// ====================== ENGINE INSTANTIATION ======================
// Initialized without relying on Firebase Storage
export const citizenEngine = new CitizenTalkEngine(db);
export const witnessEngine = new WitnessVoiceEngine(db);

// Global debug exposure for client runtime inspection
if (typeof window !== 'undefined') {
    window.citizenEngine = citizenEngine;
    window.witnessEngine = witnessEngine;
}

// ====================== APPLICATION STATE ======================
export const state = {
    isAuthenticated: false,
    currentUser: null,
    currentTab: 'square',
    currentMode: 'citizen',
    selectedLanguage: 'en',
    userTier: 1
};

/**
 * Checks if a user is active and authenticated in the state.
 * @returns {boolean}
 */
export function isUserAuthenticated() {
    return state.isAuthenticated && !!state.currentUser;
}

/**
 * Safely updates global application state and dispatches change event.
 * @param {Object} newState - Partial state update payload.
 */
export function updateAppState(newState) {
    if (!newState || typeof newState !== 'object') return;
    
    Object.assign(state, newState);
    
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('app-state-changed', { detail: state }));
    }
}

// ====================== MEDIA PREVIEW HELPERS ======================
/**
 * Renders an audio playback element inside the active media preview container.
 * @param {Blob|File} blob - Recorded or selected audio blob.
 */
export function renderAudioPreview(blob) {
    if (!blob) return;

    const previewContainer = document.getElementById('mediaPreviewContainer') || document.getElementById('preview-area');
    if (!previewContainer) {
        console.warn('Audio preview container not found in DOM.');
        return;
    }

    // Revoke old audio URL if a previous recording existed
    if (currentActiveAudioUrl) {
        URL.revokeObjectURL(currentActiveAudioUrl);
        currentActiveAudioUrl = null;
    }

    // Clean previous preview elements safely
    previewContainer.innerHTML = ''; 
    currentActiveAudioUrl = URL.createObjectURL(blob);

    const wrapper = document.createElement('div');
    wrapper.className = 'flex items-center justify-between gap-3 p-3 bg-zinc-800/90 rounded-2xl border border-zinc-700/80 mt-2 transition-all';

    const audioEl = document.createElement('audio');
    audioEl.controls = true;
    audioEl.src = currentActiveAudioUrl;
    audioEl.className = 'w-full h-8 max-w-xs';

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'text-red-400 hover:text-red-300 hover:bg-red-950/40 text-xs font-semibold px-3 py-1.5 rounded-xl border border-red-800/50 transition';
    removeBtn.textContent = 'Remove';
    
    removeBtn.addEventListener('click', () => {
        wrapper.remove();
        if (currentActiveAudioUrl) {
            URL.revokeObjectURL(currentActiveAudioUrl);
            currentActiveAudioUrl = null;
        }
        
        // Clear pending uploads on engine instances safely
        if (typeof citizenEngine?.clearPendingMedia === 'function') citizenEngine.clearPendingMedia();
        if (typeof witnessEngine?.clearPendingMedia === 'function') witnessEngine.clearPendingMedia();

        if (previewContainer.children.length === 0) {
            previewContainer.classList.add('hidden');
        }
    });

    wrapper.appendChild(audioEl);
    wrapper.appendChild(removeBtn);

    previewContainer.appendChild(wrapper);
    previewContainer.classList.remove('hidden');
}
