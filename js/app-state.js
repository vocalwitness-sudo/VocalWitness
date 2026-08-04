// js/app-state.js - Main Application Orchestrator & State Manager
import './main.js';
import { initAuth, showAuthModal, bindHeaderEvents } from './auth.js';
import { showToast } from './utils.js';
import { db, storage } from './firebase-config.js';
import { CitizenTalkEngine, WitnessVoiceEngine } from './vocalWitnessEngine.js'; // Relative import inside js/

// ====================== ENGINES INSTANTIATION ======================
export const citizenEngine = new CitizenTalkEngine(db, storage);
export const witnessEngine = new WitnessVoiceEngine(db, storage);

// Global debug exposure
window.citizenEngine = citizenEngine;
window.witnessEngine = witnessEngine;

// ====================== APP STATE ======================
export const state = {
    isAuthenticated: false,
    currentUser: null,
};

export function isUserAuthenticated() {
    return state.isAuthenticated || !!state.currentUser;
}

export function updateAppState(newState) {
    Object.assign(state, newState);
    window.dispatchEvent(new CustomEvent('app-state-changed', { detail: state }));
}

// ====================== MEDIA HANDLERS ======================
document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    bindHeaderEvents();
    setupMediaActionListeners();
});

function setupMediaActionListeners() {
    const voiceBtn = document.getElementById('btn-voice') || document.getElementById('recordVoiceBtn');
    const photoBtn = document.getElementById('btn-photo') || document.getElementById('addPhotoBtn');

    // Handle Voice Recording Button using CitizenTalkEngine
    if (voiceBtn) {
        voiceBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();

            if (!isUserAuthenticated()) {
                showToast("Please sign in or create an account to record testimony.", "info");
                showAuthModal();
                return;
            }

            try {
                const audioBlob = await citizenEngine.toggleVoiceRecording(voiceBtn);
                if (audioBlob) {
                    renderAudioPreview(audioBlob);
                }
            } catch (err) {
                console.error("Recording error:", err);
                showToast("Microphone access denied or unavailable.", "error");
            }
        });
    }

    // Handle Photo Upload Button
    if (photoBtn) {
        photoBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();

            if (!isUserAuthenticated()) {
                showToast("Please sign in or create an account to attach media.", "info");
                showAuthModal();
                return;
            }

            const hiddenFileInput = document.getElementById('hiddenPhotoInput');
            if (hiddenFileInput) hiddenFileInput.click();
        });
    }
}

function renderAudioPreview(blob) {
    const previewContainer = document.getElementById('mediaPreviewContainer');
    if (!previewContainer) return;

    previewContainer.innerHTML = ''; 
    const audioUrl = URL.createObjectURL(blob);

    const wrapper = document.createElement('div');
    wrapper.className = 'flex items-center gap-2 p-2 bg-gray-800 rounded border border-gray-700 mt-2';

    const audioEl = document.createElement('audio');
    audioEl.controls = true;
    audioEl.src = audioUrl;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'text-red-400 hover:text-red-200 text-sm';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => {
        wrapper.remove();
        URL.revokeObjectURL(audioUrl);
        citizenEngine.clearPendingMedia();
    });

    wrapper.appendChild(audioEl);
    wrapper.appendChild(removeBtn);

    previewContainer.appendChild(wrapper);
    previewContainer.classList.remove('hidden');
}
