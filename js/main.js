// js/media.js
import { showToast } from './utils.js';

let mediaRecorder;
let recordedChunks = [];
let compressedImageBase64 = null;
let recordedAudioBlob = null;

// --- Image Logic ---
export async function handleImageSelect(event, previewArea) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        compressedImageBase64 = e.target.result;
        previewArea.innerHTML = `
            <div class="relative">
                <img src="${compressedImageBase64}" class="image-preview" alt="Forensic Preview">
                <button id="removeImgBtn" class="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full w-7 h-7">✕</button>
            </div>`;
        previewArea.classList.remove('hidden');
        
        // Add listener for the remove button
        document.getElementById('removeImgBtn').addEventListener('click', () => removeImage(previewArea));
    };
    reader.readAsDataURL(file);
    showToast("📸 Image attached & metadata scrubbed", "success");
}

export function removeImage(previewArea) {
    compressedImageBase64 = null;
    previewArea.innerHTML = '';
    previewArea.classList.add('hidden');
}

// --- Audio Logic ---
export function toggleVoiceRecording(voiceBtn) {
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                mediaRecorder = new MediaRecorder(stream);
                recordedChunks = [];
                mediaRecorder.ondataavailable = e => recordedChunks.push(e.data);
                mediaRecorder.onstop = () => {
                    recordedAudioBlob = new Blob(recordedChunks, { type: 'audio/webm' });
                    voiceBtn.classList.remove('recording-active');
                    voiceBtn.textContent = '✅ Voice Recorded';
                    showToast("🎤 Voice testimony saved", "success");
                };
                mediaRecorder.start();
                voiceBtn.classList.add('recording-active');
                voiceBtn.textContent = '⏹️ Stop Recording';
            })
            .catch(() => showToast("Microphone permission denied", "error"));
    } else {
        mediaRecorder.stop();
    }
}
