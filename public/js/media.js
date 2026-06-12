/**
 * VocalWitness Media Module
 * Handles raw asset capture, previewing, and temporary storage
 */
import { showToast } from './utils.js';

let mediaRecorder;
let recordedChunks = [];
let mediaStream = null;

export let selectedImageFile = null;
export let selectedAudioFile = null;

/**
 * Image Capture: Handles preview generation and state management
 */
export async function handleImageSelect(event, previewArea) {
    const file = event.target.files[0];
    if (!file) return;
    
    selectedImageFile = file;
    const reader = new FileReader();
    
    reader.onload = (e) => {
        previewArea.innerHTML = `
            <div class="relative group">
                <img src="${e.target.result}" class="rounded-2xl border border-zinc-700 w-full object-cover max-h-48" alt="Forensic Preview">
                <button id="removeImgBtn" class="absolute top-2 right-2 bg-red-600 text-white rounded-full w-8 h-8 font-bold">✕</button>
            </div>`;
        previewArea.classList.remove('hidden');
        document.getElementById('removeImgBtn').addEventListener('click', () => removeImage(previewArea));
    };
    reader.readAsDataURL(file);
    showToast("📸 Image asset captured for ledger.");
}

export function removeImage(previewArea) {
    selectedImageFile = null;
    previewArea.innerHTML = '';
    previewArea.classList.add('hidden');
}

/**
 * Audio Capture: Manages the MediaRecorder lifecycle
 */
export function toggleVoiceRecording(voiceBtn) {
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                mediaStream = stream;
                recordedChunks = [];
                mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
                
                mediaRecorder.ondataavailable = e => recordedChunks.push(e.data);
                
                mediaRecorder.onstop = () => {
                    selectedAudioFile = new File(recordedChunks, `audio_${Date.now()}.webm`, { type: 'audio/webm' });
                    voiceBtn.classList.remove('animate-pulse', 'bg-red-500');
                    voiceBtn.textContent = '✅ Testimony Captured';
                    showToast("🎤 Forensic audio archived.");
                    
                    // Stop all audio tracks to release the mic
                    mediaStream.getTracks().forEach(track => track.stop());
                };
                
                mediaRecorder.start();
                voiceBtn.classList.add('animate-pulse', 'bg-red-500');
                voiceBtn.textContent = '⏹️ Stop Recording';
            })
            .catch(err => {
                console.error(err);
                showToast("Microphone access denied.", "error");
            });
    } else {
        mediaRecorder.stop();
    }
}


// Add this to js/media.js
export function resetMediaState() {
    selectedImageFile = null;
    selectedAudioFile = null;
    // You may also want to clear UI previews here
}
