// js/composer.js - Hardened Post & Testimony Composer
import { prepareMediaForUpload } from './media-pipeline.js';
import { uploadMedia } from './upload.js'; // or uploadForensicMedia from ./upload.js
import { showToast } from './utils.js';
import { getCurrentUserTier } from './tier.js';
import { db, auth } from './firebase-config.js';
import {
    collection,
    addDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import {
    resetMediaState,
    handleImageSelect
} from './media.js';
import { logSecurityAudit } from './audit.js';
import { prepareAnonymousSubmission } from './onboarding.js';
import { publishTestimonyOrQueue } from './db.js';

let isSubmitting = false;

/**
 * Safely get user tier
 */
async function getUserTier(uid) {
    try {
        if (typeof getCurrentUserTier === 'function') {
            return await getCurrentUserTier(uid);
        }
    } catch (e) {
        console.warn('Failed to fetch tier, falling back to level 0:', e);
    }
    return { level: 0 };
}

/**
 * Audit helper
 */
async function logAuditEvent(uid, eventType, metadata = {}) {
    try {
        if (typeof logSecurityAudit === 'function') {
            await logSecurityAudit(uid, eventType, metadata);
        }
    } catch (err) {
        console.warn('Audit logging failed:', err);
    }
}

/**
 * Initialize composer listeners
 */
export function initComposer() {
    const fileInput = document.getElementById('media-input') || document.getElementById('photoInput');
    const btnPhoto = document.getElementById('btn-attach-photo') ||
                     document.getElementById('btnPhoto') ||
                     document.getElementById('btn-photo');
    const postButton = document.getElementById('postButton') || document.getElementById('submitBtn');
    const composerForm = document.getElementById('composer-form') || document.getElementById('testimonyForm');

    // Photo button → open file picker
    if (btnPhoto && fileInput && !btnPhoto.dataset.listenerAttached) {
        btnPhoto.addEventListener('click', (e) => {
            e.preventDefault();
            fileInput.click();
        });
        btnPhoto.dataset.listenerAttached = 'true';
    }

    // File selected → prepare media (scrub metadata + compress) + show preview
    if (fileInput && !fileInput.dataset.listenerAttached) {
        fileInput.addEventListener('change', async (e) => {
            const previewArea = document.getElementById('preview-area') ||
                                document.getElementById('media-preview');

            if (!e.target.files?.[0]) return;

            const originalFile = e.target.files[0];

            try {
                showToast('Processing image...', 'info');

                // Pipeline handles EXIF scrubbing & compression
                const preparedFile = await prepareMediaForUpload(originalFile);

                // Pass prepared file to preview UI renderer
                const syntheticEvent = {
                    target: { files: [preparedFile] },
                    preventDefault: () => {},
                    stopPropagation: () => {}
                };

                await handleImageSelect(syntheticEvent, previewArea);
                showToast('Image ready', 'success');

            } catch (err) {
                console.error('Media processing error:', err);
                showToast('Image processing failed – using original', 'warning');
                // Fallback to original file
                await handleImageSelect(e, previewArea);
            }
        });

        fileInput.dataset.listenerAttached = 'true';
    }

    // Submit button
    if (postButton && !postButton.dataset.listenerAttached) {
        postButton.addEventListener('click', handleComposerSubmit);
        postButton.dataset.listenerAttached = 'true';
    }

    // Form submit
    if (composerForm && !composerForm.dataset.listenerAttached) {
        composerForm.addEventListener('submit', handleComposerSubmit);
        composerForm.dataset.listenerAttached = 'true';
    }
}

/**
 * Main submit handler
 */
async function handleComposerSubmit(e) {
    if (e?.preventDefault) e.preventDefault();
    if (isSubmitting) return;

    const user = auth.currentUser;
    if (!user) {
        showToast('You must be signed in to submit.', 'error');
        return;
    }

    // Resolve elements with fallbacks
    const bodyInput = document.getElementById('mainInput') ||
                      document.getElementById('postBody') ||
                      document.getElementById('testimonyBody');

    const headlineInput = document.getElementById('testimonyTitle') ||
                          document.getElementById('headlineInput') ||
                          document.getElementById('testimonyHeadline');

    const categorySelect = document.getElementById('categorySelect') ||
                           document.getElementById('testimonyCategory');

    const fileInput = document.getElementById('media-input') ||
                      document.getElementById('photoInput');

    const targetFeedSelect = document.getElementById('targetFeedSelect');
    const channelToggle = document.getElementById('channelToggle') ||
                          document.getElementById('isWitnessVoice');

    const submitBtn = document.getElementById('postButton') ||
                      document.getElementById('submitBtn') ||
                      document.querySelector('button[type="submit"]');

    const anonymousCheckbox = document.getElementById('post-anonymously') ||
                              document.getElementById('isAnonymous');

    const body = bodyInput?.value.trim() || '';
    const headline = headlineInput?.value.trim() || '';
    const category = categorySelect?.value || 'General';
    const anonymous = anonymousCheckbox?.checked === true;

    // Determine target feed
    let targetFeed = 'citizen_talk';
    if (targetFeedSelect) {
        targetFeed = targetFeedSelect.value;
    } else if (channelToggle?.checked) {
        targetFeed = 'witness_voice';
    }

    const isWitnessVoice = targetFeed === 'witness_voice';

    // Validation
    if (!headline) {
        showToast('Please add a heading for your testimony.', 'error');
        return;
    }
    if (!body) {
        showToast('Please enter your post content.', 'error');
        return;
    }

    isSubmitting = true;
    if (submitBtn) submitBtn.disabled = true;

    try {
        const userTier = await getUserTier(user.uid);
        let mediaData = { imageUrl: null, mediaHash: null, forensicHash: null, audioUrl: null, audioHash: null };

        // Upload media if present
        if (fileInput?.files?.[0]) {
            const preparedFile = await prepareMediaForUpload(fileInput.files[0]);
            const uploaded = await uploadMedia(preparedFile);

            mediaData = {
                imageUrl: typeof uploaded === 'string' ? uploaded : (uploaded?.imageUrl || null),
                imageHash: typeof uploaded?.mediaHash === 'string' ? uploaded.mediaHash : null,
                audioUrl: uploaded?.audioUrl || null,
                audioHash: uploaded?.audioHash || null,
                forensicHash: uploaded?.forensicHash || uploaded?.mediaHash || null
            };
        }

        // Unverified users targeting Witness Voice -> Draft flow
        if (isWitnessVoice && userTier.level < 1) {
            await addDoc(collection(db, `users/${user.uid}/drafts`), {
                headline: headline || null,
                body,
                category,
                imageUrl: mediaData.imageUrl,
                imageHash: mediaData.imageHash,
                targetChannel: 'witness_voice',
                isAnonymous: anonymous,
                createdAt: serverTimestamp()
            });

            showToast('Testimony saved as draft. Complete verification to publish.', 'info');
            resetForm();
            return;
        }

        // Prepare submission with anonymous privacy payload split
        const prepared = await prepareAnonymousSubmission(
            {
                content: body,
                headline: headline || null,
                category,
                targetFeed,
                imageUrl: mediaData.imageUrl,
                audioUrl: mediaData.audioUrl,
                imageHash: mediaData.imageHash,
                audioHash: mediaData.audioHash,
                forensicHash: mediaData.forensicHash
            },
            { anonymous }
        );

        // Publish public/private payload structure
        const result = await publishTestimonyOrQueue(prepared);

        await logAuditEvent(user.uid, 'POST_CREATED', {
            docId: result?.id || null,
            channel: targetFeed,
            isAnonymous: anonymous
        });

        showToast('Testimony published successfully!', 'success');
        resetForm();

    } catch (error) {
        console.error('Composer error:', error);
        showToast('Failed to submit post. Please try again.', 'error');
    } finally {
        isSubmitting = false;
        if (submitBtn) submitBtn.disabled = false;
    }
}

/**
 * Reset form UI
 */
function resetForm() {
    const form = document.getElementById('composer-form') || document.getElementById('testimonyForm');
    const headlineInput = document.getElementById('testimonyTitle') || document.getElementById('headlineInput');
    const bodyInput = document.getElementById('mainInput') || document.getElementById('postBody');
    const previewArea = document.getElementById('preview-area') || document.getElementById('media-preview');
    const fileInput = document.getElementById('media-input') || document.getElementById('photoInput');
    const anonymousCheckbox = document.getElementById('post-anonymously') || document.getElementById('isAnonymous');

    if (form) form.reset();
    if (headlineInput) headlineInput.value = '';
    if (bodyInput) bodyInput.value = '';
    if (fileInput) fileInput.value = '';
    if (anonymousCheckbox) anonymousCheckbox.checked = false;

    if (previewArea) {
        previewArea.innerHTML = '<span class="text-zinc-500 text-sm">Preview will appear here...</span>';
    }

    if (typeof resetMediaState === 'function') {
        resetMediaState();
    }
}
