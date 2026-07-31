// js/composer.js
import { compressImage } from './media-compression.js';
import { showToast, generateSha256Hash } from './utils.js';
import { getCurrentUserTier, getCurrentWitnessLevel } from './tier.js';
import { db, auth, storage } from './firebase-config.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js";
import { uploadForensicMedia, resetMediaState } from './media.js';

let selectedFile = null;

const btnPhoto = document.getElementById('btn-photo');
const mainInput = document.getElementById('mainInput');
const previewArea = document.getElementById('preview-area');
const postButton = document.getElementById('postButton');

// ==================== ACTIVE STATE ====================
function toggleActive(button) {
    document.getElementById('btn-voice')?.classList.remove('active');
    button?.classList.toggle('active');
}

// ==================== PHOTO ====================
btnPhoto?.addEventListener('click', async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const compressedFile = await compressImage(file, 1200, 0.82);
            selectedFile = compressedFile;
            toggleActive(btnPhoto);

            const reader = new FileReader();
            reader.onload = (ev) => {
                if (!previewArea) return;
                previewArea.innerHTML = `
                    <img src="${ev.target.result}"
                         class="max-h-[300px] max-w-full rounded-2xl object-contain shadow-lg"
                         alt="Preview">
                    <p class="text-xs text-emerald-400 mt-2">
                        ${compressedFile.name} • ${(compressedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                `;
                previewArea.classList.add('has-content');
            };
            reader.readAsDataURL(compressedFile);
        } catch (err) {
            console.error(err);
            showToast('Failed to compress image', 'error');
        }
    };
    input.click();
});

// ==================== PUBLISH ====================
postButton?.addEventListener('click', async () => {
    const text = mainInput?.value.trim();

    // media.js owns the voice blob – we only check selectedFile here
    if (!text && !selectedFile) {
        // Allow pure-voice posts (engine may have a recording)
        // The real emptiness check happens inside uploadForensicMedia
    }

    if (!auth.currentUser) {
        showToast('You must be logged in to publish testimony', 'error');
        return;
    }

    // Rate limit
    try {
        const functions = getFunctions(undefined, 'us-central1');
        const checkRateLimitFn = httpsCallable(functions, 'checkRateLimit');
        const rateLimitCheck = await checkRateLimitFn({
            userId: auth.currentUser.uid,
            action: "create_testimony",
            maxCalls: 6,
            windowMinutes: 60
        });
        if (!rateLimitCheck.data) {
            showToast("You've reached your posting limit for now. Please try again later.", "error");
            return;
        }
    } catch (rateError) {
        console.warn("Rate limit check failed, allowing post (fail-open):", rateError);
    }

    postButton.disabled = true;
    postButton.textContent = 'Publishing...';

    try {
        // Single source of truth for all media (image + voice)
        const mediaData = await uploadForensicMedia();

        // If the user selected an image via this composer, make sure it is included
        // (uploadForensicMedia already handles selectedImageFile from media.js)
        // We keep selectedFile only for local preview state.

        if (!text && !mediaData.imageUrl && !mediaData.audioUrl) {
            showToast('Please write something or add media', 'error');
            return;
        }

        const userTier = await getCurrentUserTier();
        const userWitnessLevel = await getCurrentWitnessLevel();

        await addDoc(collection(db, "testimonies"), {
            content: text || "",
            imageUrl: mediaData.imageUrl,
            audioUrl: mediaData.audioUrl,
            forensicHash: mediaData.imageHash || mediaData.audioHash || null,
            imageHash: mediaData.imageHash,
            audioHash: mediaData.audioHash,
            authorId: auth.currentUser.uid,
            authorTier: userTier,
            authorWitnessLevel: userWitnessLevel ? userWitnessLevel.name : null,
            createdAt: serverTimestamp(),
            hasForensic: !!(mediaData.imageHash || mediaData.audioHash)
        });

        showToast('✅ Testimony published to the Public Square!', 'success');

        // Reset
        if (mainInput) mainInput.value = '';
        if (previewArea) {
            previewArea.innerHTML = 'Preview will appear here...';
            previewArea.classList.remove('has-content');
        }
        btnPhoto?.classList.remove('active');
        selectedFile = null;

        resetMediaState();

        window.dispatchEvent(new CustomEvent('vocalWitness:posted'));

    } catch (err) {
        console.error("Publish Error:", err);
        showToast(err.message || 'Failed to publish post. Check connection.', 'error');
    } finally {
        postButton.disabled = false;
        postButton.textContent = 'Publish';
    }
});

window.addEventListener('languageChanged', () => {
    const composerInput = document.getElementById('testimonyInput');
    if (composerInput && window.t) {
        composerInput.placeholder = window.t('placeholder');
    }
});

console.log('%cComposer module loaded (photo + publish only)', 'color:#10b981; font-weight:bold');
