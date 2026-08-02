// js/composer.js - Testimony Creation, Media Integration & Rate-Limited Publishing
import { compressImage } from './media-compression.js';
import { showToast } from './utils.js';
import { getCurrentUserTier, getCurrentWitnessLevel } from './tier.js';
import { db, auth } from './firebase-config.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js";
import { uploadForensicMedia, resetMediaState, handleImageSelect } from './media.js';

const btnPhoto = document.getElementById('btn-photo');
const mainInput = document.getElementById('mainInput');
const previewArea = document.getElementById('preview-area');
const postButton = document.getElementById('postButton');

// ==================== ACTIVE STATE ====================
function toggleActive(button) {
    document.getElementById('btn-voice')?.classList.remove('active');
    button?.classList.toggle('active');
}

// ==================== PHOTO SELECTION ====================
if (btnPhoto && !btnPhoto.dataset.listenerAttached) {
    btnPhoto.dataset.listenerAttached = "true";
    btnPhoto.addEventListener('click', async () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';

        input.onchange = async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            try {
                const compressedFile = await compressImage(file, 1200, 0.82);
                
                // Pass the compressed file through handleImageSelect so media.js updates selectedImageFile
                const syntheticEvent = { target: { files: [compressedFile] } };
                await handleImageSelect(syntheticEvent, previewArea);
                
                toggleActive(btnPhoto);
            } catch (err) {
                console.error("Image compression error:", err);
                showToast('Failed to compress image', 'error');
            }
        };
        input.click();
    });
}

// ==================== PUBLISH ACTION ====================
if (postButton && !postButton.dataset.listenerAttached) {
    postButton.dataset.listenerAttached = "true";
    postButton.addEventListener('click', async () => {
        const text = mainInput?.value ? mainInput.value.trim() : "";

        if (!auth.currentUser) {
            showToast('You must be logged in to publish testimony', 'error');
            return;
        }

        postButton.disabled = true;
        const originalBtnText = postButton.textContent;
        postButton.textContent = 'Publishing...';

        try {
            // Rate limit check via Cloud Function
            try {
                const functions = getFunctions(undefined, 'us-central1');
                const checkRateLimitFn = httpsCallable(functions, 'checkRateLimit');
                const rateLimitCheck = await checkRateLimitFn({
                    userId: auth.currentUser.uid,
                    action: "create_testimony",
                    maxCalls: 6,
                    windowMinutes: 60
                });

                // Support both boolean returns and object payload responses ({ data: { allowed: true } })
                const isAllowed = rateLimitCheck.data?.allowed !== undefined ? rateLimitCheck.data.allowed : rateLimitCheck.data;
                if (!isAllowed) {
                    showToast("You've reached your posting limit for now. Please try again later.", "error");
                    return;
                }
            } catch (rateError) {
                console.warn("Rate limit check failed, allowing post (fail-open):", rateError);
            }

            // Single source of truth for all media (image + voice)
            const mediaData = (await uploadForensicMedia()) || {};

            if (!text && !mediaData.imageUrl && !mediaData.audioUrl) {
                showToast('Please write something or add media', 'error');
                return;
            }

            const userTier = await getCurrentUserTier();
            const userWitnessLevel = await getCurrentWitnessLevel();

            await addDoc(collection(db, "testimonies"), {
                content: text || "",
                imageUrl: mediaData.imageUrl || null,
                audioUrl: mediaData.audioUrl || null,
                forensicHash: mediaData.imageHash || mediaData.audioHash || null,
                imageHash: mediaData.imageHash || null,
                audioHash: mediaData.audioHash || null,
                authorId: auth.currentUser.uid,
                author: auth.currentUser.displayName || null,
                authorTier: userTier || 'citizen',
                authorWitnessLevel: userWitnessLevel ? userWitnessLevel.name : null,
                createdAt: serverTimestamp(),
                hasForensic: !!(mediaData.imageHash || mediaData.audioHash)
            });

            showToast('✅ Testimony published to the Public Square!', 'success');

            // Reset composer UI and media state
            if (mainInput) mainInput.value = '';
            btnPhoto?.classList.remove('active');

            resetMediaState();

            window.dispatchEvent(new CustomEvent('vocalWitness:posted'));

        } catch (err) {
            console.error("Publish Error:", err);
            showToast(err.message || 'Failed to publish post. Check connection.', 'error');
        } finally {
            postButton.disabled = false;
            postButton.textContent = originalBtnText || 'Publish';
        }
    });
}

// ==================== INTERNATIONALIZATION LISTENER ====================
window.addEventListener('languageChanged', () => {
    const composerInput = document.getElementById('mainInput') || document.getElementById('testimonyInput');
    if (composerInput && window.t) {
        composerInput.placeholder = window.t('placeholder') || 'What truth will you log today?';
    }
});

console.log('%cComposer module loaded (photo + publish connected)', 'color:#10b981; font-weight:bold');
