// js/composer.js - Hardened Post & Testimony Composer + Real-time AI Analysis & Video Security
import { prepareMediaForUpload } from './media-pipeline.js';
import { uploadMedia } from './upload.js';
import { showToast } from './utils.js';
import { getCurrentUserTier, TIERS, calculateVideoUploadCost } from './tier.js';
import { db, auth } from './firebase-config.js';
import { validateVideoFile } from './video-validator.js';
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
import { analyzeReportContent, classifyCategory } from './moderation.js';

let isSubmitting = false;
let aiAnalysisDebounceTimer = null;
let lastAnalyzedText = '';

/**
 * Safely get user tier string
 * Returns: 'citizen' | 'citizen_circle' | 'witness_circle'
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
        // Triggers support/checkout modal or native user prompt
        const userChoice = confirm(
            `Bandwidth / Infrastructure Fee Notice:\n\n${reason}\n\n` +
            `Fee: $${feeUSD.toFixed(2)} USD (Payable via Paystack or USDT).\n\n` +
            `Would you like to proceed to payment to finalize this upload?`
        );

        if (userChoice) {
            // Open user support modal or inline gateway
            const supportModal = document.getElementById('support-modal') || document.getElementById('paymentModal');
            if (supportModal) {
                supportModal.classList.remove('hidden');
            } else {
                showToast(`Please complete payment of $${feeUSD.toFixed(2)} USD via the Support Modal to proceed.`, 'info');
            }
            // Return true if payment succeeds / user agrees to open portal
            resolve(true);
        } else {
            resolve(false);
        }
    });
}

/**
 * Handle input selection for both video pre-flight validation and image scrubbing
 */
export async function handleMediaSelect(event) {
    const previewArea = document.getElementById('preview-area') ||
                        document.getElementById('media-preview');
    if (!event.target?.files?.[0]) return;

    const originalFile = event.target.files[0];

    // 1. Video Pre-Flight Validation & Pricing Check
    if (originalFile.type.startsWith("video/")) {
        showToast('Validating video authenticity & size rules...', 'info');
        
        // A. Authenticity & Deepfake check
        const validation = await validateVideoFile(originalFile);
        if (!validation.valid) {
            event.target.value = "";
            showVideoPolicyModal(validation.message);
            return;
        }

        // B. Tier allowance & bandwidth overage calculation
        const costInfo = await calculateVideoUploadCost(originalFile);

        if (costInfo.blocked) {
            showToast(costInfo.reason, 'error');
            event.target.value = "";
            return;
        }

        if (!costInfo.isFree) {
            const paidOrAgreed = await triggerOveragePaymentModal(costInfo.feeUSD, costInfo.reason);
            if (!paidOrAgreed) {
                showToast('Video upload canceled.', 'warning');
                event.target.value = "";
                return;
            }
        }
    }

    // 2. Image Processing & EXIF Scrubbing Pipeline
    try {
        showToast('Processing media payload...', 'info');
        const preparedFile = await prepareMediaForUpload(originalFile);

        // Pass prepared file to preview UI renderer
        const syntheticEvent = {
            target: { files: [preparedFile] },
            preventDefault: () => {},
            stopPropagation: () => {}
        };
        await handleImageSelect(syntheticEvent, previewArea);
        showToast('Media ready for submission', 'success');
    } catch (err) {
        console.error('Media processing error:', err);
        showToast('Media processing failed – using original clip', 'warning');
        await handleImageSelect(event, previewArea);
    }
}

/**
 * Initialize composer listeners and real-time AI analysis
 */
