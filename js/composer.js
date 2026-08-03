// js/composer.js - Testimony Creation, Media Integration & Rate-Limited Publishing
import { compressImage } from './media-compression.js';
import { showToast } from './utils.js';
import { getCurrentUserTier, getCurrentWitnessLevel } from './tier.js';
import { db, auth } from './firebase-config.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js";
import { uploadForensicMedia, resetMediaState, handleImageSelect, toggleVoiceRecording } from './media.js';

// Active state helper
function toggleActive(button) {
    if (!button) return;
    const isVoice = button.id === 'btn-voice';
    const otherBtn = document.getElementById(isVoice ? 'btn-photo' : 'btn-voice');
    
    otherBtn?.classList.remove('active', 'bg-slate-700', 'ring-2', 'ring-emerald-500');
    button.classList.toggle('active');
    button.classList.toggle('bg-slate-700');
    button.classList.toggle('ring-2');
    button.classList.toggle('ring-emerald-500');
}

// Initialize Composer Event Listeners & Ensure Visual Styling
function initComposer() {
    const btnPhoto = document.getElementById('btn-photo');
    const btnVoice = document.getElementById('btn-voice');
    const mainInput = document.getElementById('mainInput') || document.getElementById('testimonyInput');
    const previewArea = document.getElementById('preview-area');
    const postButton = document.getElementById('postButton');

    // --- APPLY FALLBACK STYLING IF COLOR CLASSES ARE MISSING ---
    if (btnPhoto) {
        btnPhoto.classList.add('inline-flex', 'items-center', 'gap-2', 'px-3', 'py-1.5', 'rounded-lg', 'bg-slate-800', 'text-emerald-400', 'border', 'border-slate-700', 'hover:bg-slate-700', 'cursor-pointer', 'transition');
    }
    if (btnVoice) {
        btnVoice.classList.add('inline-flex', 'items-center', 'gap-2', 'px-3', 'py-1.5', 'rounded-lg', 'bg-slate-800', 'text-amber-400', 'border', 'border-slate-700', 'hover:bg-slate-700', 'cursor-pointer', 'transition');
    }
    if (postButton) {
        postButton.classList.add('inline-flex', 'items-center', 'justify-center', 'px-5', 'py-1.5', 'rounded-lg', 'bg-emerald-600', 'hover:bg-emerald-500', 'text-white', 'font-semibold', 'shadow', 'cursor-pointer', 'transition');
    }

    // --- PHOTO SELECTION ---
    if (btnPhoto && !btnPhoto.dataset.listenerAttached) {
        btnPhoto.dataset.listenerAttached = "true";
        btnPhoto.addEventListener('click', (e) => {
            e.preventDefault();
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';

            input.onchange = async (evt) => {
                const file = evt.target.files?.[0];
                if (!file) return;

                try {
                    const compressedFile = await compressImage(file, 1200, 0.82);
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

    // --- VOICE RECORDING ---
    if (btnVoice && !btnVoice.dataset.listenerAttached) {
        btnVoice.dataset.listenerAttached = "true";
        btnVoice.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                if (typeof toggleVoiceRecording === 'function') {
                    await toggleVoiceRecording(btnVoice, previewArea);
                    toggleActive(btnVoice);
                } else {
                    showToast('Voice recording module not available', 'error');
                }
            } catch (err) {
                console.error("Voice recording error:", err);
                showToast('Could not access microphone', 'error');
            }
        });
    }

    // --- PUBLISH ACTION ---
    if (postButton && !postButton.dataset.listenerAttached) {
        postButton.dataset.listenerAttached = "true";
        postButton.addEventListener('click', async (e) => {
            e.preventDefault();
            const text = mainInput?.value ? mainInput.value.trim() : "";

            if (!auth.currentUser) {
                showToast('You must be logged in to publish testimony', 'error');
                return;
            }

            postButton.disabled = true;
            const originalBtnText = postButton.textContent;
            postButton.textContent = 'Publishing...';

            try {
                // Rate limit check via Cloud Function (Fail-open mode)
                try {
                    const functions = getFunctions(undefined, 'us-central1');
                    const checkRateLimitFn = httpsCallable(functions, 'checkRateLimit');
                    const rateLimitCheck = await checkRateLimitFn({
                        userId: auth.currentUser.uid,
                        action: "create_testimony",
                        maxCalls: 6,
                        windowMinutes: 60
                    });

                    const isAllowed = rateLimitCheck.data?.allowed !== undefined ? rateLimitCheck.data.allowed : rateLimitCheck.data;
                    if (!isAllowed) {
                        showToast("You've reached your posting limit for now. Please try again later.", "error");
                        return;
                    }
                } catch (rateError) {
                    console.warn("Rate limit check failed, allowing post (fail-open):", rateError);
                }

                // Upload media
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
                    author: auth.currentUser.displayName || "Anonymous Witness",
                    authorTier: userTier || 'citizen',
                    authorWitnessLevel: userWitnessLevel?.name || null,
                    createdAt: serverTimestamp(),
                    hasForensic: !!(mediaData.imageHash || mediaData.audioHash)
                });

                showToast('✅ Testimony published to the Public Square!', 'success');

                if (mainInput) mainInput.value = '';
                btnPhoto?.classList.remove('active', 'ring-2', 'ring-emerald-500');
                btnVoice?.classList.remove('active', 'ring-2', 'ring-emerald-500');

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
}

// Safely boot after DOM is fully painted
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initComposer);
} else {
    initComposer();
}

// Internationalization listener
window.addEventListener('languageChanged', () => {
    const composerInput = document.getElementById('mainInput') || document.getElementById('testimonyInput');
    if (composerInput && window.t) {
        composerInput.placeholder = window.t('placeholder') || 'What truth will you log today?';
    }
});

console.log('%cComposer module loaded (Photo, Voice & Publish connected)', 'color:#10b981; font-weight:bold');
