// js/composer.js - Hardened Post & Testimony Composer
import { compressImage } from './media-compression.js';
import { scrubImageMetadata } from './imageScrubber.js';
import { showToast } from './utils.js';
import { getCurrentUserTier, getCurrentWitnessLevel } from './tier.js';
import { db, auth } from './firebase-config.js';
import { collection, addDoc, doc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js";
import { uploadForensicMedia, resetMediaState, handleImageSelect, toggleVoiceRecording } from './media.js';
import { logSecurityAudit } from './audit.js';

// Local IndexedDB storage import
import { saveDraftOffline } from './db.js';

let isSubmitting = false;

/**
 * Initializes listeners for the composer component.
 */
export function initComposer() {
    const fileInput = document.getElementById('media-input') || document.getElementById('photoInput');
    const btnPhoto = document.getElementById('btn-attach-photo') || document.getElementById('btnPhoto');
    const composerForm = document.getElementById('composer-form') || document.getElementById('testimonyForm');

    // Prevent duplicate event listener bindings
    if (btnPhoto && fileInput && !btnPhoto.dataset.listenerAttached) {
        btnPhoto.addEventListener('click', () => fileInput.click());
        btnPhoto.dataset.listenerAttached = 'true';
    }

    if (fileInput && !fileInput.dataset.listenerAttached) {
        fileInput.addEventListener('change', async (e) => {
            const previewArea = document.getElementById('preview-area') || document.getElementById('media-preview');
            
            if (e.target.files && e.target.files[0]) {
                const originalFile = e.target.files[0];
                try {
                    // Scrub EXIF and compress
                    const cleanFile = await stripExifData(originalFile);
                    const compressedFile = await compressImage(cleanFile, { maxWidth: 1200, maxHeight: 1200, quality: 0.8 });
                    
                    // Construct safe synthetic event (won't throw if media.js calls event methods)
                    const syntheticEvent = {
                        target: { files: [compressedFile] },
                        preventDefault: () => {},
                        stopPropagation: () => {}
                    };
                    
                    await handleImageSelect(syntheticEvent, previewArea);
                } catch (err) {
                    console.error('Media processing error:', err);
                    await handleImageSelect(e, previewArea); // Fallback to raw file
                }
            }
        });
        fileInput.dataset.listenerAttached = 'true';
    }

    if (composerForm && !composerForm.dataset.listenerAttached) {
        composerForm.addEventListener('submit', handleComposerSubmit);
        composerForm.dataset.listenerAttached = 'true';
    }
}

/**
 * Handles the submission of Citizen Talk posts or Witness Voice testimonies.
 */
async function handleComposerSubmit(e) {
    e.preventDefault();
    if (isSubmitting) return;

    const user = auth.currentUser;
    if (!user) {
        alert('You must be signed in to submit.');
        return;
    }

    // Dynamic element resolution with fallbacks
    const bodyInput = document.getElementById('postBody') || document.getElementById('testimonyBody');
    const headlineInput = document.getElementById('headlineInput') || document.getElementById('testimonyHeadline');
    const categorySelect = document.getElementById('categorySelect') || document.getElementById('testimonyCategory');
    const fileInput = document.getElementById('media-input') || document.getElementById('photoInput');
    const channelToggle = document.getElementById('channelToggle') || document.getElementById('isWitnessVoice');
    const submitBtn = document.getElementById('submitBtn') || document.querySelector('button[type="submit"]');

    const body = bodyInput ? bodyInput.value.trim() : '';
    const headline = headlineInput ? headlineInput.value.trim() : '';
    const category = categorySelect ? categorySelect.value : 'General';
    const isWitnessVoice = channelToggle ? channelToggle.checked : false;

    if (!body) {
        alert('Please enter your post content.');
        return;
    }

    isSubmitting = true;
    if (submitBtn) submitBtn.disabled = true;

    try {
        const userTier = await getUserTier(user.uid);
        let mediaData = { imageUrl: null, mediaHash: null };

        // Process media upload if selected
        if (fileInput && fileInput.files && fileInput.files[0]) {
            const uploaded = await uploadForensicMedia(fileInput.files[0]);
            // Ensure media values are safe strings/nulls for Firestore serialization
            mediaData = {
                imageUrl: typeof uploaded?.imageUrl === 'string' ? uploaded.imageUrl : null,
                mediaHash: typeof uploaded?.mediaHash === 'string' ? uploaded.mediaHash : null
            };
        }

        // Tier restriction check for Witness Voice feed
        if (isWitnessVoice && userTier.level < 1) {
            // Unverified users save as Cloud Draft
            await addDoc(collection(db, `users/${user.uid}/drafts`), {
                headline: headline || null,
                body: body,
                category: category,
                imageUrl: mediaData.imageUrl,
                mediaHash: mediaData.mediaHash,
                targetChannel: 'witness_voice',
                createdAt: serverTimestamp()
            });

            alert('Your testimony was saved as a draft. Complete verification to publish to Witness Voice.');
            resetForm();
            return;
        }

        // Publish to main public feeds
        const targetCollection = isWitnessVoice ? 'testimonies' : 'posts';
        const payload = {
            authorUid: user.uid,
            authorName: user.displayName || 'Anonymous',
            body: body,
            category: category,
            imageUrl: mediaData.imageUrl,
            mediaHash: mediaData.mediaHash,
            createdAt: serverTimestamp(),
            verifiedTier: userTier.level
        };

        if (isWitnessVoice) {
            payload.headline = headline || 'Untitled Testimony';
        }

        const docRef = await addDoc(collection(db, targetCollection), payload);

        // Audit log trigger
        await logAuditEvent(user.uid, 'POST_CREATED', {
            docId: docRef.id,
            channel: targetCollection
        });

        resetForm();
    } catch (error) {
        console.error('Composer error:', error);
        alert('Failed to submit post. Please try again.');
    } finally {
        isSubmitting = false;
        if (submitBtn) submitBtn.disabled = false;
    }
}

/**
 * Resets composer UI state.
 */
function resetForm() {
    const composerForm = document.getElementById('composer-form') || document.getElementById('testimonyForm');
    const previewArea = document.getElementById('preview-area') || document.getElementById('media-preview');
    const fileInput = document.getElementById('media-input') || document.getElementById('photoInput');

    if (composerForm) composerForm.reset();
    if (fileInput) fileInput.value = '';
    if (previewArea) previewArea.innerHTML = '';
}
