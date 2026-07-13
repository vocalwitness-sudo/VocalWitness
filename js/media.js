// js/media.js - Forensic Media Handler (Citizen + Witness Ready)
import { showToast, generateSha256Hash } from './utils.js';
import { storage } from './firebase-config.js';
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js";
import { auth } from './firebase-config.js';
import { AppState } from './app-state.js';

export let selectedImageFile = null;
let engineInstance = null;

// Connect engine from main.js
export function setEngine(engine) {
    engineInstance = engine;
    console.log("✅ Media Engine Connected");
}

// ====================== PHOTO ======================
export async function handleImageSelect(event, previewArea) {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return showToast("Please select an image", "error");
    if (file.size > 10 * 1024 * 1024) return showToast("Image too large (max 10MB)", "error");

    selectedImageFile = file;

    const reader = new FileReader();
    reader.onload = (e) => {
        previewArea.innerHTML = `
            <div class="relative mt-4 rounded-2xl overflow-hidden">
                <img src="${e.target.result}" class="w-full max-h-80 object-cover" alt="Preview">
                <button id="removeImgBtn" class="absolute top-3 right-3 bg-red-600 hover:bg-red-700 text-white rounded-full w-8 h-8 flex items-center justify-center text-xl shadow-lg">✕</button>
            </div>`;
        document.getElementById('removeImgBtn').onclick = () => removeImage(previewArea);
    };
    reader.readAsDataURL(file);
}

export function removeImage(previewArea) {
    selectedImageFile = null;
    if (previewArea) previewArea.innerHTML = '';
}

// ====================== VOICE ======================
export function toggleVoiceRecording(voiceBtn) {
    if (!engineInstance) return showToast("Voice engine not ready yet", "error");

    const isRecording = engineInstance.mediaRecorder && engineInstance.mediaRecorder.state !== "inactive";

    if (!isRecording) {
        engineInstance.startVoiceRecording(300000); // 5 min max
        voiceBtn.classList.add('recording-active');
        // You can enhance the button UI here as in your original code
        showToast("🎤 Recording started...", "info");
    } else {
        engineInstance.stopVoiceRecording();
        voiceBtn.classList.remove('recording-active');
        showToast("✅ Recording saved", "success");
    }
}

// ====================== UPLOAD ======================
export async function uploadForensicMedia() {
    const mediaData = { imageUrl: null, audioUrl: null, imageHash: null, audioHash: null };

    const userId = auth.currentUser?.uid || "anonymous";
    const isWitness = AppState.currentMode === 'witness';

    // Image
    if (selectedImageFile) {
        try {
            const hash = await generateSha256Hash(selectedImageFile);
            const path = isWitness 
                ? `witness/${userId}/${Date.now()}_${selectedImageFile.name}`
                : `public/${userId}/${Date.now()}_${selectedImageFile.name}`;

            const imageRef = ref(storage, path);
            await uploadBytes(imageRef, selectedImageFile);
            mediaData.imageUrl = await getDownloadURL(imageRef);
            mediaData.imageHash = hash;
        } catch (e) {
            console.error("Image upload failed", e);
            throw e;
        }
    }

    // Audio
    if (engineInstance?.currentAudioBlob) {
        try {
            const hash = await generateSha256Hash(engineInstance.currentAudioBlob);
            const audioRef = ref(storage, `audio/${userId}/${Date.now()}.webm`);
            await uploadBytes(audioRef, engineInstance.currentAudioBlob);
            mediaData.audioUrl = await getDownloadURL(audioRef);
            mediaData.audioHash = hash;
        } catch (e) {
            console.error("Audio upload failed", e);
        }
    }

    return mediaData;
}

export function resetMediaState() {
    selectedImageFile = null;
    const preview = document.getElementById('preview-area');
    if (preview) preview.innerHTML = '';
}

// Global exposure
window.handleImageSelect = handleImageSelect;
window.toggleVoiceRecording = toggleVoiceRecording;
window.resetMediaState = resetMediaState;
