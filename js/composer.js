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
 * Helper to strip EXIF metadata using the imported scrubber or fallback
 */
async function stripExifData(file) {
    if (typeof scrubImageMetadata === 'function') {
        return await scrubImageMetadata(file);
    }
    return file;
}

/**
 * Helper to retrieve user tier safely
 */
async function getUserTier(uid) {
    try {
        if (typeof getCurrentUserTier === 'function') {
            return await getCurrentUserTier(uid);
        }
    } catch (e) {
        console.warn('Failed to fetch tier, falling back to base level:', e);
    }
    return { level: 0 };
}

/**
 * Log audit helper wrapper
 */
async function logAuditEvent(uid, eventType, metadata) {
    if (typeof logSecurityAudit === 'function') {
        await logSecurityAudit(uid, eventType, metadata);
    }
}

/**
 * Initializes listeners for the composer component.
 */
export function initComposer() {
    const fileInput = document.getElementById('media-input') || document.getElementById('photoInput');
    const btnPhoto = document.getElementById('btn-attach-photo') || document.getElementById('btnPhoto') || document.getElementById('btn-photo');
    const postButton = document.getElementById('postButton') || document.getElementById('submitBtn');
    const composerForm = document.getElementById('composer-form') || document.getElementById('testimonyForm');

    // Wire Photo Upload Trigger
    if (btnPhoto && fileInput && !btnPhoto.dataset.listenerAttached) {
        btnPhoto.addEventListener('click', (e) => {
            e.preventDefault();
            fileInput.click();
        });
        btnPhoto.dataset.listenerAttached = 'true';
    }

    // Wire File Change Event
    if (fileInput && !fileInput.dataset.listenerAttached) {
        fileInput.addEventListener('change', async (e) => {
            const previewArea = document.getElementById('preview-area') || document.getElementById('media-preview');
            
            if (e.target.files && e.target.files[0]) {
                const originalFile = e.target.files[0];
                try {
                    // Scrub EXIF and compress
                    const cleanFile = await stripExifData(originalFile);
                    const compressedFile = await compressImage(cleanFile, { maxWidth: 1200, maxHeight: 1200, quality: 0.8 });
                    
                    // Construct safe synthetic event for downstream processor
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

    // Wire Submit Button directly if not inside a formal <form>
    if (postButton && !postButton.dataset.listenerAttached) {
        postButton.addEventListener('click', handleComposerSubmit);
        postButton.dataset.listenerAttached = 'true';
    }

    // Wire Form Submit Event if form exists
    if (composerForm && !composerForm.dataset.listenerAttached) {
        composerForm.addEventListener('submit', handleComposerSubmit);
        composerForm.dataset.listenerAttached = 'true';
    }
}

/**
 * Handles the submission of Citizen Talk posts or Witness Voice testimonies.
 */
async function handleComposerSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (isSubmitting) return;

    const user = auth.currentUser;
    if (!user) {
        if (typeof showToast === 'function') {
            showToast('You must be signed in to submit.', 'error');
        } else {
            alert('You must be signed in to submit.');
        }
        return;
    }

    // Dynamic element resolution with fallbacks for HTML schema
    const bodyInput = document.getElementById('mainInput') || document.getElementById('postBody') || document.getElementById('testimonyBody');
    const headlineInput = document.getElementById('testimonyTitle') || document.getElementById('headlineInput') || document.getElementById('testimonyHeadline');
    const categorySelect = document.getElementById('categorySelect') || document.getElementById('testimonyCategory');
    const fileInput = document.getElementById('media-input') || document.getElementById('photoInput');
    const targetFeedSelect = document.getElementById('targetFeedSelect');
    const channelToggle = document.getElementById('channelToggle') || document.getElementById('isWitnessVoice');
    const submitBtn = document.getElementById('postButton') || document.getElementById('submitBtn') || document.querySelector('button[type="submit"]');

    const body = bodyInput ? bodyInput.value.trim() : '';
    const headline = headlineInput ? headlineInput.value.trim() : '';
    const category = categorySelect ? categorySelect.value : 'General';
    
    // Evaluate if post belongs to Witness Voice
    let isWitnessVoice = false;
    if (targetFeedSelect) {
        isWitnessVoice = targetFeedSelect.value === 'witness_voice';
    } else if (channelToggle) {
        isWitnessVoice = channelToggle.checked;
    }

    if (!headline) {
        if (typeof showToast === 'function') {
            showToast('Please add a heading for your testimony.', 'error');
        } else {
            alert('Please add a heading for your testimony.');
        }
        return;
    }

    if (!body) {
        if (typeof showToast === 'function') {
            showToast('Please enter your post content.', 'error');
        } else {
            alert('Please enter your post content.');
        }
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

            if (typeof showToast === 'function') {
                showToast('Testimony saved as draft. Complete verification to publish.', 'info');
            } else {
                alert('Your testimony was saved as a draft. Complete verification to publish to Witness Voice.');
            }
            resetForm();
            return;
        }

        // Target collection routing
        const targetCollection = isWitnessVoice ? 'testimonies' : 'posts';
        const payload = {
            authorUid: user.uid,
            authorName: user.displayName || 'Anonymous',
            headline: headline || 'Untitled Testimony',
            body: body,
            category: category,
            imageUrl: mediaData.imageUrl,
            mediaHash: mediaData.mediaHash,
            createdAt: serverTimestamp(),
            verifiedTier: userTier.level
        };

        const docRef = await addDoc(collection(db, targetCollection), payload);

        // Audit log trigger
        await logAuditEvent(user.uid, 'POST_CREATED', {
            docId: docRef.id,
            channel: targetCollection
        });

        if (typeof showToast === 'function') {
            showToast('Testimony published successfully!', 'success');
        }

        resetForm();
    } catch (error) {
        console.error('Composer error:', error);
        if (typeof showToast === 'function') {
            showToast('Failed to submit post. Please try again.', 'error');
        } else {
            alert('Failed to submit post. Please try again.');
        }
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
    const headlineInput = document.getElementById('testimonyTitle') || document.getElementById('headlineInput');
    const bodyInput = document.getElementById('mainInput') || document.getElementById('postBody');
    const previewArea = document.getElementById('preview-area') || document.getElementById('media-preview');
    const fileInput = document.getElementById('media-input') || document.getElementById('photoInput');

    if (composerForm) composerForm.reset();
    if (headlineInput) headlineInput.value = '';
    if (bodyInput) bodyInput.value = '';
    if (fileInput) fileInput.value = '';
    
    if (previewArea) {
        previewArea.innerHTML = '<span>Preview will appear here...</span>';
    }

    if (typeof resetMediaState === 'function') {
        resetMediaState();
    }
}
