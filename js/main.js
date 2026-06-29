// js/media.js - CLEAN VERSION
import { showToast, generateSha256Hash } from './utils.js';
import { storage } from './firebase-config.js';
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js";

export let selectedImageFile = null;
let engineInstance = null;
let recordingTimerInterval = null;

export function setEngine(engine) {
    engineInstance = engine;
    console.log("✅ Engine connected to media.js");
}

// ====================== PHOTO ======================
export async function handleImageSelect(event, previewArea) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast("Please select a valid image", "error");
        return;
    }
    if (file.size > 10 * 1024 * 1024) {
        showToast("Image too large (max 10MB)", "error");
        return;
    }

    selectedImageFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        previewArea.innerHTML = `
            <div class="relative">
                <img src="${e.target.result}" class="image-preview rounded-2xl w-full" alt="Preview">
                <button id="removeImgBtn" class="absolute top-3 right-3 bg-red-600 text-white rounded-full w-8 h-8 flex items-center justify-center">✕</button>
            </div>`;
        document.getElementById('removeImgBtn').onclick = () => removeImage(previewArea);
    };
    reader.readAsDataURL(file);
}

export function removeImage(previewArea) {
    selectedImageFile = null;
    if (previewArea) previewArea.innerHTML = '';
}

// ====================== VOICE WITH TIMER ======================
export function toggleVoiceRecording(voiceBtn) {
    if (!engineInstance) {
        showToast("Voice engine not ready", "error");
        return;
    }

    if (!engineInstance.mediaRecorder || engineInstance.mediaRecorder.state === "inactive") {
        engineInstance.startVoiceRecording(300000);
        
        voiceBtn.classList.add('recording-active');
        voiceBtn.innerHTML = `⏹️ <span id="rec-timer" class="font-mono">00:00</span>`;

        let seconds = 0;
        recordingTimerInterval = setInterval(() => {
            seconds++;
            const min = String(Math.floor(seconds / 60)).padStart(2, '0');
            const sec = String(seconds % 60).padStart(2, '0');
            document.getElementById('rec-timer').textContent = `${min}:${sec}`;
        }, 1000);

        showToast("🎤 Recording...", "info");
    } else {
        engineInstance.stopVoiceRecording();
        clearInterval(recordingTimerInterval);
        
        voiceBtn.classList.remove('recording-active');
        voiceBtn.textContent = '🎙️ Voice Testimony';
        showToast("✅ Recording completed", "success");
    }
}

export async function uploadForensicMedia(userId = "anonymous") {
    const mediaData = {};
    if (selectedImageFile) {
        try {
            const hash = await generateSha256Hash(selectedImageFile);
            const imageRef = ref(storage, `images/${userId}/${Date.now()}.jpg`);
            await uploadBytes(imageRef, selectedImageFile);
            mediaData.imageUrl = await getDownloadURL(imageRef);
            mediaData.imageHash = hash;
        } catch (e) { console.error(e); }
    }
    if (engineInstance?.currentAudioBlob) {
        try {
            const hash = await generateSha256Hash(engineInstance.currentAudioBlob);
            const audioRef = ref(storage, `testimonies/${userId}/${Date.now()}.webm`);
            await uploadBytes(audioRef, engineInstance.currentAudioBlob);
            mediaData.audioUrl = await getDownloadURL(audioRef);
            mediaData.audioHash = hash;
        } catch (e) { console.error(e); }
    }
    return mediaData;
}

export function resetMediaState() {
    selectedImageFile = null;
    const preview = document.getElementById('preview-area');
    if (preview) preview.innerHTML = '';
}

// Global exposures
window.handleImageSelect = handleImageSelect;
window.toggleVoiceRecording = toggleVoiceRecording;
window.resetMediaState = resetMediaState;
