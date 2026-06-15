// js/media.js
import { showToast, generateSha256Hash } from './utils.js';
import { storage } from './firebase-config.js';
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js";

export let selectedImageFile = null;
export let selectedAudioFile = null;

let engineInstance = null;

export function setEngine(engine) {
    engineInstance = engine;
}

// ====================== PHOTO FORENSIC HASHING ======================
export async function handleImageSelect(event, previewArea) {
    const file = event.target.files[0];
    if (!file) return;

    selectedImageFile = file;

    try {
        const hash = await generateSha256Hash(file);
        console.log("🛡️ Forensic Image Hash:", hash);

        const reader = new FileReader();
        reader.onload = (e) => {
            previewArea.innerHTML = `
                <div class="relative group">
                    <img src="${e.target.result}" class="image-preview rounded-2xl w-full" alt="Forensic Preview">
                    <div class="teaser-badge">🔐 HASHED</div>
                    <button id="removeImgBtn" class="absolute top-2 right-2 bg-red-600 text-white rounded-full w-8 h-8 font-bold">✕</button>
                </div>`;
            previewArea.classList.remove('hidden');

            document.getElementById('removeImgBtn').addEventListener('click', () => removeImage(previewArea));
        };
        reader.readAsDataURL(file);

        showToast("📸 Image captured + Forensic Hash generated");
    } catch (err) {
        console.error(err);
        showToast("Failed to process image", "error");
    }
}

export function removeImage(previewArea) {
    selectedImageFile = null;
    previewArea.innerHTML = '';
    previewArea.classList.add('hidden');
}

// ====================== VOICE RECORDING (Connected to Engine) ======================
export function toggleVoiceRecording(voiceBtn) {
    if (!engineInstance) {
        showToast("Engine not ready yet", "error");
        return;
    }

    if (!engineInstance.mediaRecorder || engineInstance.mediaRecorder.state === "inactive") {
        // Start Recording
        engineInstance.startVoiceRecording(120000);
        voiceBtn.classList.add('recording-active');
        voiceBtn.textContent = '⏹️ Stop Recording';
        showToast("🎤 Recording... (Max 2 minutes)");
    } else {
        // Stop Recording
        engineInstance.stopVoiceRecording();
        voiceBtn.classList.remove('recording-active');
        voiceBtn.textContent = '✅ Testimony Captured';
        showToast("🎤 Recording saved to memory");
    }
}

// ====================== UPLOAD BOTH MEDIA (Called from Post) ======================
export async function uploadForensicMedia(userId = "anonymous") {
    const mediaData = {};

    // Upload Image if exists
    if (selectedImageFile) {
        try {
            const hash = await generateSha256Hash(selectedImageFile);
            const imageRef = ref(storage, `images/${userId}_${Date.now()}.jpg`);
            await uploadBytes(imageRef, selectedImageFile);
            mediaData.imageUrl = await getDownloadURL(imageRef);
            mediaData.imageHash = hash;
        } catch (e) {
            console.error("Image upload failed", e);
        }
    }

    // Upload Audio if exists (from engine)
    if (engineInstance?.currentAudioBlob) {
        try {
            const hash = await generateSha256Hash(engineInstance.currentAudioBlob);
            const audioRef = ref(storage, `testimonies/${userId}_${Date.now()}.webm`);
            await uploadBytes(audioRef, engineInstance.currentAudioBlob);
            mediaData.audioUrl = await getDownloadURL(audioRef);
            mediaData.audioHash = hash;
        } catch (e) {
            console.error("Audio upload failed", e);
        }
    }

    return mediaData;
}
