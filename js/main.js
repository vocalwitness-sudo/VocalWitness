import { db, storage } from "./firebase-config.js";
import { auth } from "./firebase-config.js";           // ← Added this line
import { googleLogin, logout } from "./auth.js";
import { listenToLedgerFeed, postNow, switchFeed, submitPeerVote } from "./feed.js";
import { handleImageSelect, toggleVoiceRecording } from "./media.js";
import { translateUIElements, initLanguage } from "./i18n.js";
import { VocalWitnessEngine } from "./engine.js";
import { showToast } from "./utils.js";
import {
    populateCountryDropdown,
    startZKVerification,
    startPhoneVerification,
    checkIncomingInvite,
    sendInvitation
} from "./verification.js";

// Initialize the engine once
const engine = new VocalWitnessEngine(db, storage);

// Update Profile UI with user data
function updateProfileUI() {
    const user = auth?.currentUser;
    if (!user) {
        document.getElementById('profile-username').textContent = "Not Logged In";
        document.getElementById('profile-email').textContent = "Please login first";
        return;
    }

    document.getElementById('profile-username').textContent = user.displayName || "Anonymous User";
    document.getElementById('profile-email').textContent = user.email || "No email";

    const tierEl = document.getElementById('profile-tier');
    if (tierEl) {
        tierEl.textContent = isZKVerified ? "Witness • Tier 2" : "Citizen • Tier 0";
        tierEl.style.color = isZKVerified ? "#10b981" : "#eab308";
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // 0. Initialize Language
    initLanguage();

    // 1. Initializations
    listenToLedgerFeed();
    populateCountryDropdown('languageSelector');
    showToast("⚡ VocalWitness Node Terminal Online");

    // 2. Auth & Navigation
    document.getElementById('btn-login')?.addEventListener('click', googleLogin);
    document.getElementById('btn-logout')?.addEventListener('click', logout);

    // Profile Page
    const profilePage = document.getElementById('profilePage');
    document.getElementById('btn-profile')?.addEventListener('click', () => {
        updateProfileUI();
        profilePage.classList.remove('hidden');
    });
    document.getElementById('btn-close-profile')?.addEventListener('click', () => {
        profilePage.classList.add('hidden');
    });

    // 3. Verification Listeners
    document.getElementById('btn-invite')?.addEventListener('click', sendInvitation);
    document.getElementById('btn-redeem-invite')?.addEventListener('click', checkIncomingInvite);
    document.getElementById('vw-btn')?.addEventListener('click', startZKVerification);

    // 4. Ledger & Feed Interaction
    document.getElementById('postButton')?.addEventListener('click', postNow);
    document.getElementById('btn-vocaltruth')?.addEventListener('click', () => switchFeed('vocaltruth'));
    document.getElementById('btn-citizentalk')?.addEventListener('click', () => switchFeed('citizentalk'));

    // 5. Media & Utility
    document.getElementById('btn-photo')?.addEventListener('click', () => document.getElementById('imageInput').click());
    document.getElementById('imageInput')?.addEventListener('change', (e) => handleImageSelect(e, document.getElementById('previewArea')));
    document.getElementById('btn-voice')?.addEventListener('click', (e) => toggleVoiceRecording(e.target));
    document.getElementById('languageSelector')?.addEventListener('change', (e) => translateUIElements(e.target.value));

    // 6. Miscellaneous
    document.getElementById('btn-premium')?.addEventListener('click', () => showToast("Premium benefits..."));
    document.getElementById('btn-notifications')?.addEventListener('click', () => showToast("🔔 Notifications pane"));
    document.getElementById('btn-livearena')?.addEventListener('click', () => showToast("🎥 Live Arena — Coming v2.4"));
    document.getElementById('btn-change-password')?.addEventListener('click', () => {
        showToast("Password change feature coming soon", "info");
    });
});
