// js/app-state.js - Main Application Orchestrator & State Manager
import './main.js';
import { initAuth, showAuthModal, bindHeaderEvents } from './auth.js';
import { showToast } from './utils.js';

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
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    bindHeaderEvents();
    setupMediaActionListeners();
});

function setupMediaActionListeners() {
    const voiceBtn = document.getElementById('btn-voice') || document.getElementById('recordVoiceBtn');
    const photoBtn = document.getElementById('btn-photo') || document.getElementById('addPhotoBtn');

    // Handle Voice Recording Button
    if (voiceBtn) {
        voiceBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();

            // 1. Guest Check: If not logged in, show Auth Modal
            if (!isUserAuthenticated()) {
                showToast("Please sign in or create an account to record testimony.", "info");
                showAuthModal();
                return;
            }

            // 2. Toggle Recording
            if (!isRecording) {
                await startRecording(voiceBtn);
            } else {
                stopRecording(voiceBtn);
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

            // Trigger hidden photo file input
            const hiddenFileInput = document.getElementById('hiddenPhotoInput');
            if (hiddenFileInput) hiddenFileInput.click();
        });
    }
}

async function startRecording(btnElement) {
    try {
        btnElement.disabled = true;
        btnElement.textContent = "Requesting Mic...";

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        audioChunks = [];
        mediaRecorder = new MediaRecorder(stream);

        mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            // Stop hardware streams to prevent background leaks
            stream.getTracks().forEach(track => track.stop());
            
            const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
            renderAudioPreview(audioBlob);
        };

        mediaRecorder.start();
        isRecording = true;
        
        btnElement.disabled = false;
        btnElement.textContent = "⏹️ Stop Recording";
        btnElement.classList.add('bg-red-600', 'text-white');

    } catch (err) {
        console.error("Microphone access error:", err);
        showToast("Microphone access denied or unavailable.", "error");
        btnElement.disabled = false;
        btnElement.textContent = "Record Voice Message";
    }
}

function stopRecording(btnElement) {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        isRecording = false;
        btnElement.textContent = "Record Voice Message";
        btnElement.classList.remove('bg-red-600', 'text-white');
    }
}

function renderAudioPreview(blob) {
    const previewContainer = document.getElementById('mediaPreviewContainer');
    if (!previewContainer) return;

    previewContainer.innerHTML = ''; // Clear existing audio preview
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
        URL.revokeObjectURL(audioUrl); // Free browser memory
    });

    wrapper.appendChild(audioEl);
    wrapper.appendChild(removeBtn);

    previewContainer.appendChild(wrapper);
    previewContainer.classList.remove('hidden');
}
