import { googleLogin, logout, initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db, storage } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage, changeLanguage } from './i18n.js';
import {
    handleImageSelect,
    toggleVoiceRecording,
    setEngine
} from './media.js';
import { VocalWitnessEngine } from './engine.js';
import { state } from './storage.js';
import { generateAndDownloadPDF } from './pdf.js';

let currentFeed = 'citizen-talk';
let engine = null;

// Main initialization
async function bootstrap() {
    try {
        console.log("🚀 Initializing VocalWitness...");
        initAuth();
        initLanguage();
        engine = new VocalWitnessEngine(db, storage);
        setEngine(engine);
        initFeed(db, currentFeed);
        attachUIListeners();
        console.log("✅ Core Loaded Successfully");
        showToast("Platform Ready");
    } catch (err) {
        console.error("Bootstrap error:", err);
        showToast("Initialization issue - check console", "error");
    }
}

function attachUIListeners() {
    console.log("🔗 Attaching event delegation...");

    // Event Delegation: Single listener for all UI interactions
    document.addEventListener('click', async (event) => {
        const btn = event.target.closest('button');
        if (!btn) return;

        switch(btn.id) {
            case 'btn-post':
                // Ensure this function is defined below in main.js
                await handlePostSubmission(); 
                break;

            case 'btn-photo':
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.onchange = (e) => handleImageSelect(e, document.getElementById('preview-area'));
                input.click();
                break;

            case 'btn-voice':
                toggleVoiceRecording(btn);
                break;

            case 'btn-witnessvoice':
                setActiveNav(btn);
                currentFeed = 'witness-voice';
                initFeed(db, currentFeed);
                showToast("👁️ Witness Voice Mode Activated");
                break;

            case 'btn-citizentalk':
                setActiveNav(btn);
                currentFeed = 'citizen-talk';
                initFeed(db, currentFeed);
                showToast("💬 Citizen Talk Mode Activated");
                break;

            case 'btn-profile':
                if (!state?.user) {
                    showToast("Please sign in first", "error");
                    googleLogin(); 
                    return; 
                }
                document.getElementById('homeSection').classList.remove('active');
                document.getElementById('profileSection').classList.add('active');
                updateProfileUI(state.user);
                break;

            case 'btn-close-profile':
                document.getElementById('profileSection').classList.remove('active');
                document.getElementById('homeSection').classList.add('active');
                break;

            case 'btn-download-pdf':
                if (!state?.user) return showToast("Please sign in first", "error");
                await generateAndDownloadPDF(state.user, db);
                break;

            case 'btn-logout':
                logout();
                break;
        }
    });

    document.addEventListener('change', (event) => {
        if (event.target.id === 'languageSelector') {
            changeLanguage(event.target.value);
        }
    });
}
// Helper to handle active state styling
function setActiveNav(activeBtn) {
    document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
    activeBtn.classList.add('active');
}

function updateProfileUI(user) {
    if (!user) return;

    document.getElementById('profile-username').textContent = user.displayName || "@citizen";
    document.getElementById('profile-email').textContent = user.email || "guest@vocalwitness.io";

    const isWitness = state?.isWitnessVerified || false;
    const btnLogout = document.getElementById('btn-logout');
    const btnVerifyPhone = document.getElementById('btn-verify-phone');
    const witnessActions = document.getElementById('witness-actions');

    if (btnLogout) btnLogout.style.display = 'block';
    if (btnVerifyPhone) btnVerifyPhone.style.display = isWitness ? 'none' : 'block';
    if (witnessActions) witnessActions.style.display = isWitness ? 'block' : 'none';
}

// Start the app
document.addEventListener('DOMContentLoaded', bootstrap);

// Add this helper to finish the logic for the Post button
async function handlePostSubmission() {
    if (!state?.user) return showToast("Please sign in to post", "error");
    // Add this inside handlePostSubmission
const postBtn = document.getElementById('btn-post');
if (postBtn) postBtn.disabled = true; // Disable to prevent double-click

try {
    // ... your logic ...
} finally {
    if (postBtn) postBtn.disabled = false; // Re-enable regardless of success/fail
}
    
    // Check if there is media to upload
    const previewArea = document.getElementById('preview-area');
    const hasMedia = previewArea && !previewArea.classList.contains('hidden');
    
    if (!hasMedia) return showToast("Please attach media first", "error");

    try {
        showToast("Uploading to ledger...");
        // 1. Upload to Firebase Storage and get URLs/Hashes
        const mediaData = await uploadForensicMedia(state.user.uid);
        
        // 2. Push to Firestore
        await addDoc(collection(db, "testimonies"), {
            ...mediaData,
            author: state.user.displayName,
            authorId: state.user.uid,
            timestamp: new Date().toISOString(),
            content: document.getElementById('post-text')?.value || ""
        });

        showToast("✅ Witness testimony secured!");
        resetMediaState();
    } catch (err) {
        console.error("Post error:", err);
        showToast("Post failed: " + err.message, "error");
    }
}
