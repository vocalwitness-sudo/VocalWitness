// js/app-state.js - Centralized Application State & Engine Exports
import { db, storage } from './firebase-config.js';
import { CitizenTalkEngine, WitnessVoiceEngine } from './vocalWitnessEngine.js';

// ====================== ENGINE INSTANTIATION ======================
export const citizenEngine = new CitizenTalkEngine(db, storage);
export const witnessEngine = new WitnessVoiceEngine(db, storage);

// Global debug exposure (optional)
if (typeof window !== 'undefined') {
    window.citizenEngine = citizenEngine;
    window.witnessEngine = witnessEngine;
}

// ====================== APP STATE ======================
export const state = {
    isAuthenticated: false,
    currentUser: null,
    currentTab: 'square',
    currentMode: 'citizen'
};

export function isUserAuthenticated() {
    return state.isAuthenticated || !!state.currentUser;
}

export function updateAppState(newState) {
    Object.assign(state, newState);
    window.dispatchEvent(new CustomEvent('app-state-changed', { detail: state }));
}

// ====================== MEDIA HELPERS ======================
export function renderAudioPreview(blob) {
    const previewContainer = document.getElementById('mediaPreviewContainer') || document.getElementById('preview-area');
    if (!previewContainer) return;

    previewContainer.innerHTML = ''; 
    const audioUrl = URL.createObjectURL(blob);

    const wrapper = document.createElement('div');
    wrapper.className = 'flex items-center gap-2 p-2 bg-zinc-800 rounded-2xl border border-zinc-700 mt-2';

    const audioEl = document.createElement('audio');
    audioEl.controls = true;
    audioEl.src = audioUrl;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'text-red-400 hover:text-red-200 text-xs font-medium px-2 py-1';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => {
        wrapper.remove();
        URL.revokeObjectURL(audioUrl);
        citizenEngine.clearPendingMedia?.();
    });

    wrapper.appendChild(audioEl);
    wrapper.appendChild(removeBtn);

    previewContainer.appendChild(wrapper);
    previewContainer.classList.remove('hidden');
}
