// js/media.js - Forensic Media Handler (Polished)
import { showToast, generateSha256Hash } from './utils.js';
import { storage } from './firebase-config.js';
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js";
import { auth } from './firebase-config.js';
import { AppState } from './app-state.js';

export let selectedImageFile = null;
let engineInstance = null;

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
            <div class="relative mt-4 rounded-2xl overflow-hidden border border-zinc-700">
                <img src="${e.target.result}" class="w-full max-h-80 object-cover" alt="Preview">
                <button id="removeImgBtn" 
                        class="absolute top-3 right-3 bg-red-600 hover:bg-red-700 text-white rounded-full w-8 h-8 flex items-center justify-center text-xl shadow-lg transition">
                    ✕
                </button>
            </div>`;
        
        document.getElementById('removeImgBtn').onclick = () => removeImage(previewArea);
    };
    reader.readAsDataURL(file);
}

export function removeImage(previewArea) {
    selectedImageFile = null;
    if (previewArea) previewArea.innerHTML = 'Preview will appear here...';
}

// ====================== VOICE ======================
export function toggleVoiceRecording(voiceBtn) {
    if (!engineInstance) {
        return showToast("Voice engine not ready yet", "error");
    }

    const isRecording = engineInstance.mediaRecorder && 
                       engineInstance.mediaRecorder.state !== "inactive";

    if (!isRecording) {
        engineInstance.startVoiceRecording(300000); // 5 minutes max
        voiceBtn.classList.add('recording-active', 'animate-pulse');
        showToast("🎤 Recording started... Speak clearly", "info");
    } else {
        engineInstance.stopVoiceRecording();
        voiceBtn.classList.remove('recording-active', 'animate-pulse');
        showToast("✅ Recording saved. Ready to publish.", "success");
    }
}

// ====================== UPLOAD ======================
export async function uploadForensicMedia() {
    const mediaData = { 
        imageUrl: null, 
        audioUrl: null, 
        imageHash: null, 
        audioHash: null 
    };

    const userId = auth.currentUser?.uid || "anonymous";

    // Image Upload
    if (selectedImageFile) {
        try {
            const hash = await generateSha256Hash(selectedImageFile);
            const timestamp = Date.now();
            const path = `public/${userId}/${timestamp}_${selectedImageFile.name}`;
            
            const imageRef = ref(storage, path);
            await uploadBytes(imageRef, selectedImageFile);
            
            mediaData.imageUrl = await getDownloadURL(imageRef);
            mediaData.imageHash = hash;
        } catch (e) {
            console.error("Image upload failed", e);
            showToast("Image upload failed", "error");
        }
    }

    // Audio Upload
    if (engineInstance?.currentAudioBlob) {
        try {
            const hash = await generateSha256Hash(engineInstance.currentAudioBlob);
            const timestamp = Date.now();
            const audioRef = ref(storage, `audio/${userId}/${timestamp}.webm`);

            await uploadBytes(audioRef, engineInstance.currentAudioBlob);
            
            mediaData.audioUrl = await getDownloadURL(audioRef);
            mediaData.audioHash = hash;
        } catch (e) {
            console.error("Audio upload failed", e);
            showToast("Voice upload failed", "error");
        }
    }

    return mediaData;
}

export function resetMediaState() {
    selectedImageFile = null;
    const preview = document.getElementById('preview-area');
    if (preview) preview.innerHTML = 'Preview will appear here...';
}

// Global exposure
window.handleImageSelect = handleImageSelect;
window.toggleVoiceRecording = toggleVoiceRecording;
window.resetMediaState = resetMediaState;
