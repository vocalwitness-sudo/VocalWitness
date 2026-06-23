// js/main.js - MINIMAL WORKING VERSION
import { logout, initAuth } from "./auth.js";
import { initFeed, switchFeed } from './feed.js';
import { db } from './firebase-config.js';
import { showToast, submitPeerVote } from './utils.js';
import { initLanguage } from './i18n.js';
import { handleImageSelect, toggleVoiceRecording } from './media.js';
import { generateAndDownloadPDF } from './pdf.js';

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { auth } from './auth.js';

async function bootstrap() {
    console.log("🚀 Initializing VocalWitness...");

    initAuth();
    initLanguage();

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                const userRef = doc(db, "users", user.uid);
                const userSnap = await getDoc(userRef);
                if (userSnap.exists()) {
                    console.log("✅ User loaded:", user.email);
                }
            } catch (err) {
                console.error("User load error:", err);
            }
        }
    });

    initFeed(db, 'citizen-talk');
    attachUIListeners();
}

function attachUIListeners() {
    document.addEventListener('click', async (event) => {
        const btn = event.target.closest('button');
        if (!btn) return;

        console.log("✅ Button clicked:", btn.id || btn.textContent?.slice(0, 30));

        switch (btn.id) {
            case 'postButton':
            case 'btn-post':
                showToast("Post feature coming soon (Premium only)", "info");
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
                document.getElementById('profileSection').classList.remove('hidden');
                document.getElementById('homeSection').classList.add('hidden');
                break;
            case 'btn-close-profile':
                document.getElementById('profileSection').classList.add('hidden');
                document.getElementById('homeSection').classList.remove('hidden');
                break;
            case 'btn-witness-voice':
                switchFeed('witness-voice');
                break;
            case 'btn-citizen-talk':
                switchFeed('citizen-talk');
                break;
            case 'btn-logout':
                logout();
                break;
            case 'btn-download-pdf':
                generateAndDownloadPDF();
                break;
        }

        // Peer vote buttons
        const action = btn.getAttribute('data-action');
        if (action === 'peer-vote') {
            const id = btn.getAttribute('data-id');
            const type = btn.getAttribute('data-type');
            await submitPeerVote(id, type);
        }
    });
}

document.addEventListener('DOMContentLoaded', bootstrap);
