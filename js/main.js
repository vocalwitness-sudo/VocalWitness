import { googleLogin, logout, initAuth, sendPhoneVerification, verifyPhoneCode } from "./auth.js";
import { initFeed, switchFeed } from './feed.js'; // Ensure switchFeed is imported/defined
import { db } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage, changeLanguage } from './i18n.js';
import { handleImageSelect, toggleVoiceRecording, uploadForensicMedia, resetMediaState } from './media.js';
import { VocalWitnessEngine } from './engine.js';
import { state } from './storage.js';
import { generateAndDownloadPDF } from './pdf.js';
import { loadProfile } from './profile.js';
import { doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { auth } from './auth.js';

// --- Initialization ---
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
            } catch (err) { console.error("Language load failed:", err); }
        }
    });
    initFeed(db, 'citizen-talk');
    attachUIListeners();
}

// --- Logic Functions (Outside Listeners) ---
async function handlePostSubmission(button) {
    const isPremium = state?.user?.isPremium || false; 
    if (!isPremium) {
        showToast("Premium account required to post", "error");
        return;
    }
    // Add your post logic here
}

async function handlePhoneVerification() {
    const ui = document.getElementById('phone-verification-ui');
    if (ui) ui.classList.toggle('hidden');
}

async function handleSendOTP() {
    const countryCode = document.getElementById('country-code')?.value;
    const phoneInput = document.getElementById('phone-number')?.value?.trim();
    if (!phoneInput) return showToast("Enter phone number", "error");
    
    try {
        console.log("Attempting to send OTP to:", countryCode + phoneInput);
        const success = await sendPhoneVerification(countryCode + phoneInput);
        if (success) {
            showToast("OTP sent!", "success");
            // ... rest of your code
        }
    } catch (err) { 
        // THIS LOG WILL SHOW THE REAL ERROR
        console.error("DEBUG - OTP FAILED:", err); 
        showToast("Error: " + err.message, "error"); 
    }
}

async function handleVerifyOTP() {
    const code = document.getElementById('otp-input')?.value?.trim();
    if (!code || code.length !== 6) return showToast("Enter 6-digit OTP", "error");
    
    const success = await verifyPhoneCode(code);
    if (success) {
        showToast("✅ Verified!", "success");
        // Reset UI
        document.getElementById('phone-verification-ui')?.classList.add('hidden');
    }
}

// --- Event Listeners ---
function attachUIListeners() {
    document.addEventListener('click', async (event) => {
        const btn = event.target.closest('button');
        
        if (!btn) {
            console.log("Clicked something that isn't a button:", event.target);
            return;
        }

        console.log("Action button clicked:", btn.id || "No ID on button");

        // 1. Handle Navigation and Auth (ID-based)
        switch (btn.id) {
            case 'postButton': case 'postButton': 
                console.log("Post button detected!");
                await handlePostSubmission(btn); 
                break;
            case 'btn-post': await handlePostSubmission(btn); break;
            case 'btn-photo': triggerPhotoUpload(); break;
            case 'btn-voice': toggleVoiceRecording(btn); break;
            case 'btn-profile': showProfileSection(); break;
            case 'btn-close-profile': hideProfileSection(); break;
            case 'btn-verify-phone': handlePhoneVerification(); break;
            case 'btn-send-otp': handleSendOTP(); break;
            case 'btn-verify-otp': await handleVerifyOTP(); break;
            case 'btn-logout': logout(); break;
            case 'btn-witness-voice': switchFeed('witness-voice'); break;
            case 'btn-citizen-talk': switchFeed('citizen-talk'); break;
        }

        // 2. Handle Feed/Dynamic buttons (Data-Action based)
        const action = btn.getAttribute('data-action');
        if (action === 'peer-vote') {
            const id = btn.getAttribute('data-id');
            const type = btn.getAttribute('data-type');
            console.log(`Peer vote: ${type} on post ${id}`);
            await submitPeerVote(id, type); 
        }
    });
}

// ... rest of your functions (updatePostButton, switchFeed, bootstrap) ...
        // --- 2. Handle Feed/Dynamic buttons (Data-Action based) ---
        const action = btn.getAttribute('data-action');
        if (action === 'peer-vote') {
            const id = btn.getAttribute('data-id');
            const type = btn.getAttribute('data-type');
            console.log(`Peer vote: ${type} on post ${id}`);
            
            // Call your existing function (ensure it is imported)
            // You may need to import this from your db.js or utils.js
            await submitPeerVote(id, type); 
        }
    });
}
// --- Bootstrap ---
document.addEventListener('DOMContentLoaded', bootstrap);

document.addEventListener('click', (e) => {
    console.log("DEBUG: You clicked on element:", e.target);
    console.log("DEBUG: Is it a button?", e.target.closest('button') ? "YES" : "NO");
}, true);
