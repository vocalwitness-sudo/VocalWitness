// js/publish.js - VocalWitness Publish & Media Submission Handler

import { uploadMedia } from './upload.js';
import { selectedImageFile, resetMediaState } from './media.js';
import { auth, db } from './firebase-config.js';
import { collection, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { showToast, generateSha256Hash } from './utils.js';

// Module-level lock guard to prevent duplicate submissions from rapid taps/clicks
let isPublishingActive = false;

export async function handlePublishSubmission(event, formElement) {
    if (event) event.preventDefault();

    if (isPublishingActive) {
        console.warn("Publish action already in progress. Ignoring duplicate trigger.");
        return;
    }

    const publishBtn = formElement.querySelector('button[type="submit"]');
    
    isPublishingActive = true;
    if (publishBtn) {
        publishBtn.disabled = true;
        publishBtn.style.opacity = '0.6';
        publishBtn.textContent = 'Publishing...';
    }

    try {
        const textContent = formElement.querySelector('#post-text, textarea')?.value?.trim() || '';
        const category = formElement.querySelector('#category-select')?.value || 'Citizen Talk';
        
        // Retrieve active audio blob if any from window or voice engine
        const audioBlob = window.currentAudioBlob || window.engineInstance?.currentAudioBlob;

        if (!textContent && !selectedImageFile && !audioBlob) {
            showToast("Please write a testimony or attach forensic media before publishing.", "error");
            return;
        }

        showToast("🚀 Initializing secure publishing protocol...", "info");

        let imageUrl = null;
        let audioUrl = null;
        let imageHash = null;
        let audioHash = null;

        // 1. Upload Image & Generate Cryptographic Hash to R2 if selected
        if (selectedImageFile) {
            showToast("🔐 Generating SHA-256 hash & uploading image evidence...", "info");
            try {
                imageHash = await generateSha256Hash(selectedImageFile);
            } catch (hashErr) {
                console.warn("Image hashing failed, proceeding without hash:", hashErr);
            }

            imageUrl = await uploadMedia(selectedImageFile, 'witness_evidence', (progress) => {
                showToast(`📤 Image Upload: ${progress}%`, "info");
            });
        }

        // 2. Upload Voice Audio & Generate Cryptographic Hash to R2 if recorded
        if (audioBlob) {
            showToast("🔐 Generating SHA-256 hash & uploading voice audio...", "info");
            try {
                audioHash = await generateSha256Hash(audioBlob);
            } catch (hashErr) {
                console.warn("Audio hashing failed, proceeding without hash:", hashErr);
            }

            audioUrl = await uploadMedia(audioBlob, 'witness_audio', (progress) => {
                showToast(`📤 Audio Upload: ${progress}%`, "info");
            });
        }

        // 3. Construct Firestore Post Payload with Forensic Evidence Links & Hashes
        const postData = {
            uid: auth.currentUser?.uid || 'anonymous',
            authorName: auth.currentUser?.displayName || 'Anonymous Witness',
            authorAvatar: auth.currentUser?.photoURL || 'https://api.dicebear.com/7.x/identicon/svg?seed=anonymous',
            content: textContent,
            category: category,
            imageUrl: imageUrl || null,
            audioUrl: audioUrl || null,
            imageHash: imageHash || null,
            audioHash: audioHash || null,
            createdAt: serverTimestamp(),
            credibilityScore: 10,
            upvotes: 0,
            downvotes: 0
        };

        // 4. Save to Firestore Ledger
        showToast("📝 Writing verified testimony to Firestore ledger...", "info");
        await addDoc(collection(db, 'testimonies'), postData);

        showToast("✅ Testimony published successfully!", "success");
        
        // Reset Form and State (including media previews and audio blobs)
        formElement.reset();
        if (typeof resetMediaState === 'function') {
            resetMediaState();
        }
        window.currentAudioBlob = null;
        window.clearMediaPreview?.();
        
        // Trigger feed reload if available
        if (typeof window.loadTestimonies === 'function') {
            window.loadTestimonies();
        }

    } catch (err) {
        console.error("Publishing failed:", err);
        showToast(`❌ Publishing failed: ${err.message}`, "error");
    } finally {
        isPublishingActive = false;
        if (publishBtn) {
            publishBtn.disabled = false;
            publishBtn.style.opacity = '1';
            publishBtn.textContent = 'Publish Testimony';
        }
    }
}
