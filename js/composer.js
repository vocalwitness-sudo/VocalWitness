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
import { logSecurityAudit } from './audit.js';
import { prepareAnonymousSubmission } from './onboarding.js';
import { publishTestimonyOrQueue } from './db.js';
import { analyzeReportContent, classifyCategory } from './moderation.js';
import {
 resetMediaState,
 clearAllMedia,
 setImageFile,
 setVideoFile,
 setAudioFile,
 getActiveMedia
} from './media.js';

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
 * Show the existing Video Policy modal (from HTML)
 */
function showVideoPolicyModal(customMessage) {
  const modal = document.getElementById('video-policy-modal');
  if (!modal) {
    console.warn('[composer] video-policy-modal not found in DOM');
    showToast(customMessage || 'Video policy restriction applied', 'warning');
    return;
  }

  const msgEl = document.getElementById('video-policy-msg');
  if (msgEl && customMessage) {
    msgEl.textContent = customMessage;
  }

  // Use the global helper if available
  if (typeof window.openVideoPolicyModal === 'function') {
    window.openVideoPolicyModal(customMessage);
  } else {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    modal.setAttribute('aria-hidden', 'false');
  }
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
    } else if (validationResult?.syntheticScore > 0.65) {
        container.className = 'mt-2 p-3 rounded-xl border border-red-500/40 bg-red-950/20 text-red-300 text-xs';
        container.innerHTML = `
            <div class="flex items-center justify-between">
                <span class="font-semibold text-red-400">⚠️ High Synthetic Probability</span>
                <span class="font-mono text-[11px]">${fileMB} MB</span>
            </div>
            <p class="mt-1 text-slate-300">
                Score: ${(validationResult.syntheticScore * 100).toFixed(0)}% — 
                ${validationResult.syntheticAdvisory || 'Likely AI-generated or heavily manipulated'}
            </p>
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
 clearAllMedia();   // single source of truth from media.js
 ['media-input', 'photoInput', 'videoInput', 'audioInput', 'media-file-input', 'mediaFileInput']
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
 clearMediaQuotaBadge();
 clearMediaOriginClaimUI();
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

  setImageFile(file);   // ← use this
  renderMediaTrustBadge(null, file, { provenance: 'standard_image' });

  try {
    showToast('Processing photo payload...', 'info');
    renderGenericMediaPreview(file, previewArea);
    renderMediaOriginClaimUI();
    showToast('Photo ready for submission', 'success');
    // After successful media is set
    window.dispatchEvent(new CustomEvent('media-changed'));
  } catch (err) {
    console.error('Image processing error:', err);
    showToast('Photo processing failed', 'error');
    clearAllMedia();
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

    // Optional client-side synthetic score
    let syntheticInfo = null;
    try {
        syntheticInfo = await calculateSyntheticScoreFromMetadata(file);
        // Optionally also run: evaluateClientSyntheticAdvisory(syntheticInfo)
    } catch (err) {
        console.warn('Synthetic score calculation failed (non-blocking):', err);
    }

    const enrichedValidation = {
        ...validationResult,
        syntheticScore: syntheticInfo?.score ?? null,
        syntheticAdvisory: syntheticInfo?.advisory ?? null
    };

    const costInfo = await calculateVideoUploadCost(file);
    renderMediaTrustBadge(costInfo, file, enrichedValidation);

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
    setVideoFile(file);

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
            detectedSignatures: validationResult.detectedSignatures,
            syntheticScore: enrichedValidation.syntheticScore,
            syntheticAdvisory: enrichedValidation.syntheticAdvisory
        };

        showToast('Video ready for submission', 'success');
        // After successful media is set
        window.dispatchEvent(new CustomEvent('media-changed'));
    } catch (err) {
        console.error('Video preview error:', err);
        showToast('Video preview failed', 'error');
        clearAllMedia();
    }
}

/**
 * Distinct handler for Audio Selection (file upload only)
 * Live voice recording is owned 100% by media.js
 */
export async function handleAudioSelectAction(event) {
  const file = event.target?.files?.[0];
  if (!file) return;

  setAudioFile(file, 'uploaded_audio');
  renderMediaTrustBadge(null, file, { provenance: 'uploaded_audio' });
  renderMediaOriginClaimUI();
  showToast('Uploaded audio ready', 'success');
  // After successful media is set
  window.dispatchEvent(new CustomEvent('media-changed'));
}

// ====================== INIT COMPOSER ======================
export function initComposer() {
  const root = document.getElementById('composer-form') ||
               document.getElementById('testimonyForm') ||
               document.getElementById('public-square') ||
               document.body;

  if (root.dataset.composerInitialized === 'true') {
    console.log('[composer] Already initialized – skipping');
    return;
  }
  root.dataset.composerInitialized = 'true';

  // ===== CLICK DELEGATION =====
  // Voice button (#btn-voice / live recording) is intentionally NOT handled here.
  // media.js owns 100% of voice recording UI + logic.
  root.addEventListener('click', (e) => {
    // Photo button
    if (e.target.closest('#btn-photo, #btn-attach-photo, [data-action="attach-photo"]')) {
      e.preventDefault();
      e.stopPropagation();
      const input = document.getElementById('photoInput') || document.getElementById('media-input');
      if (input) input.click();
      return;
    }

    // Video button
    if (e.target.closest('#btn-video, [data-action="attach-video"]')) {
      e.preventDefault();
      e.stopPropagation();
      const input = document.getElementById('videoInput');
      if (input) input.click();
      return;
    }

    // Publish button
    if (e.target.closest('#postButton, #submitBtn')) {
      handleComposerSubmit(e);
    }
  });

  // ===== FILE INPUT LISTENERS =====
  const photoInput = document.getElementById('photoInput') || document.getElementById('media-input');
  if (photoInput && !photoInput.dataset.listenerAttached) {
    photoInput.dataset.listenerAttached = 'true';
    photoInput.addEventListener('change', handleImageSelectAction);
  }

  const videoInput = document.getElementById('videoInput');
  if (videoInput && !videoInput.dataset.listenerAttached) {
    videoInput.dataset.listenerAttached = 'true';
    videoInput.addEventListener('change', handleVideoSelectAction);
  }

  // ===== AI Analysis (debounced) =====
  const bodyInput = document.getElementById('mainInput');
  if (bodyInput && !bodyInput.dataset.aiListenerAttached) {
    bodyInput.dataset.aiListenerAttached = 'true';
    bodyInput.addEventListener('input', (e) => {
      const text = e.target.value.trim();
      if (text.length < 30 || text === lastAnalyzedText) {
        clearTimeout(aiAnalysisDebounceTimer);
        if (text.length < 30) clearAiFeedback();
        return;
      }
      clearTimeout(aiAnalysisDebounceTimer);
      aiAnalysisDebounceTimer = setTimeout(() => {
        lastAnalyzedText = text;
        runRealtimeAiAnalysis(text);
      }, 900);
    });
  }

  // Make sure the live publish button state is wired
  if (typeof window.initComposerLiveState === 'function') {
    window.initComposerLiveState();
  }

  console.log('✅ Composer initialized (media handlers isolated, voice left to media.js)');
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
        feedbackBox.className = 'mt-3 p-3 rounded-xl border border-zinc-700 bg-zinc-900/80 text-zinc-400 text-xs';
        feedbackBox.innerHTML = `
            <div class="flex items-center gap-2">
                <span>🤖</span>
                <span>AI analysis temporarily unavailable</span>
            </div>`;
        feedbackBox.classList.remove('hidden');
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
        ⚠️ Content needs attention
      </div>
      <p>${analysis.reason || 'This content may violate community safety standards. Please review before publishing.'}</p>
    `;
  } else {
    container.className = 'mt-3 p-3 rounded-xl border border-emerald-500/30 bg-emerald-950/20 text-emerald-300 text-xs';
    container.innerHTML = `
      <div class="flex items-center justify-between flex-wrap gap-2">
        <span class="flex items-center gap-1.5 font-medium">
          ✨ Auto-tagged: <strong class="text-white">${category || 'General'}</strong>
        </span>
        <span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30">
          ${analysis.urgency === 'High' ? '🔥 High urgency' : 'Normal priority'}
        </span>
      </div>
      ${analysis.summary ? `<p class="mt-1.5 text-zinc-400 text-[11px] leading-relaxed">${analysis.summary}</p>` : ''}
    `;
  }
  container.classList.remove('hidden');
}

/**
 * Strengthen handleComposerSubmit success path
 */
async function handleComposerSubmit(e) {
  if (e?.preventDefault) e.preventDefault();
  if (e?.stopImmediatePropagation) e.stopImmediatePropagation();

  if (isSubmitting) return;
  isSubmitting = true;

  const submitBtn = document.getElementById('postButton');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.classList.add('opacity-60', 'cursor-not-allowed');
  }

  try {
    window.activeSubmissionDraft = window.activeSubmissionDraft || {};
    window.activeSubmissionDraft.mediaOriginClaim = getSelectedMediaOriginClaim();

    if (typeof window.publishTestimony === 'function') {
      await window.publishTestimony();
    } else if (typeof publishTestimonyOrQueue === 'function') {
      await publishTestimonyOrQueue(window.activeSubmissionDraft);
    } else {
      throw new Error('No publish function available');
    }

    // Optional: clear AI feedback after successful publish
    clearAiFeedback();
  } catch (err) {
    console.error('[composer] Publish failed:', err);
    showToast('Failed to publish. Please try again.', 'error');
  } finally {
    isSubmitting = false;
    // Note: we deliberately do NOT re-enable the button here.
    // The success state in main.js will handle UI reset.
  }
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
