// js/media.js - Enhanced Media Handling with Citizen vs Witness Mode Support
import { showToast, generateSha256Hash } from './utils.js';
import { storage } from './firebase-config.js';
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js";

export let selectedImageFile = null;
export let selectedAudioFile = null;
let engineInstance = null;
let currentMode = 'citizen-talk'; // Will be updated from main.js

export function setEngine(engine) {
    engineInstance = engine;
}

export function setCurrentMode(mode) {
    currentMode = mode;
    console.log(`🎥 Media mode set to: ${mode}`);
}

// ====================== PHOTO HANDLING ======================
export async function handleImageSelect(event, previewArea) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast("Please select an image file", "error");
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
                    <img src="${e.target.result}" class="image-preview rounded-2xl w-full" alt="Forensic Preview">
                    <div class="absolute top-3 right-3 bg-black/70 text-[10px] px-2 py-1 rounded-full text-emerald-400 font-medium">🔐 HASHED</div>
                    <button id="removeImgBtn" class="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white rounded-full w-8 h-8 flex items-center justify-center text-xl leading-none transition">✕</button>
                </div>`;

            previewArea.classList.remove('hidden');

            const removeBtn = document.getElementById('removeImgBtn');
            if (removeBtn) {
                removeBtn.addEventListener('click', () => removeImage(previewArea));
            }
        };
        reader.readAsDataURL(file);

        showToast("📸 Image secured with Forensic Hash", "success");
    } catch (err) {
        console.error(err);
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
        showToast("Voice engine not ready yet", "error");
        return;
    }

    const isWitnessMode = currentMode === 'witness-voice';

    if (!engineInstance.mediaRecorder || engineInstance.mediaRecorder.state === "inactive") {
        // Start recording
        const maxDuration = isWitnessMode ? 300000 : 120000; // 5 min for Witness, 2 min for Citizen
        engineInstance.startVoiceRecording(maxDuration);
        
        voiceBtn.classList.add('recording-active');
        voiceBtn.textContent = '⏹️ Stop Recording';
        
        showToast(isWitnessMode 
            ? "🎤 Witness Voice Recording (Forensic Mode)" 
            : "🎤 Recording started...", "info");
    } else {
        // Stop recording
        engineInstance.stopVoiceRecording();
        voiceBtn.classList.remove('recording-active');
        voiceBtn.textContent = '🎙️ Voice Testimony';
        
        showToast("✅ Recording saved successfully", "success");
    }
}

// ====================== RESET MEDIA ======================
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

    console.log("🧹 Media state fully reset");
}

// ====================== UPLOAD MEDIA ======================
export async function uploadForensicMedia(userId = "anonymous") {
    const mediaData = { mode: currentMode };

    // Upload Image
    if (selectedImageFile) {
        try {
            const hash = await generateSha256Hash(selectedImageFile);
            const imageRef = ref(storage, `images/${userId}_${Date.now()}.jpg`);
            
            await uploadBytes(imageRef, selectedImageFile);
            mediaData.imageUrl = await getDownloadURL(imageRef);
            mediaData.imageHash = hash;
            mediaData.hasImage = true;
        } catch (e) {
            console.error("Image upload failed", e);
            showToast("Image upload failed", "error");
        }
    }

    // Upload Audio (Voice Testimony)
    if (engineInstance?.currentAudioBlob) {
        try {
            const hash = await generateSha256Hash(engineInstance.currentAudioBlob);
            const audioRef = ref(storage, `testimonies/${userId}_${Date.now()}.webm`);
            
            await uploadBytes(audioRef, engineInstance.currentAudioBlob);
            mediaData.audioUrl = await getDownloadURL(audioRef);
            mediaData.audioHash = hash;
            mediaData.hasAudio = true;
        } catch (e) {
            console.error("Audio upload failed", e);
            showToast("Voice upload failed", "error");
        }
    }

    return mediaData;
}

// Global exposure for HTML onclick handlers
window.handleImageSelect = handleImageSelect;
window.toggleVoiceRecording = toggleVoiceRecording;
window.resetMediaState = resetMediaState;
