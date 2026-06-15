// js/media.js
import { showToast, generateSha256Hash } from './utils.js';

export let selectedImageFile = null;
export let selectedAudioFile = null;

// Image Capture with Forensic Hash
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
                    <img src="${e.target.result}" class="image-preview" alt="Forensic Preview">
                    <div class="teaser-badge">HASHED</div>
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

// Voice Recording (already improved)
export function toggleVoiceRecording(voiceBtn) {
    // ... your existing recording logic from before ...
    // (keep your current implementation or let me know if you want an updated one)
}
