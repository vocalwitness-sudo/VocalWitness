// js/publish.js - VocalWitness Publish & Media Submission Handler

import { uploadMedia } from './upload.js';
import { selectedImageFile } from './media.js';
import { auth, db } from './firebase-config.js';
import { collection, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { showToast } from './utils.js';

export async function handlePublishSubmission(event, formElement) {
    if (event) event.preventDefault();

    const publishBtn = formElement.querySelector('button[type="submit"]');
    if (publishBtn) {
        publishBtn.disabled = true;
        publishBtn.textContent = 'Publishing...';
    }

    try {
        const textContent = formElement.querySelector('#post-text, textarea')?.value?.trim() || '';
        const category = formElement.querySelector('#category-select')?.value || 'Citizen Talk';
        
        if (!textContent && !selectedImageFile && !window.currentAudioBlob) {
            showToast("Please write a testimony or attach forensic media before publishing.", "error");
            if (publishBtn) {
                publishBtn.disabled = false;
                publishBtn.textContent = 'Publish Testimony';
            }
            return;
        }

        showToast("🚀 Initializing secure publishing protocol...", "info");

        let imageUrl = null;
        let audioUrl = null;
        let imageHash = null;
        let audioHash = null;

        // 1. Upload Image to R2 if selected
        if (selectedImageFile) {
            showToast("📤 Uploading scrubbed image evidence to R2...", "info");
            imageUrl = await uploadMedia(selectedImageFile, 'witness_evidence', (progress) => {
                showToast(`📤 Image Upload: ${progress}%`, "info");
            });
        }

        // 2. Upload Voice Audio to R2 if recorded
        if (window.currentAudioBlob) {
            showToast("📤 Uploading voice testimony audio to R2...", "info");
            audioUrl = await uploadMedia(window.currentAudioBlob, 'witness_audio', (progress) => {
                showToast(`📤 Audio Upload: ${progress}%`, "info");
            });
        }

        // 3. Construct Firestore Post Payload
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
        
        // Reset Form and State
        formElement.reset();
        window.clearMediaPreview?.();
        
        // Trigger feed reload if available
        if (typeof window.loadTestimonies === 'function') {
            window.loadTestimonies();
        }

    } catch (err) {
        console.error("Publishing failed:", err);
        showToast(`❌ Publishing failed: ${err.message}`, "error");
    } finally {
        if (publishBtn) {
            publishBtn.disabled = false;
            publishBtn.textContent = 'Publish Testimony';
        }
    }
}
