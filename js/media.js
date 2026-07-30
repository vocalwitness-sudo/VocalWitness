// js/media.js - Forensic Media Handler (Polished + Hardened)
import { showToast, generateSha256Hash } from './utils.js';
import { storage, auth } from './firebase-config.js';
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js";

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

// ====================== UPLOAD (Hardened) ======================
export async function uploadForensicMedia() {
    const mediaData = {
        imageUrl: null,
        audioUrl: null,
        imageHash: null,
        audioHash: null
    };

    const userId = auth.currentUser?.uid || "anonymous";

    // ---------- Image Upload ----------
    if (selectedImageFile) {
        try {
            if (selectedImageFile.size === 0) {
                throw new Error("Selected image is empty");
            }

            const hash = await generateSha256Hash(selectedImageFile);
            const timestamp = Date.now();
            const path = `evidence/${userId}/${timestamp}_${selectedImageFile.name.replace(/\s+/g, '_')}`;

            const imageRef = ref(storage, path);
            const imageMetadata = {
                contentType: selectedImageFile.type || 'image/jpeg',
                customMetadata: {
                    uploadedBy: userId,
                    originalName: selectedImageFile.name
                }
            };

            await uploadBytes(imageRef, selectedImageFile, imageMetadata);
            mediaData.imageUrl = await getDownloadURL(imageRef);
            mediaData.imageHash = hash;

            console.log("✅ Image uploaded:", mediaData.imageUrl, `(${selectedImageFile.size} bytes)`);
        } catch (e) {
            console.error("Image upload failed", e);
            showToast("Image upload failed", "error");
        }
    }

    // ---------- Audio Upload ----------
    if (engineInstance?.currentAudioBlob) {
        try {
            const blob = engineInstance.currentAudioBlob;

            // Critical check – prevents 0-byte / corrupt files
            if (!blob || blob.size === 0) {
                console.warn("Audio blob is empty – skipping upload");
                showToast("Recording is empty. Please record again.", "error");
            } else {
                const hash = await generateSha256Hash(blob);
                const timestamp = Date.now();
                // Consistent path that matches previous error pattern
                const path = `evidence/${userId}/${timestamp}_voice.webm`;

                const audioRef = ref(storage, path);
                const metadata = {
                    contentType: blob.type || 'audio/webm',
                    customMetadata: {
                        uploadedBy: userId,
                        durationHint: 'voice'
                    }
                };

                await uploadBytes(audioRef, blob, metadata);
                mediaData.audioUrl = await getDownloadURL(audioRef);
                mediaData.audioHash = hash;

                console.log("✅ Audio uploaded:", mediaData.audioUrl, `(${blob.size} bytes)`);
            }
        } catch (e) {
            console.error("Audio upload failed", e);
            showToast("Voice upload failed", "error");
        }
    }

    return mediaData;
}

export function resetMediaState() {
    selectedImageFile = null;
    if (engineInstance) {
        engineInstance.currentAudioBlob = null;
    }
    const preview = document.getElementById('preview-area');
    if (preview) {
        preview.innerHTML = 'Preview will appear here...';
        preview.classList.remove('has-content');
    }
}

// Global exposure
window.handleImageSelect = handleImageSelect;
window.toggleVoiceRecording = toggleVoiceRecording;
window.resetMediaState = resetMediaState;
