// js/composer.js - Hardened Post & Testimony Composer + Real-time AI Analysis & Video Security
import { uploadMedia } from './upload.js';
import { showToast } from './utils.js';
import { getCurrentUserTier, TIERS, calculateVideoUploadCost } from './tier.js';
import { db, auth } from './firebase-config.js';
import { validateVideoFile } from './video-validator.js';
import { calculateSyntheticScoreFromMetadata, evaluateClientSyntheticAdvisory } from './ai-services.js';
import {
    collection,
    addDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { resetMediaState, handleImageSelect } from './media.js';
import { logSecurityAudit } from './audit.js';
import { prepareAnonymousSubmission } from './onboarding.js';
import { publishTestimonyOrQueue } from './db.js';
import { analyzeReportContent, classifyCategory } from './moderation.js';

let isSubmitting = false;
let aiAnalysisDebounceTimer = null;
let lastAnalyzedText = '';

/**
 * Safely get user tier string
 */
async function getUserTier() {
    try {
        return await getCurrentUserTier();
    } catch (e) {
        console.warn('Failed to fetch tier, falling back to citizen:', e);
        return TIERS.CITIZEN;
    }
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
 * Render Video Policy & Authenticity Guidance Modal
 */
function showVideoPolicyModal(customMessage) {
    let modal = document.getElementById("video-policy-modal");

    if (!modal) {
        modal = document.createElement("div");
        modal.id = "video-policy-modal";
        modal.className = "fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50";
        modal.innerHTML = `
            <div class="bg-slate-900 border border-amber-500/40 rounded-2xl max-w-md w-full p-6 text-slate-100 shadow-2xl">
                <div class="flex items-center space-x-3 mb-4">
                    <div class="p-3 bg-amber-500/10 rounded-full border border-amber-500/30 text-amber-400">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                        </svg>
                    </div>
                    <h3 class="text-xl font-bold tracking-tight">Authenticity Requirement</h3>
                </div>

                <p id="video-policy-msg" class="text-slate-300 text-sm leading-relaxed mb-4"></p>

                <div class="bg-slate-800 border border-slate-700/60 rounded-xl p-3 mb-5 space-y-2 text-xs text-slate-400">
                    <div class="flex justify-between">
                        <span>Daily Upload Quota:</span>
                        <span class="font-mono text-amber-400 font-semibold">Max 2 Videos / Day</span>
                    </div>
                    <div class="flex justify-between">
                        <span>Max Size per Clip:</span>
                        <span class="font-mono text-amber-400 font-semibold">25 MB (Raw Clip)</span>
                    </div>
                    <div class="flex justify-between">
                        <span>AI / Deepfake Policy:</span>
                        <span class="text-red-400 font-medium">Strictly Banned (C2PA Enforced)</span>
                    </div>
                </div>
                <div class="space-y-3">
                    <button id="btn-modal-live-arena" class="w-full py-3 px-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 text-slate-950 font-bold rounded-xl shadow-lg transition flex items-center justify-center space-x-2">
                        <span>Go to Live Arena for True Reality</span>
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
                    </button>
                    <button id="btn-modal-cancel" class="w-full py-2.5 px-4 bg-slate-800 text-slate-300 text-xs font-semibold rounded-xl transition border border-slate-700 hover:bg-slate-700">
                        I understand, cancel video upload
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Use event delegation for modal buttons (safe even if recreated)
        modal.addEventListener('click', (e) => {
            const liveBtn = e.target.closest('#btn-modal-live-arena');
            const cancelBtn = e.target.closest('#btn-modal-cancel');
            if (liveBtn) {
                window.location.href = "live-arena.html";
            } else if (cancelBtn) {
                modal.classList.add("hidden");
            }
        });
    }

    const msgElement = document.getElementById("video-policy-msg");
    if (msgElement) msgElement.innerText = customMessage || '';
    modal.classList.remove("hidden");
}

/**
 * Handles bandwidth/overage payment prompts for large video uploads
 */
async function triggerOveragePaymentModal(feeUSD, reason) {
    return new Promise((resolve) => {
        const userChoice = confirm(
            `Bandwidth / Infrastructure Fee Notice:\n\n${reason}\n\n` +
            `Fee: $${feeUSD.toFixed(2)} USD (Payable via Paystack or USDT).\n\n` +
            `Would you like to proceed to payment to finalize this upload?`
        );

        if (userChoice) {
            const supportModal = document.getElementById('support-modal') || document.getElementById('paymentModal');
            if (supportModal) {
                supportModal.classList.remove('hidden');
            } else {
                showToast(`Please complete payment of $${feeUSD.toFixed(2)} USD via the Support Modal to proceed.`, 'info');
            }
            resolve(true);
        } else {
            resolve(false);
        }
    });
}

// Isolated Media State Variables (Only one should be active at a time)
let activeImageFile = null;
let activeVideoFile = null;
let activeAudioFile = null;

/**
 * Renders or reveals the mandatory Media Origin Claim dropdown
 */
function renderMediaOriginClaimUI() {
    let container = document.getElementById('media-claim-container');

    if (!container) {
        container = document.createElement('div');
        container.id = 'media-claim-container';
        container.className = 'mt-3 p-3 rounded-xl border border-zinc-700/60 bg-zinc-900/80 text-zinc-300 text-xs transition-all duration-300';
        container.innerHTML = `
            <div class="flex items-center gap-1.5 font-semibold text-emerald-400 mb-1">
                🛡️ Mandatory Media Origin Claim (C2PA Aligned)
            </div>
            <select id="mediaOriginClaim" class="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-emerald-500">
                <option value="filmed_by_me">Direct Capture (Filmed / Recorded by me)</option>
                <option value="received">Received / Forwarded (From messaging / web)</option>
                <option value="unknown">Unknown Source / Unverified</option>
                <option value="synthetic">AI Assisted / Generated Media</option>
            </select>
            <p class="text-[10px] text-zinc-400 mt-1.5 leading-tight">
                Accurate origin claims preserve cryptographic trust scores. False claims route posts to steward review. Aligns with C2PA Content Credentials principles.
            </p>
        `;

        const fileInput = document.getElementById('media-input') ||
                          document.getElementById('photoInput') ||
                          document.getElementById('media-file-input') ||
                          document.getElementById('mediaFileInput');
        if (fileInput && fileInput.parentNode) {
            fileInput.parentNode.insertBefore(container, fileInput.nextSibling);
        }
    }

    container.classList.remove('hidden');
}

/**
 * Hides and resets the Media Origin Claim UI
 */
function clearMediaOriginClaimUI() {
    const container = document.getElementById('media-claim-container');
    if (container) {
        container.classList.add('hidden');
        const select = document.getElementById('mediaOriginClaim');
        if (select) select.value = 'filmed_by_me';
    }
}

/**
 * Utility to extract the selected origin claim value safely
 */
function getSelectedMediaOriginClaim() {
    const claimSelect = document.getElementById('mediaOriginClaim');
    return claimSelect ? claimSelect.value : 'unknown';
}

/**
 * Renders or updates a live quota and provenance badge under the media picker
 */
function renderMediaTrustBadge(costInfo, file, validationResult) {
    let container = document.getElementById('media-quota-badge');

    if (!container) {
        container = document.createElement('div');
        container.id = 'media-quota-badge';
        container.className = 'mt-2 p-3 rounded-xl border text-xs transition-all duration-300';

        const fileInput = document.getElementById('media-input') ||
                          document.getElementById('photoInput') ||
                          document.getElementById('media-file-input') ||
                          document.getElementById('mediaFileInput');
        if (fileInput && fileInput.parentNode) {
            fileInput.parentNode.insertBefore(container, fileInput.nextSibling);
        }
    }

    if (!file || (!costInfo && !validationResult)) {
        container.classList.add('hidden');
        return;
    }

    const fileMB = (file.size / (1024 * 1024)).toFixed(1);

    if (costInfo?.blocked) {
        container.className = 'mt-2 p-3 rounded-xl border border-red-500/40 bg-red-950/20 text-red-300 text-xs';
        container.innerHTML = `
            <div class="flex items-center justify-between">
                <span class="font-semibold text-red-400">⚠️ Upload Limit Exceeded</span>
                <span class="font-mono text-[11px]">${fileMB} MB</span>
            </div>
            <p class="mt-1 text-slate-300">${costInfo.reason || ''}</p>
        `;
    } else if (validationResult?.provenance === 'c2pa_sealed') {
        container.className = 'mt-2 p-3 rounded-xl border border-emerald-500/40 bg-emerald-950/20 text-emerald-300 text-xs';
        container.innerHTML = `
            <div class="flex items-center justify-between">
                <span class="font-semibold text-emerald-400">✓ C2PA Cryptographically Verified</span>
                <span class="font-mono text-[11px]">${fileMB} MB</span>
            </div>
            <p class="mt-1 text-emerald-200/80">Valid hardware or software signature confirmed intact (Content Credentials).</p>
        `;
    } else if (validationResult?.editorDetected) {
        const sigs = validationResult.detectedSignatures?.join(', ') || 'NLE detected';
        container.className = 'mt-2 p-3 rounded-xl border border-amber-500/40 bg-amber-950/20 text-amber-300 text-xs';
        container.innerHTML = `
            <div class="flex items-center justify-between">
                <span class="font-semibold text-amber-400">⚠️ Edited Stream Detected</span>
                <span class="font-mono text-[11px]">${fileMB} MB</span>
            </div>
            <p class="mt-1 text-slate-300">Signatures found: ${sigs}. Flagged for review.</p>
        `;
    } else {
        container.className = 'mt-2 p-3 rounded-xl border border-zinc-700 bg-zinc-900/80 text-zinc-300 text-xs';
        container.innerHTML = `
            <div class="flex items-center justify-between">
                <span class="font-semibold text-zinc-200">📁 Media Ready</span>
                <span class="font-mono text-[11px]">${fileMB} MB</span>
            </div>
            <p class="mt-1 text-zinc-400">Standard file verification completed. Consider C2PA signing for stronger provenance.</p>
        `;
    }

    container.classList.remove('hidden');
}

function clearMediaQuotaBadge() {
    const container = document.getElementById('media-quota-badge');
    if (container) {
        container.classList.add('hidden');
        container.innerHTML = '';
    }
}

function clearAiFeedback() {
    const box = document.getElementById('composer-ai-feedback');
    if (box) {
        box.classList.add('hidden');
        box.innerHTML = '';
    }
}

/**
 * Type-neutral preview renderer for images, videos, and audio clips
 * Includes proper object URL cleanup to prevent memory leaks
 */
function renderGenericMediaPreview(file, previewArea) {
    if (!previewArea) return;

    // Revoke previous object URL if it exists
    if (previewArea.dataset.objectUrl) {
        URL.revokeObjectURL(previewArea.dataset.objectUrl);
        delete previewArea.dataset.objectUrl;
    }

    previewArea.innerHTML = '';

    const objectUrl = URL.createObjectURL(file);
    previewArea.dataset.objectUrl = objectUrl;

    let previewElement;

    if (file.type.startsWith('image/')) {
        previewElement = document.createElement('img');
        previewElement.src = objectUrl;
        previewElement.className = 'max-h-48 rounded-xl object-cover border border-zinc-700 mx-auto';
        previewElement.alt = 'Media preview';
    } else if (file.type.startsWith('video/')) {
        previewElement = document.createElement('video');
        previewElement.src = objectUrl;
        previewElement.controls = true;
        previewElement.preload = 'metadata';
        previewElement.className = 'max-h-48 rounded-xl w-full object-cover border border-zinc-700';
    } else if (file.type.startsWith('audio/')) {
        previewElement = document.createElement('audio');
        previewElement.src = objectUrl;
        previewElement.controls = true;
        previewElement.preload = 'metadata';
        previewElement.className = 'w-full mt-2';
    } else {
        previewElement = document.createElement('div');
        previewElement.className = 'text-xs text-zinc-400 p-2';
        previewElement.innerText = `File attached: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`;
    }

    previewArea.appendChild(previewElement);
}

/**
 * Helper to fully reset all media states and UI
 */
function clearAllMediaStates() {
    activeImageFile = null;
    activeVideoFile = null;
    activeAudioFile = null;

    // Clear the respective file inputs
    ['media-input', 'photoInput', 'videoInput', 'audioInput', 'media-file-input', 'mediaFileInput'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    // Clean up preview area + object URL
    const previewArea = document.getElementById('preview-area') || document.getElementById('media-preview');
    if (previewArea) {
        if (previewArea.dataset.objectUrl) {
            URL.revokeObjectURL(previewArea.dataset.objectUrl);
            delete previewArea.dataset.objectUrl;
        }
        previewArea.innerHTML = '<span class="text-zinc-500 text-sm">Preview will appear here...</span>';
    }

    clearMediaQuotaBadge();
    clearMediaOriginClaimUI();

    if (typeof resetMediaState === 'function') {
        resetMediaState();
    }
}

// ======================================================
// UPDATED: Distinct Media Handlers (Safe Version)
// ======================================================

/**
 * Distinct handler for Image/Photo Selection
 */
export async function handleImageSelectAction(event) {
    const previewArea = document.getElementById('preview-area') || document.getElementById('media-preview');
    const file = event.target?.files?.[0];

    if (!file) return;

    // Enforce exclusivity
    clearAllMediaStates();
    activeImageFile = file;

    renderMediaTrustBadge(null, activeImageFile, { provenance: 'standard_image' });

    try {
        showToast('Processing photo payload...', 'info');

        // Safe neutral preview
        renderGenericMediaPreview(file, previewArea);

        // Keep existing image-specific processing if still needed
        if (typeof handleImageSelect === 'function') {
            await handleImageSelect(event, previewArea);
        }

        renderMediaOriginClaimUI();
        showToast('Photo ready for submission', 'success');
    } catch (err) {
        console.error('Image processing error:', err);
        showToast('Photo processing failed', 'error');
        activeImageFile = null;
    }
}

/**
 * Distinct handler for Video Selection
 */
export async function handleVideoSelectAction(event) {
    const previewArea = document.getElementById('preview-area') || document.getElementById('media-preview');
    const file = event.target?.files?.[0];

    if (!file) return;

    // Enforce exclusivity
    clearAllMediaStates();

    showToast('Validating video authenticity & size rules...', 'info');
    const validationResult = await validateVideoFile(file);

    if (!validationResult.valid) {
        event.target.value = '';
        showVideoPolicyModal(validationResult.message);
        return;
    }

    const costInfo = await calculateVideoUploadCost(file);
    renderMediaTrustBadge(costInfo, file, validationResult);

    if (costInfo.blocked) {
        showToast(costInfo.reason, 'error');
        event.target.value = '';
        clearMediaQuotaBadge();
        return;
    }

    if (!costInfo.isFree) {
        const paidOrAgreed = await triggerOveragePaymentModal(costInfo.feeUSD, costInfo.reason);
        if (!paidOrAgreed) {
            showToast('Video upload canceled.', 'warning');
            event.target.value = '';
            clearMediaQuotaBadge();
            return;
        }
    }

    // Assign to isolated video state
    activeVideoFile = file;

    try {
        // Safe neutral preview – NEVER call handleImageSelect here
        renderGenericMediaPreview(file, previewArea);
        renderMediaOriginClaimUI();

        window.activeSubmissionDraft = window.activeSubmissionDraft || {};
        window.activeSubmissionDraft.mediaMetadata = {
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type,
            duration: validationResult.duration || 0,
            provenance: validationResult.provenance,
            editorDetected: validationResult.editorDetected,
            detectedSignatures: validationResult.detectedSignatures
        };

        showToast('Video ready for submission', 'success');
    } catch (err) {
        console.error('Video preview error:', err);
        showToast('Video preview failed', 'error');
        activeVideoFile = null;
    }
}

/**
 * Distinct handler for Audio Selection
 */
export async function handleAudioSelectAction(event) {
    const previewArea = document.getElementById('preview-area') || document.getElementById('media-preview');
    const file = event.target?.files?.[0];

    if (!file) return;

    // Enforce exclusivity
    clearAllMediaStates();
    activeAudioFile = file;

    renderMediaTrustBadge(null, activeAudioFile, { provenance: 'audio_recording' });

    try {
        showToast('Processing audio payload...', 'info');

        // Safe neutral preview – NEVER call handleImageSelect here
        renderGenericMediaPreview(file, previewArea);
        renderMediaOriginClaimUI();

        showToast('Audio ready for submission', 'success');
    } catch (err) {
        console.error('Audio processing error:', err);
        showToast('Audio processing failed', 'error');
        activeAudioFile = null;
    }
}

/**
 * Initialize composer using Event Delegation on a stable root.
 * Hardened with null checks + isolated multi-media bindings.
 */
export function initComposer() {
    // Find the most stable root for the composer UI
    const root = document.getElementById('composer-form') ||
                 document.getElementById('testimonyForm') ||
                 document.getElementById('composer-root') ||
                 document.querySelector('.composer-container') ||
                 document.body;

    // Prevent multiple initializations
    if (root.dataset.composerInitialized === 'true') {
        console.log('[composer] Already initialized – skipping');
        return;
    }
    root.dataset.composerInitialized = 'true';

    // ===== EVENT DELEGATION: One listener for clicks =====
    root.addEventListener('click', (e) => {
        // Photo / Media attach button
        const btnPhoto = e.target.closest('#btn-attach-photo, #btnPhoto, #btn-photo, [data-action="attach-photo"]');
        if (btnPhoto) {
            e.preventDefault();
            e.stopPropagation();
            const fileInput = document.getElementById('media-input') ||
                              document.getElementById('photoInput') ||
                              document.getElementById('media-file-input') ||
                              document.getElementById('mediaFileInput');
            if (fileInput) fileInput.click();
            return;
        }

        // Post / Submit button
        const postButton = e.target.closest('#postButton, #submitBtn, button[type="submit"]');
        if (postButton && (postButton.id === 'postButton' || postButton.id === 'submitBtn' || postButton.type === 'submit')) {
            handleComposerSubmit(e);
            return;
        }
    });

    // ===== SEPARATE MEDIA INPUT BINDINGS (Enforcing Isolation) =====
    
    // 1. Photo / Standard Media Input
    const photoInput = document.getElementById('media-input') ||
                       document.getElementById('photoInput') ||
                       document.getElementById('media-file-input') ||
                       document.getElementById('mediaFileInput');
    if (photoInput && !photoInput.dataset.listenerAttached) {
        photoInput.dataset.listenerAttached = 'true';
        photoInput.addEventListener('change', handleImageSelectAction);
    }

    // 2. Video Input
    const videoInput = document.getElementById('videoInput') || document.getElementById('video-input');
    if (videoInput && !videoInput.dataset.listenerAttached) {
        videoInput.dataset.listenerAttached = 'true';
        videoInput.addEventListener('change', handleVideoSelectAction);
    }

    // 3. Audio Input
    const audioInput = document.getElementById('audioInput') || document.getElementById('audio-input');
    if (audioInput && !audioInput.dataset.listenerAttached) {
        audioInput.dataset.listenerAttached = 'true';
        audioInput.addEventListener('change', handleAudioSelectAction);
    }

    // ===== Real-time AI analysis (input events) =====
    const bodyInput = document.getElementById('mainInput') ||
                      document.getElementById('postBody') ||
                      document.getElementById('testimonyBody') ||
                      document.querySelector('textarea');

    if (bodyInput && !bodyInput.dataset.aiListenerAttached) {
        bodyInput.dataset.aiListenerAttached = 'true';
        bodyInput.addEventListener('input', (e) => {
            const text = e.target.value.trim();
            if (text.length < 25) {
                clearTimeout(aiAnalysisDebounceTimer);
                clearAiFeedback();
                lastAnalyzedText = '';
                return;
            }

            clearTimeout(aiAnalysisDebounceTimer);
            aiAnalysisDebounceTimer = setTimeout(async () => {
                if (text === lastAnalyzedText) return;
                lastAnalyzedText = text;
                if (bodyInput.value.trim().length >= 25) {
                    await runRealtimeAiAnalysis(text);
                }
            }, 800);
        });
    }

    // ===== Form submit (backup + primary for keyboard enter) =====
    const composerForm = document.getElementById('composer-form') || document.getElementById('testimonyForm');
    if (composerForm && !composerForm.dataset.listenerAttached) {
        composerForm.dataset.listenerAttached = 'true';
        composerForm.addEventListener('submit', handleComposerSubmit);
    }

    console.log('✅ Testimony composer wired with isolated multi-media pathways');
}

/**
 * Executes background AI analysis on composer text input
 */
async function runRealtimeAiAnalysis(text) {
    const feedbackBox = ensureAiFeedbackContainer();

    try {
        feedbackBox.innerHTML = `
            <div class="flex items-center gap-2 text-xs text-zinc-400">
                <span class="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                Analyzing content with AI...
            </div>`;
        feedbackBox.classList.remove('hidden');

        const [analysis, category] = await Promise.all([
            analyzeReportContent(text),
            classifyCategory(text)
        ]);

        const categorySelect = document.getElementById('categorySelect') ||
                                document.getElementById('testimonyCategory');

        if (categorySelect && (categorySelect.value === 'General' || !categorySelect.value)) {
            const matchOption = Array.from(categorySelect.options).find(
                opt => opt.value.toLowerCase() === category.toLowerCase() ||
                       opt.text.toLowerCase().includes(category.toLowerCase())
            );
            if (matchOption) {
                categorySelect.value = matchOption.value;
            }
        }

        const channelToggle = document.getElementById('channelToggle') ||
                            document.getElementById('isWitnessVoice');
        const targetFeedSelect = document.getElementById('targetFeedSelect');

        if (analysis?.severity === 'High' || analysis?.urgency === 'High') {
            if (targetFeedSelect) targetFeedSelect.value = 'witness_voice';
            if (channelToggle) channelToggle.checked = true;
        }

        renderAiFeedback(feedbackBox, analysis, category);
    } catch (err) {
        console.warn("Real-time AI analysis failed:", err);
        clearAiFeedback();
    }
}

function ensureAiFeedbackContainer() {
    let box = document.getElementById('composer-ai-feedback');
    if (!box) {
        box = document.createElement('div');
        box.id = 'composer-ai-feedback';
        box.className = 'mt-3 p-3 rounded-xl border text-xs transition-all duration-300 hidden';

        const bodyInput = document.getElementById('mainInput') ||
                          document.getElementById('postBody') ||
                          document.getElementById('testimonyBody');

        if (bodyInput && bodyInput.parentNode) {
            bodyInput.parentNode.insertBefore(box, bodyInput.nextSibling);
        }
    }
    return box;
}

function renderAiFeedback(container, analysis, category) {
    if (!analysis) {
        container.classList.add('hidden');
        return;
    }

    const isFlagged = analysis.isToxic || analysis.flagged;

    if (isFlagged) {
        container.className = 'mt-3 p-3 rounded-xl border border-red-500/30 bg-red-950/20 text-red-300 text-xs';
        container.innerHTML = `
            <div class="flex items-center gap-2 font-semibold text-red-400 mb-1">
                ⚠️ Content Flagged
            </div>
            <p>${analysis.reason || 'This post contains terms that may violate community safety standards.'}</p>
        `;
    } else {
        container.className = 'mt-3 p-3 rounded-xl border border-emerald-500/30 bg-emerald-950/20 text-emerald-300 text-xs';
        container.innerHTML = `
            <div class="flex items-center justify-between flex-wrap gap-2">
                <span class="flex items-center gap-1.5 font-medium">
                    🤖 Auto-Classified: <strong class="text-white">${category || 'General'}</strong>
                </span>
                <span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30">
                    Urgency: ${analysis.urgency || 'Normal'}
                </span>
            </div>
            ${analysis.summary ? `<p class="mt-1 text-zinc-400 text-[11px]">${analysis.summary}</p>` : ''}
        `;
    }
    container.classList.remove('hidden');
}

/**
 * Main submit handler – prefers window.publishTestimony() when available
 */
async function handleComposerSubmit(e) {
    if (e?.preventDefault) e.preventDefault();
    if (e?.stopImmediatePropagation) e.stopImmediatePropagation();

    if (isSubmitting) {
        console.warn('[composer] Already submitting – ignored');
        return;
    }

    if (typeof window.publishTestimony === 'function') {
        console.log('[composer] Using existing window.publishTestimony()');

        isSubmitting = true;
        const submitBtn = document.getElementById('postButton') ||
                          document.getElementById('submitBtn') ||
                          document.querySelector('button[type="submit"]');

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
        }

        try {
            // Optionally enrich draft with origin claim before publish
            window.activeSubmissionDraft = window.activeSubmissionDraft || {};
            window.activeSubmissionDraft.mediaOriginClaim = getSelectedMediaOriginClaim();

            await window.publishTestimony();
        } catch (err) {
            console.error('[composer] publishTestimony failed:', err);
            showToast('Failed to publish. Please try again.', 'error');
        } finally {
            isSubmitting = false;
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            }
        }
        return;
    }

    console.error('[composer] window.publishTestimony is not available');
    showToast('Publish system not ready. Please refresh the page.', 'error');
}

// ======================================================
// UPDATED: resetForm with full media cleanup
// ======================================================
/**
 * Reset form UI
 */
export function resetForm() {
    const form = document.getElementById('composer-form') || document.getElementById('testimonyForm');
    const headlineInput = document.getElementById('headlineInput') ||
                          document.getElementById('testimonyHeadline') ||
                          document.getElementById('testimonyTitle') ||
                          document.getElementById('postHeadline');
    const bodyInput = document.getElementById('mainInput') || document.getElementById('postBody') || document.getElementById('testimonyBody');
    const anonymousCheckbox = document.getElementById('post-anonymously') || document.getElementById('isAnonymous');

    if (form) form.reset();
    if (headlineInput) headlineInput.value = '';
    if (bodyInput) bodyInput.value = '';
    if (anonymousCheckbox) anonymousCheckbox.checked = false;

    // Full media cleanup (variables + preview + object URLs + badges)
    clearAllMediaStates();

    window.activeSubmissionDraft = {};
    clearAiFeedback();
    lastAnalyzedText = '';
}
