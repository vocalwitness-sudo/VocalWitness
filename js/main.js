// js/main.js - CLEAN & FIXED (No duplicate 'db')
import { logout, initAuth } from "./auth.js";
import { initFeed, switchFeed } from './feed.js';
import { db } from './firebase-config.js';           // ← Only ONE import
import { showToast, submitPeerVote } from './utils.js';
import { initLanguage } from './i18n.js';
import { handleImageSelect, toggleVoiceRecording } from './media.js';
import { generateAndDownloadPDF } from './pdf.js';

async function bootstrap() {
    console.log("🚀 Initializing VocalWitness...");

    initAuth();
    initLanguage();

    // Initialize Feed
    if (typeof initFeed === 'function' && db) {
        initFeed(db, 'citizen-talk');
    }

    attachUIListeners();
}

function attachUIListeners() {
    document.addEventListener('click', async (event) => {
        const btn = event.target.closest('button');
        if (!btn) return;

        console.log("✅ Button clicked:", btn.id || btn.textContent?.slice(0, 40));

        switch (btn.id) {
            case 'postButton':
            case 'btn-post':
                showToast("Post feature coming soon (Premium only)", "info");
                break;
            case 'btn-photo':
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.accept = 'image/*';
                fileInput.onchange = (e) => {
                    const preview = document.getElementById('preview-area');
                    if (preview) handleImageSelect(e, preview);
                };
                fileInput.click();
                break;
            case 'btn-voice':
                toggleVoiceRecording(btn);
                break;
            case 'btn-profile':
                document.getElementById('profileSection')?.classList.remove('hidden');
                document.getElementById('homeSection')?.classList.add('hidden');
                break;
            case 'btn-close-profile':
                document.getElementById('profileSection')?.classList.add('hidden');
                document.getElementById('homeSection')?.classList.remove('hidden');
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
            case 'btn-premium':
                document.getElementById('premiumModal')?.classList.remove('hidden');
                break;
            case 'btn-close-premium':
                document.getElementById('premiumModal')?.classList.add('hidden');
                break;
            case 'btn-upgrade-now':
            case 'btn-premium':
                handlePremiumUpgrade();
                break;
            case 'btn-live-arena':
                showToast("Live Arena coming soon...", "info");
                break;
        }

        // Peer vote buttons
        const action = btn.getAttribute('data-action');
        if (action === 'peer-vote') {
            const id = btn.getAttribute('data-id');
            const type = btn.getAttribute('data-type');
            await submitPeerVote(id, type);
        }

        async function handlePremiumUpgrade() {
    const user = auth.currentUser;
    if (!user) {
        alert("Please sign in first!");
        return;
    }

    const handler = PaystackPop.setup({
        key: 'pk_test_your_paystack_public_key_here', // ← Change to live key later
        email: user.email,
        amount: 4990, // ₦4,990
        currency: "NGN",
        ref: 'VW_' + Math.floor((Math.random() * 1000000000) + 1),
        callback: function(response) {
            console.log("✅ Payment successful:", response);
            alert("🎉 Premium Activated! Thank you.");
            // TODO: Update user.isPremium = true in Firestore
        },
        onClose: function() {
            console.log("Payment cancelled");
        }
    });
    
    handler.openIframe();
}
    });
}

// Close Premium Modal when clicking outside
document.addEventListener('click', (e) => {
    const modal = document.getElementById('premiumModal');
    if (e.target === modal) {
        modal.classList.add('hidden');
    }
});

document.addEventListener('DOMContentLoaded', bootstrap);
