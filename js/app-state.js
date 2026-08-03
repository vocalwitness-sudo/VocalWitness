// js/app.js - Main Application Orchestrator

import { initAuth, showAuthModal, bindHeaderEvents } from './auth.js';
import { isUserAuthenticated } from './app-state.js';
import { showToast } from './utils.js';

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

            // 1. Guest Check: If not logged in, show Auth Modal & preserve read-only experience
            if (!isUserAuthenticated()) {
                showToast("Please sign in or create an account to record testimony.", "info");
                showAuthModal();
                return;
            }

            // 2. Prevent button stiffness during initialization
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

            // Trigger hidden photo file input safely ONCE
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
        // Leave mimeType empty so Firefox selects its native supported audio codec
        mediaRecorder = new MediaRecorder(stream);

        mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            // Stop hardware streams to prevent Firefox background leaks
            stream.getTracks().forEach(track => track.stop());
            
            const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
            
            // Render audio preview ONLY when recording cleanly stops (prevents premature update jump)
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
    if (previewContainer) {
        const audioUrl = URL.createObjectURL(blob);
        previewContainer.innerHTML = `
            <div class="flex items-center gap-2 p-2 bg-gray-800 rounded border border-gray-700 mt-2">
                <audio controls src="${audioUrl}"></audio>
                <button type="button" onclick="this.parentElement.remove()" class="text-red-400 hover:text-red-200">Remove</button>
            </div>
        `;
        previewContainer.classList.remove('hidden');
    }
}
