// js/app-state.js - Centralized Application State & Engine Exports
import { db } from './firebase-config.js';
import { CitizenTalkEngine, WitnessVoiceEngine } from './vocalWitnessEngine.js';

// Track active Object URLs to prevent browser memory leaks
let currentActiveAudioUrl = null;
let currentActiveImageUrls = [];

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
 * Resets the media preview container back to its default placeholder state.
 */
export function clearMediaPreviews() {
    const previewContainer = document.getElementById('preview-area') || document.getElementById('mediaPreviewContainer');
    if (!previewContainer) return;

    // Revoke memory allocations
    if (currentActiveAudioUrl) {
        URL.revokeObjectURL(currentActiveAudioUrl);
        currentActiveAudioUrl = null;
    }
    currentActiveImageUrls.forEach(url => URL.revokeObjectURL(url));
    currentActiveImageUrls = [];

    // Reset UI to fallback placeholder
    previewContainer.innerHTML = '<span>Preview will appear here...</span>';
    previewContainer.classList.remove('hidden');

    // Clear pending uploads on engine instances safely
    if (typeof citizenEngine?.clearPendingMedia === 'function') citizenEngine.clearPendingMedia();
    if (typeof witnessEngine?.clearPendingMedia === 'function') witnessEngine.clearPendingMedia();
}

/**
 * Renders an audio playback element inside the active media preview container.
 * @param {Blob|File} blob - Recorded or selected audio blob.
 */
export function renderAudioPreview(blob) {
    if (!blob) return;

    const previewContainer = document.getElementById('preview-area') || document.getElementById('mediaPreviewContainer');
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
    wrapper.className = 'w-full flex items-center justify-between gap-3 p-3 bg-zinc-800/90 rounded-2xl border border-zinc-700/80 transition-all';

    const audioEl = document.createElement('audio');
    audioEl.controls = true;
    audioEl.src = currentActiveAudioUrl;
    audioEl.className = 'w-full h-8 max-w-xs';

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'text-red-400 hover:text-red-300 hover:bg-red-950/40 text-xs font-semibold px-3 py-1.5 rounded-xl border border-red-800/50 transition cursor-pointer';
    removeBtn.textContent = 'Remove';
    
    removeBtn.addEventListener('click', () => {
        clearMediaPreviews();
    });

    wrapper.appendChild(audioEl);
    wrapper.appendChild(removeBtn);

    previewContainer.appendChild(wrapper);
}

/**
 * Renders moderate image thumbnails inside the active media preview container.
 * @param {File[]} files - Array of selected image files.
 */
export function renderImagePreview(files = []) {
    const previewContainer = document.getElementById('preview-area') || document.getElementById('mediaPreviewContainer');
    if (!previewContainer) return;

    if (!files || files.length === 0) {
        clearMediaPreviews();
        return;
    }

    // Clean old objects
    currentActiveImageUrls.forEach(url => URL.revokeObjectURL(url));
    currentActiveImageUrls = [];
    previewContainer.innerHTML = '';

    files.forEach((file, index) => {
        if (!file.type.startsWith('image/')) return;

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
            files.splice(index, 1);
            renderImagePreview(files);
        });

        card.appendChild(img);
        card.appendChild(removeBtn);
        previewContainer.appendChild(card);
    });
}
