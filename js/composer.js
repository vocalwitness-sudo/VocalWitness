// js/composer.js - Production Testimony Creation & Forensic Pipeline
import { compressImage } from './media-compression.js';
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
function clearComposerState(mainInput, btnPhoto, btnVoice) {
    if (mainInput) mainInput.value = '';
    btnPhoto?.classList.remove('active', 'bg-slate-700', 'ring-2', 'ring-emerald-500');
    btnVoice?.classList.remove('active', 'bg-slate-700', 'ring-2', 'ring-emerald-500');
    resetMediaState();
}

// Initialize Composer Event Listeners & Ensure Visual Styling
export function initComposer() {
    const btnPhoto = document.getElementById('btn-photo');
    const btnVoice = document.getElementById('btn-voice');
    const mainInput = document.getElementById('mainInput') || document.getElementById('testimonyInput');
    const previewArea = document.getElementById('preview-area');
    const postButton = document.getElementById('postButton');
    const targetFeedSelect = document.getElementById('targetFeedSelect') || document.getElementById('feedType');

    // --- APPLY FALLBACK STYLING ---
    if (btnPhoto) btnPhoto.classList.add('inline-flex', 'items-center', 'gap-2', 'px-3', 'py-1.5', 'rounded-lg', 'bg-slate-800', 'text-emerald-400', 'border', 'border-slate-700', 'hover:bg-slate-700', 'cursor-pointer', 'transition');
    if (btnVoice) btnVoice.classList.add('inline-flex', 'items-center', 'gap-2', 'px-3', 'py-1.5', 'rounded-lg', 'bg-slate-800', 'text-amber-400', 'border', 'border-slate-700', 'hover:bg-slate-700', 'cursor-pointer', 'transition');
    if (postButton) postButton.classList.add('inline-flex', 'items-center', 'justify-center', 'px-5', 'py-1.5', 'rounded-lg', 'bg-emerald-600', 'hover:bg-emerald-500', 'text-white', 'font-semibold', 'shadow', 'cursor-pointer', 'transition');

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
            
            // Feed Alias Normalization
            let rawFeed = targetFeedSelect?.value || "citizen_talk";
            const targetFeed = (rawFeed === 'vocal_truth' || rawFeed === 'true_witness') ? 'witness_voice' : rawFeed;

            // --- 1. OFFLINE CHECK & BUFFER ---
            if (!navigator.onLine) {
                await saveDraftOffline({
                    content: text,
                    targetFeed: targetFeed,
                    authorId: auth?.currentUser?.uid || 'anonymous',
                    createdAt: Date.now()
                });
                showToast('Network offline. Testimony saved to local queue!', 'warning');
                clearComposerState(mainInput, btnPhoto, btnVoice);
                return;
            }

            // --- 2. DEFERRED ONBOARDING (Unauthenticated Users) ---
            if (!auth.currentUser) {
                await saveDraftOffline({
                    content: text,
                    targetFeed: targetFeed,
                    createdAt: Date.now(),
                    status: 'pending_auth'
                });
                showToast('Draft saved securely. Please log in to publish.', 'info');
                
                // Trigger event for auth.js to catch and show the login modal
                window.dispatchEvent(new CustomEvent('vocalWitness:requestAuth'));
                return;
            }

            const originalBtnText = postButton.textContent;
            postButton.disabled = true;
            postButton.textContent = 'Processing...';

            try {
                // --- 3. MEDIA UPLOAD ---
                const mediaData = (await uploadForensicMedia()) || {};

                if (!text && !mediaData.imageUrl && !mediaData.audioUrl) {
                    showToast('Please write something or attach media', 'error');
                    postButton.disabled = false;
                    postButton.textContent = originalBtnText;
                    return;
                }

                // --- 4. TARGET FEED VERIFICATION DOOR & CLOUD DRAFTS ---
                if (targetFeed === 'witness_voice') {
                    const userDocRef = doc(db, "users", auth.currentUser.uid);
                    const userSnap = await getDoc(userDocRef);
                    const userData = userSnap.exists() ? userSnap.data() : {};

                    const isVerified = userData.zkVerified === true || userData.tier === 'witness' || userData.tier === 'steward';

                    if (!isVerified) {
                        // Save to Cloud Drafts so their work isn't lost
                        await addDoc(collection(db, `users/${auth.currentUser.uid}/drafts`), {
                            content: text,
                            targetFeed: targetFeed,
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
                                        applicantId: auth.currentUser.uid,
                                        applicantName: auth.currentUser.displayName || "Anonymous Witness",
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
                        
                        clearComposerState(mainInput, btnPhoto, btnVoice);
                        return; // Stop publish execution here
                    }
                }

                // --- 5. RATE LIMIT CHECK (FAIL-OPEN) ---
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
                    content: text || "",
                    targetFeed: targetFeed,
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
                    hasForensic: !!(mediaData.imageHash || mediaData.audioHash),
                    status: 'published'
                });

                // --- 7. FORENSIC AUDIT LOGGING ---
                await logSecurityAudit('TESTIMONY_PUBLISHED', testimonyRef.id, {
                    targetFeed,
                    hasMedia: !!(mediaData.imageUrl || mediaData.audioUrl)
                });

                showToast('✅ Testimony published successfully!', 'success');
                clearComposerState(mainInput, btnPhoto, btnVoice);
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
    const composerInput = document.getElementById('mainInput') || document.getElementById('testimonyInput');
    if (composerInput && window.t) {
        composerInput.placeholder = window.t('placeholder') || 'What truth will you log today?';
    }
});
