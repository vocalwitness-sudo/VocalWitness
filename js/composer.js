// js/composer.js - Production Testimony Creation & Forensic Pipeline
import { compressImage } from './media-compression.js';
import { scrubImageMetadata } from './imageScrubber.js';
import { showToast } from './utils.js';
import { getCurrentUserTier, getCurrentWitnessLevel } from './tier.js';
import { db, auth } from './firebase-config.js';
import { collection, addDoc, doc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js";
import { uploadForensicMedia, resetMediaState, handleImageSelect, toggleVoiceRecording } from './media.js';
import { logSecurityAudit } from './audit.js';
import { saveDraftOffline } from './db.js';

// Verification Door Modal Trigger
function triggerVerificationDoor({ title, message, onVerifyRequested }) {
    const existingModal = document.getElementById('verification-door-modal');
    if (existingModal) existingModal.remove();

    const modalHtml = `
    <div id="verification-door-modal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-fade-in">
      <div class="bg-slate-900 border border-amber-500/40 rounded-xl p-6 max-w-md w-full shadow-2xl space-y-4">
        <div class="flex items-center gap-3 text-amber-400">
          <svg class="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
          <h3 class="text-lg font-bold text-slate-100">${title}</h3>
        </div>
        <p class="text-slate-300 text-sm leading-relaxed">${message}</p>
        <div class="flex justify-end gap-3 pt-2">
          <button id="cancel-door-btn" class="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg text-sm hover:bg-slate-700 transition">Cancel</button>
          <button id="start-verify-btn" class="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-semibold shadow transition">Request Verification</button>
        </div>
      </div>
    </div>
  `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    document.getElementById('cancel-door-btn').onclick = () => {
        document.getElementById('verification-door-modal')?.remove();
    };

    document.getElementById('start-verify-btn').onclick = async () => {
        document.getElementById('verification-door-modal')?.remove();
        if (onVerifyRequested) await onVerifyRequested();
    };
}

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

// Reset composer inputs and UI toggles
function clearComposerState(headlineInput, mainInput, btnPhoto, btnVoice) {
    if (headlineInput) headlineInput.value = '';
    if (mainInput) mainInput.value = '';
    btnPhoto?.classList.remove('active', 'bg-slate-700', 'ring-2', 'ring-emerald-500');
    btnVoice?.classList.remove('active', 'bg-slate-700', 'ring-2', 'ring-emerald-500');
    resetMediaState();
}

// Visual Indicator Helper for Witness Voice Switching
function updateComposerModeUI(targetFeed) {
    const isWitness = targetFeed === 'witness_voice';
    const composerBox = document.getElementById('composer-container') || document.querySelector('.composer-box');
    const modeBadge = document.getElementById('composer-mode-badge');

    if (composerBox) {
        if (isWitness) {
            composerBox.classList.add('border-amber-500/50', 'bg-slate-950/90');
            composerBox.classList.remove('border-slate-800');
        } else {
            composerBox.classList.remove('border-amber-500/50', 'bg-slate-950/90');
            composerBox.classList.add('border-slate-800');
        }
    }

    if (modeBadge) {
        modeBadge.textContent = isWitness ? '🛡️ Witness Voice Mode (EXIF Scrubbing Active)' : '💬 Citizen Talk Mode';
        modeBadge.className = isWitness 
            ? 'text-xs font-semibold text-amber-400 bg-amber-950/40 px-2 py-1 rounded border border-amber-500/30' 
            : 'text-xs font-semibold text-emerald-400 bg-slate-800 px-2 py-1 rounded';
    }
}

// Initialize Composer Event Listeners & Ensure Visual Styling
export function initComposer() {
    const btnPhoto = document.getElementById('btn-photo');
    const btnVoice = document.getElementById('btn-voice');
    const headlineInput = document.getElementById('headlineInput') || document.getElementById('testimonyHeadline');
    const mainInput = document.getElementById('mainInput') || document.getElementById('testimonyInput');
    const previewArea = document.getElementById('preview-area');
    const postButton = document.getElementById('postButton');
    const targetFeedSelect = document.getElementById('targetFeedSelect') || document.getElementById('feedType');

    // --- FEED SELECTOR SWITCH LISTENER ---
    if (targetFeedSelect && !targetFeedSelect.dataset.listenerAttached) {
        targetFeedSelect.dataset.listenerAttached = "true";
        targetFeedSelect.addEventListener('change', (e) => {
            let rawFeed = e.target.value;
            const normalizedFeed = (rawFeed === 'vocal_truth' || rawFeed === 'true_witness') ? 'witness_voice' : rawFeed;
            updateComposerModeUI(normalizedFeed);
        });

        // Initialize UI state
        let initFeedVal = targetFeedSelect.value;
        updateComposerModeUI((initFeedVal === 'vocal_truth' || initFeedVal === 'true_witness') ? 'witness_voice' : initFeedVal);
    }

    // --- APPLY FALLBACK STYLING ---
    if (btnPhoto) btnPhoto.classList.add('inline-flex', 'items-center', 'gap-2', 'px-3', 'py-1.5', 'rounded-lg', 'bg-slate-800', 'text-emerald-400', 'border', 'border-slate-700', 'hover:bg-slate-700', 'cursor-pointer', 'transition');
    if (btnVoice) btnVoice.classList.add('inline-flex', 'items-center', 'gap-2', 'px-3', 'py-1.5', 'rounded-lg', 'bg-slate-800', 'text-amber-400', 'border', 'border-slate-700', 'hover:bg-slate-700', 'cursor-pointer', 'transition');
    if (postButton) postButton.classList.add('inline-flex', 'items-center', 'justify-center', 'px-5', 'py-1.5', 'rounded-lg', 'bg-emerald-600', 'hover:bg-emerald-500', 'text-white', 'font-semibold', 'shadow', 'cursor-pointer', 'transition');

    // --- PHOTO SELECTION & FORENSIC SCRUBBING ---
    if (btnPhoto && !btnPhoto.dataset.listenerAttached) {
        btnPhoto.dataset.listenerAttached = "true";

        const fileInput = document.getElementById('image-file-input');

        btnPhoto.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (fileInput) {
                fileInput.value = '';          // allow selecting the same file again
                fileInput.click();
            }
        });

        if (fileInput && !fileInput.dataset.listenerAttached) {
            fileInput.dataset.listenerAttached = "true";

            fileInput.addEventListener('change', async (evt) => {
                const file = evt.target.files?.[0];
                if (!file) return;

                try {
                    showToast('Scrubbing EXIF metadata & compressing...', 'info');
                    
                    // 1. Scrub EXIF Metadata for privacy protection
                    const cleanFile = typeof scrubImageMetadata === 'function' ? await scrubImageMetadata(file) : file;
                    
                    // 2. Compress image
                    const compressedFile = await compressImage(cleanFile, 1200, 0.82);
                    
                    const syntheticEvent = { target: { files: [compressedFile] } };
                    await handleImageSelect(syntheticEvent, previewArea);
                    toggleActive(btnPhoto);
                } catch (err) {
                    console.error("Image processing error:", err);
                    showToast('Failed to process image metadata', 'error');
                }
            });
        }
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
            const headline = headlineInput?.value ? headlineInput.value.trim() : "";
            const text = mainInput?.value ? mainInput.value.trim() : "";
            
            // Feed Alias Normalization
            let rawFeed = targetFeedSelect?.value || "citizen_talk";
            const targetFeed = (rawFeed === 'vocal_truth' || rawFeed === 'true_witness') ? 'witness_voice' : rawFeed;
            const isWitnessVoice = targetFeed === 'witness_voice';

            // --- 1. OFFLINE CHECK & BUFFER ---
            if (!navigator.onLine) {
                await saveDraftOffline({
                    headline: headline,
                    content: text,
                    targetFeed: targetFeed,
                    isWitnessVoice: isWitnessVoice,
                    authorId: auth?.currentUser?.uid || 'anonymous',
                    createdAt: Date.now()
                });
                showToast('Network offline. Testimony saved to local queue!', 'warning');
                clearComposerState(headlineInput, mainInput, btnPhoto, btnVoice);
                return;
            }

            // --- 2. DEFERRED ONBOARDING (Unauthenticated Users) ---
            if (!auth?.currentUser || !auth.currentUser.uid) {
                await saveDraftOffline({
                    headline: headline,
                    content: text,
                    targetFeed: targetFeed,
                    isWitnessVoice: isWitnessVoice,
                    createdAt: Date.now(),
                    status: 'pending_auth'
                });
                showToast('Draft saved securely. Please log in to publish.', 'info');
                
                // Trigger event for auth.js to catch and show the login modal
                window.dispatchEvent(new CustomEvent('vocalWitness:requestAuth'));
                return;
            }

            // Guard: Ensure user and UID are strictly available before proceeding to network/DB calls
            const userId = auth.currentUser.uid;
            if (!userId) {
                showToast('Authentication error. Please re-login.', 'error');
                return;
            }

            const originalBtnText = postButton.textContent;
            postButton.disabled = true;
            postButton.textContent = isWitnessVoice ? 'Hashing & Publishing...' : 'Processing...';

            try {
                // --- 3. MEDIA UPLOAD (Includes SHA-256 Forensic Hashing) ---
                const mediaData = (await uploadForensicMedia()) || {};

                // Validation check
                if ((!text || text.length === 0) && !mediaData.imageUrl && !mediaData.audioUrl) {
                    showToast('Please add text or attach verified media before publishing.', 'info');
                    postButton.disabled = false;
                    postButton.textContent = originalBtnText;
                    return;
                }

                // --- 4. TARGET FEED VERIFICATION DOOR & CLOUD DRAFTS ---
                if (isWitnessVoice) {
                    const userDocRef = doc(db, "users", userId);
                    const userSnap = await getDoc(userDocRef);
                    const userData = userSnap.exists() ? userSnap.data() : {};

                    const isVerified = userData.zkVerified === true || userData.tier === 'witness' || userData.tier === 'steward';

                    if (!isVerified) {
                        // Save to Cloud Drafts so work isn't lost
                        await addDoc(collection(db, `users/${userId}/drafts`), {
                            headline: headline || null,
                            content: text,
                            targetFeed: targetFeed,
                            isWitnessVoice: true,
                            imageUrl: mediaData.imageUrl || null,
                            audioUrl: mediaData.audioUrl || null,
                            imageHash: mediaData.imageHash || null,
                            audioHash: mediaData.audioHash || null,
                            createdAt: serverTimestamp(),
                            status: 'draft'
                        });

                        triggerVerificationDoor({
                            title: "Witness Voice Access Restricted",
                            message: "Your testimony has been saved as a draft. Publishing directly to the Witness Voice feed requires verification.",
                            onVerifyRequested: async () => {
                                try {
                                    await addDoc(collection(db, "verification_requests"), {
                                        applicantId: userId,
                                        applicantName: auth.currentUser?.displayName || "Anonymous Witness",
                                        targetFeed: targetFeed,
                                        status: "pending",
                                        requestedAt: serverTimestamp()
                                    });
                                    showToast("Verification request submitted! Steward review pending.", "success");
                                } catch (reqErr) {
                                    console.error("Verification request error:", reqErr);
                                    showToast("Failed to submit verification request.", "error");
                                }
                            }
                        });
                        
                        clearComposerState(headlineInput, mainInput, btnPhoto, btnVoice);
                        return; // Stop publish execution here
                    }
                }

                // --- 5. RATE LIMIT CHECK (FAIL-OPEN) ---
                try {
                    const functions = getFunctions(undefined, 'us-central1');
                    const checkRateLimitFn = httpsCallable(functions, 'checkRateLimit');
                    const rateLimitCheck = await checkRateLimitFn({
                        userId: userId,
                        action: "create_testimony",
                        maxCalls: 6,
                        windowMinutes: 60
                    });

                    const isAllowed = rateLimitCheck.data?.allowed !== undefined ? rateLimitCheck.data.allowed : rateLimitCheck.data;
                    if (!isAllowed) {
                        showToast("You've reached your posting limit. Please try again in an hour.", "error");
                        postButton.disabled = false;
                        postButton.textContent = originalBtnText;
                        return;
                    }
                } catch (rateError) {
                    console.warn("Rate limit check bypassed (fail-open):", rateError);
                }

                const userTier = await getCurrentUserTier();
                const userWitnessLevel = await getCurrentWitnessLevel();

                // --- 6. FIRESTORE WRITE ---
                const testimonyRef = await addDoc(collection(db, "testimonies"), {
                    headline: headline || null,
                    content: (text && text.trim()) || "",
                    targetFeed: targetFeed,
                    channel: targetFeed,
                    isWitnessVoice: isWitnessVoice,
                    imageUrl: mediaData.imageUrl || null,
                    audioUrl: mediaData.audioUrl || null,
                    forensicHash: mediaData.imageHash || mediaData.audioHash || null,
                    imageHash: mediaData.imageHash || null,
                    audioHash: mediaData.audioHash || null,
                    authorId: userId,
                    author: auth.currentUser?.displayName || "Anonymous Witness",
                    authorTier: userTier || 'citizen',
                    authorWitnessLevel: userWitnessLevel?.name || null,
                    createdAt: serverTimestamp(),
                    hasForensic: !!(mediaData.imageHash || mediaData.audioHash),
                    status: 'published'
                });

                // --- 7. FORENSIC AUDIT LOGGING ---
                await logSecurityAudit('TESTIMONY_PUBLISHED', testimonyRef.id, {
                    targetFeed,
                    isWitnessVoice,
                    hasHeadline: !!headline,
                    hasMedia: !!(mediaData.imageUrl || mediaData.audioUrl)
                });

                showToast(isWitnessVoice ? '🛡️ Witness Voice Testimony Logged!' : '✅ Post Published!', 'success');
                clearComposerState(headlineInput, mainInput, btnPhoto, btnVoice);
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

// Boot setup
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initComposer);
} else {
    initComposer();
}

window.addEventListener('languageChanged', () => {
    const headlineInput = document.getElementById('headlineInput') || document.getElementById('testimonyHeadline');
    const composerInput = document.getElementById('mainInput') || document.getElementById('testimonyInput');
    
    if (headlineInput && window.t) {
        headlineInput.placeholder = window.t('headlinePlaceholder') || 'Headline or Title (Optional)';
    }
    if (composerInput && window.t) {
        composerInput.placeholder = window.t('placeholder') || 'What truth will you log today?';
    }
});