export function initComposer() {
    const fileInput = document.getElementById('media-input') || document.getElementById('photoInput');
    const btnPhoto = document.getElementById('btn-attach-photo') ||
                     document.getElementById('btnPhoto') ||
                     document.getElementById('btn-photo');
    const postButton = document.getElementById('postButton') || document.getElementById('submitBtn');
    const composerForm = document.getElementById('composer-form') || document.getElementById('testimonyForm');

    const bodyInput = document.getElementById('mainInput') ||
                      document.getElementById('postBody') ||
                      document.getElementById('testimonyBody');

    // Photo/Media button → trigger file picker
    if (btnPhoto && fileInput && !btnPhoto.dataset.listenerAttached) {
        btnPhoto.addEventListener('click', (e) => {
            e.preventDefault();
            fileInput.click();
        });
        btnPhoto.dataset.listenerAttached = 'true';
    }

    // File selection listener
    if (fileInput && !fileInput.dataset.listenerAttached) {
        fileInput.addEventListener('change', handleMediaSelect);
        fileInput.dataset.listenerAttached = 'true';
    }

    // Real-time AI Content Analysis & Auto-Classification
    if (bodyInput && !bodyInput.dataset.aiListenerAttached) {
        bodyInput.addEventListener('input', (e) => {
            const text = e.target.value.trim();
            if (text.length < 25) {
                clearAiFeedback();
                return;
            }

            clearTimeout(aiAnalysisDebounceTimer);
            aiAnalysisDebounceTimer = setTimeout(async () => {
                if (text === lastAnalyzedText) return;
                lastAnalyzedText = text;
                await runRealtimeAiAnalysis(text);
            }, 800);
        });
        bodyInput.dataset.aiListenerAttached = 'true';
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

        // Auto-select category if default or empty
        const categorySelect = document.getElementById('categorySelect') ||
                               document.getElementById('testimonyCategory');
        if (categorySelect && (categorySelect.value === 'General' || !categorySelect.value)) {
            const matchOption = Array.from(categorySelect.options).find(
                opt => opt.value.toLowerCase() === category.toLowerCase() || opt.text.toLowerCase().includes(category.toLowerCase())
            );
            if (matchOption) {
                categorySelect.value = matchOption.value;
            }
        }

        // Recommend channel toggle if high severity
        const channelToggle = document.getElementById('channelToggle') || document.getElementById('isWitnessVoice');
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
            ${analysis.summary ? `<p class="mt-1 text-zinc-400 text-[11px]"><strong>AI Summary:</strong> ${analysis.summary}</p>` : ''}
        `;
    }
    container.classList.remove('hidden');
}

function clearAiFeedback() {
    const box = document.getElementById('composer-ai-feedback');
    if (box) {
        box.classList.add('hidden');
        box.innerHTML = '';
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
        // Pre-flight AI Safety Verification
        showToast('Checking content compliance...', 'info');
        const preflightCheck = await analyzeReportContent(body);
        
        if (preflightCheck?.isToxic) {
            const proceed = confirm(`AI Moderation Notice:\n\n${preflightCheck.reason || 'Your testimony may contain sensitive or flagged content.'}\n\nDo you still wish to submit for review?`);
            if (!proceed) {
                isSubmitting = false;
                if (submitBtn) submitBtn.disabled = false;
                return;
            }
        }

        const userTier = await getUserTier();   // string: 'citizen' | 'citizen_circle' | 'witness_circle'

        let mediaData = {
            imageUrl: null,
            imageHash: null,
            audioUrl: null,
            audioHash: null,
            forensicHash: null
        };

        // Upload media if present
        if (fileInput?.files?.[0]) {
            const preparedFile = await prepareMediaForUpload(fileInput.files[0]);
            const uploaded = await uploadMedia(preparedFile);

            mediaData = {
                imageUrl: typeof uploaded === 'string' ? uploaded : (uploaded?.imageUrl || null),
                imageHash: uploaded?.mediaHash || uploaded?.imageHash || null,
                audioUrl: uploaded?.audioUrl || null,
                audioHash: uploaded?.audioHash || null,
                forensicHash: uploaded?.forensicHash || uploaded?.mediaHash || null
            };
        }

        // Unverified users targeting Witness Voice → save as draft
        if (isWitnessVoice && userTier === TIERS.CITIZEN) {
            await addDoc(collection(db, `users/${user.uid}/drafts`), {
                headline: headline || null,
                body,
                category,
                imageUrl: mediaData.imageUrl,
                imageHash: mediaData.imageHash,
                audioUrl: mediaData.audioUrl,
                audioHash: mediaData.audioHash,
                forensicHash: mediaData.forensicHash,
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

    clearAiFeedback();
    lastAnalyzedText = '';

    if (typeof resetMediaState === 'function') {
        resetMediaState();
    }
}
