// js/media.js - Enhanced & Production-Ready Media Handling
import { showToast, generateSha256Hash } from './utils.js';
import { storage } from './firebase-config.js';
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js";

export let selectedImageFile = null;
export let selectedAudioFile = null;

let engineInstance = null;
let currentMode = 'citizen-talk';

export function setEngine(engine) {
    engineInstance = engine;
    console.log("✅ Engine connected to media.js");
}

export function setCurrentMode(mode) {
    currentMode = mode;
    console.log(`🎥 Media mode updated to: ${mode}`);
}

// ====================== PHOTO HANDLING ======================
export async function handleImageSelect(event, previewArea) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast("Please select a valid image file", "error");
        return;
    }
    if (file.size > 10 * 1024 * 1024) { // 10MB limit
        showToast("Image must be under 10MB", "error");
        return;
    }

    selectedImageFile = file;

    try {
        const hash = await generateSha256Hash(file);
        console.log("🛡️ Forensic Image Hash:", hash);

        const reader = new FileReader();
        reader.onload = (e) => {
            previewArea.innerHTML = `
                <div class="relative group">
                    <img src="${e.target.result}" class="image-preview rounded-2xl w-full max-h-96 object-cover" alt="Forensic Preview">
                    <div class="absolute top-3 right-3 bg-black/80 text-[10px] px-3 py-1 rounded-full text-emerald-400 font-medium">🔐 HASHED</div>
                    <button id="removeImgBtn" class="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white rounded-full w-8 h-8 flex items-center justify-center text-xl leading-none transition-all">✕</button>
                </div>`;
            
            document.getElementById('removeImgBtn')?.addEventListener('click', () => removeImage(previewArea));
        };
        reader.readAsDataURL(file);
        
        showToast("📸 Image secured with forensic hash", "success");
    } catch (err) {
        console.error("Image processing error:", err);
        showToast("Failed to process image", "error");
    }
}

export function removeImage(previewArea) {
    selectedImageFile = null;
    if (previewArea) {
        previewArea.innerHTML = '';
        previewArea.classList.add('hidden');
    }
}

// ====================== VOICE RECORDING ======================
export function toggleVoiceRecording(voiceBtn) {
    if (!engineInstance) {
        showToast("Voice engine not initialized yet", "error");
        return;
    }

    const isWitnessMode = currentMode === 'witness-voice';

    if (!engineInstance.mediaRecorder || engineInstance.mediaRecorder.state === "inactive") {
        // Start recording
        const maxDuration = isWitnessMode ? 300000 : 120000; // 5min Witness / 2min Citizen
        engineInstance.startVoiceRecording(maxDuration);
        
        voiceBtn.classList.add('recording-active');
        voiceBtn.textContent = '⏹️ Stop Recording';
        showToast(isWitnessMode ? "🎤 Forensic Witness Voice Recording Active" : "🎤 Recording...", "info");
    } else {
        // Stop recording
        engineInstance.stopVoiceRecording();
        
        voiceBtn.classList.remove('recording-active');
        voiceBtn.textContent = '🎙️ Voice Testimony';
        showToast("✅ Recording completed", "success");
    }
}

// ====================== UPLOAD MEDIA ======================
export async function uploadForensicMedia(userId = "anonymous") {
    const mediaData = { mode: currentMode, hasImage: false, hasAudio: false };

    // Image Upload
    if (selectedImageFile) {
        try {
            const hash = await generateSha256Hash(selectedImageFile);
            const timestamp = Date.now();
            const imageRef = ref(storage, `images/${userId}/${timestamp}.jpg`);
            await uploadBytes(imageRef, selectedImageFile);
            mediaData.imageUrl = await getDownloadURL(imageRef);
            mediaData.imageHash = hash;
            mediaData.hasImage = true;
            console.log("✅ Image uploaded successfully");
        } catch (e) {
            console.error("Image upload failed:", e);
            showToast("Image upload failed", "error");
        }
    }

    // Audio Upload
    if (engineInstance?.currentAudioBlob) {
        try {
            const hash = await generateSha256Hash(engineInstance.currentAudioBlob);
            const timestamp = Date.now();
            const audioRef = ref(storage, `testimonies/${userId}/${timestamp}.webm`);
            await uploadBytes(audioRef, engineInstance.currentAudioBlob);
            mediaData.audioUrl = await getDownloadURL(audioRef);
            mediaData.audioHash = hash;
            mediaData.hasAudio = true;
            console.log("✅ Audio uploaded successfully");
        } catch (e) {
            console.error("Audio upload failed:", e);
            showToast("Voice upload failed", "error");
        }
    }

    return mediaData;
}

// ====================== RESET ======================
export function resetMediaState() {
    selectedImageFile = null;
    selectedAudioFile = null;

    const previewArea = document.getElementById('preview-area');
    if (previewArea) {
        previewArea.innerHTML = '';
        previewArea.classList.add('hidden');
    }

    const voiceBtn = document.getElementById('btn-voice');
    if (voiceBtn) {
        voiceBtn.classList.remove('recording-active');
        voiceBtn.textContent = '🎙️ Voice Testimony';
    }
    
    console.log("🧹 Media state reset");
}

// Global exposures for inline usage if needed
window.handleImageSelect = handleImageSelect;
window.toggleVoiceRecording = toggleVoiceRecording;
window.resetMediaState = resetMediaState;
