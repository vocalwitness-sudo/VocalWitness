import { showToast } from './utils.js';

let mediaRecorder;
let recordedChunks = [];

export let selectedImageFile = null;
export let selectedAudioFile = null;

export async function handleImageSelect(event, previewArea) {
    const file = event.target.files[0];
    if (!file) return;
    selectedImageFile = file;

    const reader = new FileReader();
    reader.onload = (e) => {
        previewArea.innerHTML = `
            <div class="relative">
                <img src="${e.target.result}" class="image-preview" alt="Forensic Preview">
                <button id="removeImgBtn" class="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full w-7 h-7">✕</button>
            </div>`;
        previewArea.classList.remove('hidden');
        document.getElementById('removeImgBtn').addEventListener('click', () => removeImage(previewArea));
    };
    reader.readAsDataURL(file);
    showToast("📸 Image queued for upload", "success");
}

export function removeImage(previewArea) {
    selectedImageFile = null;
    previewArea.innerHTML = '';
    previewArea.classList.add('hidden');
}

export function toggleVoiceRecording(voiceBtn) {
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                mediaRecorder = new MediaRecorder(stream);
                recordedChunks = [];
                mediaRecorder.ondataavailable = e => recordedChunks.push(e.data);
                mediaRecorder.onstop = () => {
                    selectedAudioFile = new File(recordedChunks, `audio_${Date.now()}.webm`, { type: 'audio/webm' });
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
