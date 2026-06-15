// js/media.js
import { showToast, generateSha256Hash } from './utils.js';
import { storage } from './firebase-config.js';
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js";

export let selectedImageFile = null;
export let selectedAudioFile = null;

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
                    <img src="${e.target.result}" class="image-preview rounded-2xl" alt="Forensic Preview">
                    <div class="teaser-badge">🔐 HASHED</div>
                    <button id="removeImgBtn" class="absolute top-2 right-2 bg-red-600 text-white rounded-full w-8 h-8 font-bold">✕</button>
                </div>`;
            previewArea.classList.remove('hidden');

            document.getElementById('removeImgBtn').addEventListener('click', () => removeImage(previewArea));
        };
        reader.readAsDataURL(file);

        showToast("📸 Image captured with Forensic Hash");
    } catch (err) {
        console.error(err);
        showToast("Image processing failed", "error");
    }
}

export function removeImage(previewArea) {
    selectedImageFile = null;
    previewArea.innerHTML = '';
    previewArea.classList.add('hidden');
}

// Photo Upload to Firebase (called from postButton)
export async function uploadForensicImage(userId) {
    if (!selectedImageFile) return null;

    const hash = await generateSha256Hash(selectedImageFile);
    const storageRef = ref(storage, `images/${userId}_${Date.now()}.jpg`);

    await uploadBytes(storageRef, selectedImageFile);
    const downloadURL = await getDownloadURL(storageRef);

    return { downloadURL, integrityHash: hash };
}
