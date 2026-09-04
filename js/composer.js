// js/composer.js - Hardened Post & Testimony Composer + Real-time AI Analysis & Video Security

import { prepareMediaForUpload } from './media-pipeline.js';
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

        document.getElementById("btn-modal-live-arena")?.addEventListener("click", () => {
            window.location.href = "live-arena.html";
        });
        document.getElementById("btn-modal-cancel")?.addEventListener("click", () => {
            modal.classList.add("hidden");
        });
    }

    const msgElement = document.getElementById("video-policy-msg");
    if (msgElement) msgElement.innerText = customMessage;
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
                🛡️ Mandatory Media Origin Claim
            </div>
            <select id="mediaOriginClaim" class="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-emerald-500">
                <option value="filmed_by_me">Direct Capture (Filmed / Recorded by me)</option>
                <option value="received">Received / Forwarded (From messaging / web)</option>
                <option value="unknown">Unknown Source / Unverified</option>
                <option value="synthetic">AI Assisted / Generated Media</option>
            </select>
            <p class="text-[10px] text-zinc-400 mt-1.5 leading-tight">
                Accurate origin claims preserve cryptographic trust scores. False claims route posts to steward review.
            </p>
        `;

        const fileInput = document.getElementById('media-input') || document.getElementById('photoInput') || document.getElementById('media-file-input');
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

        const fileInput = document.getElementById('media-input') || document.getElementById('photoInput') || document.getElementById('media-file-input');
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
            <p class="mt-1 text-slate-300">${costInfo.reason}</p>
        `;
    } else if (validationResult?.provenance === 'c2pa_sealed') {
        container.className = 'mt-2 p-3 rounded-xl border border-emerald-500/40 bg-emerald-950/20 text-emerald-300 text-xs';
        container.innerHTML = `
            <div class="flex items-center justify-between">
                <span class="font-semibold text-emerald-400">✓ C2PA Cryptographically Verified</span>
                <span class="font-mono text-[11px]">${fileMB} MB</span>
            </div>
            <p class="mt-1 text-emerald-200/80">Valid hardware or software signature confirmed intact.</p>
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
            <p class="mt-1 text-zinc-400">Standard file verification completed.</p>
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
 * Handle input selection for both video pre-flight validation and image scrubbing
 */
export async function handleMediaSelect(event) {
    const previewArea = document.getElementById('preview-area') ||
                        document.getElementById('media-preview') ||
                        document.getElementById('media-provenance-badge');

    if (!event.target?.files?.[0]) {
        clearMediaQuotaBadge();
        clearMediaOriginClaimUI();
        return;
    }

    const originalFile = event.target.files[0];
    let validationResult = null;

    // 1. Video Pre-Flight Validation & Pricing Check
    if (originalFile.type.startsWith("video/")) {
        showToast('Validating video authenticity & size rules...', 'info');

        validationResult = await validateVideoFile(originalFile);
        if (!validationResult.valid) {
            event.target.value = "";
            clearMediaQuotaBadge();
            clearMediaOriginClaimUI();
            showVideoPolicyModal(validationResult.message);
            return;
        }

        const costInfo = await calculateVideoUploadCost(originalFile);
        renderMediaTrustBadge(costInfo, originalFile, validationResult);

        if (costInfo.blocked) {
            showToast(costInfo.reason, 'error');
            event.target.value = "";
            clearMediaQuotaBadge();
            clearMediaOriginClaimUI();
            return;
        }

        if (!costInfo.isFree) {
            const paidOrAgreed = await triggerOveragePaymentModal(costInfo.feeUSD, costInfo.reason);
            if (!paidOrAgreed) {
                showToast('Video upload canceled.', 'warning');
                event.target.value = "";
                clearMediaQuotaBadge();
                clearMediaOriginClaimUI();
                return;
            }
        }
    } else {
        renderMediaTrustBadge(null, originalFile, { provenance: 'standard_image' });
    }

    // 2. Image/Media Processing & Pipeline
    try {
        showToast('Processing media payload...', 'info');
        const preparedFile = await prepareMediaForUpload(originalFile);

        const syntheticEvent = {
            target: { files: [preparedFile] },
            preventDefault: () => {},
            stopPropagation: () => {}
        };

        await handleImageSelect(syntheticEvent, previewArea);
        renderMediaOriginClaimUI();
        
        // Save validator metadata upstream if available
        if (validationResult) {
            window.activeSubmissionDraft = window.activeSubmissionDraft || {};
            window.activeSubmissionDraft.mediaMetadata = {
                fileName: originalFile.name,
                fileSize: originalFile.size,
                mimeType: originalFile.type,
                duration: validationResult.duration || 0,
                provenance: validationResult.provenance,
                editorDetected: validationResult.editorDetected,
                detectedSignatures: validationResult.detectedSignatures
            };
        }

        showToast('Media ready for submission', 'success');
    } catch (err) {
        console.error('Media processing error:', err);
        showToast('Media processing failed – using original clip', 'warning');
        await handleImageSelect(event, previewArea);
        renderMediaOriginClaimUI();
    }
}

/**
 * Initialize composer listeners and real-time AI analysis
 */
/**
 * Initialize composer listeners and real-time AI analysis
 */
export function initComposer() {
    const fileInput = document.getElementById('media-input') ||
                      document.getElementById('photoInput') ||
                      document.getElementById('media-file-input');

    const btnPhoto = document.getElementById('btn-attach-photo') ||
                       document.getElementById('btnPhoto') ||
                       document.getElementById('btn-photo');

    const postButton = document.getElementById('postButton') ||
                        document.getElementById('submitBtn');

    const composerForm = document.getElementById('composer-form') ||
                          document.getElementById('testimonyForm');

    const bodyInput = document.getElementById('mainInput') ||
                      document.getElementById('postBody') ||
                      document.getElementById('testimonyBody') ||
                      document.querySelector('textarea');

    if (btnPhoto && fileInput && !btnPhoto.dataset.listenerAttached) {
        btnPhoto.addEventListener('click', (e) => {
            e.preventDefault();
            fileInput.click();
        });
        btnPhoto.dataset.listenerAttached = 'true';
    }

    if (fileInput && !fileInput.dataset.listenerAttached) {
        fileInput.addEventListener('change', handleMediaSelect);
        fileInput.dataset.listenerAttached = 'true';
    }

    if (bodyInput && !bodyInput.dataset.aiListenerAttached) {
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
        bodyInput.dataset.aiListenerAttached = 'true';
    }

    if (postButton && !postButton.dataset.listenerAttached) {
        postButton.dataset.listenerAttached = 'true';
        postButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();
            // Prefer the main.js path if it exists
            if (typeof window.publishTestimony === 'function') {
                window.publishTestimony();
            } else {
                handleComposerSubmit(e);
            }
        });
    }

    if (composerForm && !composerForm.dataset.listenerAttached) {
        composerForm.dataset.listenerAttached = 'true';
        composerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (typeof window.publishTestimony === 'function') {
                window.publishTestimony();
            } else {
                handleComposerSubmit(e);
            }
        });
    }
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
 * Main submit handler - simplified to use only the main.js path
 * This eliminates the double-publish and permission conflicts.
 */
async function handleComposerSubmit(e) {
  if (e?.preventDefault) e.preventDefault();
  if (e?.stopImmediatePropagation) e.stopImmediatePropagation();

  if (isSubmitting) {
    console.warn('[composer] Already submitting – ignored');
    return;
  }

  // Prefer the hardened path in main.js
  if (typeof window.publishTestimony === 'function') {
    console.log('[composer] Redirecting to window.publishTestimony()');
    isSubmitting = true;

    const submitBtn = document.getElementById('postButton') ||
                      document.getElementById('submitBtn');

    if (submitBtn) submitBtn.disabled = true;

    try {
      await window.publishTestimony();
    } catch (err) {
      console.error('[composer] Redirected publish failed:', err);
      showToast('Failed to publish. Please try again.', 'error');
    } finally {
      isSubmitting = false;
      if (submitBtn) submitBtn.disabled = false;
    }
    return;
  }

  // Fallback only if main.js path is missing
  console.warn('[composer] window.publishTestimony not found – using old path');
  showToast('Publish system not ready. Please refresh the page.', 'error');
}
/**
 * Reset form UI
 */
export function resetForm() {
    const form = document.getElementById('composer-form') || document.getElementById('testimonyForm');
    const headlineInput = document.getElementById('headlineInput') || 
                          document.getElementById('testimonyHeadline') || 
                          document.getElementById('testimonyTitle') || 
                          document.getElementById('postHeadline');
    const bodyInput = document.getElementById('mainInput') || document.getElementById('postBody');
    const previewArea = document.getElementById('preview-area') || document.getElementById('media-preview') || document.getElementById('media-provenance-badge');
    const fileInput = document.getElementById('media-input') || document.getElementById('photoInput') || document.getElementById('media-file-input');
    const anonymousCheckbox = document.getElementById('post-anonymously') || document.getElementById('isAnonymous');

    if (form) form.reset();
    if (headlineInput) headlineInput.value = '';
    if (bodyInput) bodyInput.value = '';
    if (fileInput) fileInput.value = '';
    if (anonymousCheckbox) anonymousCheckbox.checked = false;

    if (previewArea) {
        previewArea.innerHTML = '<span class="text-zinc-500 text-sm">Preview will appear here...</span>';
    }

    window.activeSubmissionDraft = {};
    clearAiFeedback();
    clearMediaQuotaBadge();
    clearMediaOriginClaimUI();
    lastAnalyzedText = '';

    if (typeof resetMediaState === 'function') {
        resetMediaState();
    }
}
