// js/main.js - FIXED IMPORTS
import { googleLogin, logout, initAuth, sendPhoneVerification, verifyPhoneCode } from "./auth.js";
import { initFeed } from './feed.js';           // Removed switchFeed for now
import { db } from './firebase-config.js';
import { showToast, submitPeerVote } from './utils.js';
import { initLanguage, changeLanguage } from './i18n.js';
import { handleImageSelect, toggleVoiceRecording } from './media.js';
import { VocalWitnessEngine } from './engine.js';
import { state } from './storage.js';
import { generateAndDownloadPDF } from './pdf.js';

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { auth } from './auth.js';

let engineInstance = null;

async function bootstrap() {
    console.log("🚀 Initializing VocalWitness...");
    
    initAuth();
    initLanguage();
    
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                const userRef = doc(db, "users", user.uid);
                const userSnap = await getDoc(userRef);
                if (userSnap.exists() && userSnap.data().preferredLanguage) {
                    changeLanguage(userSnap.data().preferredLanguage);
                }
            } catch (err) {
                console.error("Language load failed:", err);
            }
        }
    });

    initFeed(db, 'citizen-talk');
    attachUIListeners();

    engineInstance = new VocalWitnessEngine();
    window.engineInstance = engineInstance;
}

// Handlers...
async function handlePostSubmission(button) {
    const isPremium = state?.user?.isPremium || false;
    if (!isPremium) {
        showToast("Premium account required to post", "error");
        return;
    }
    showToast("Post submitted (demo)", "success");
}

// ... (keep all other handlers the same: handlePhoneVerification, handleSendOTP, etc.)

// Main Click Handler
function attachUIListeners() {
    document.addEventListener('click', async (event) => {
        const btn = event.target.closest('button');
        if (!btn) return;

        console.log("✅ Button clicked:", btn.id || btn.textContent?.slice(0, 30));

        switch (btn.id) {
            case 'postButton':
            case 'btn-post':
                await handlePostSubmission(btn);
                break;
            case 'btn-photo':
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.accept = 'image/*';
                fileInput.onchange = (e) => handleImageSelect(e, document.getElementById('preview-area'));
                fileInput.click();
                break;
            case 'btn-voice':
                toggleVoiceRecording(btn);
                break;
            case 'btn-profile':
                if (typeof window.showProfileSection === 'function') {
                    window.showProfileSection();
                } else {
                    // Fallback
                    document.getElementById('profileSection')?.classList.remove('hidden');
                }
                break;
            case 'btn-close-profile':
                document.getElementById('profileSection')?.classList.add('hidden');
                break;
            case 'btn-verify-phone':
                // handlePhoneVerification();
                break;
            case 'btn-send-otp':
                // handleSendOTP();
                break;
            case 'btn-verify-otp':
                // await handleVerifyOTP();
                break;
            case 'btn-logout':
                logout();
                break;
            case 'btn-witness-voice':
            case 'btn-citizen-talk':
                // Simple reload for now
                location.reload();
                break;
            case 'btn-download-pdf':
                generateAndDownloadPDF();
                break;
        }

        const action = btn.getAttribute('data-action');
        if (action === 'peer-vote') {
            const id = btn.getAttribute('data-id');
            const type = btn.getAttribute('data-type');
            await submitPeerVote(id, type);
        }
    });
}

document.addEventListener('DOMContentLoaded', bootstrap);
