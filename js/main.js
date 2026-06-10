import { db, storage } from "./firebase-config.js";
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



        // Profile & Verification
    const profileBtn = document.getElementById('btn-profile');
    const profilePage = document.getElementById('profilePage');
    const closeProfileBtn = document.getElementById('btn-close-profile');

    profileBtn?.addEventListener('click', () => {
        updateProfileUI();
        profilePage.classList.remove('hidden');
    });

    closeProfileBtn?.addEventListener('click', () => {
        profilePage.classList.add('hidden');
    });

// Update Profile UI with user data
function updateProfileUI() {
    const user = auth.currentUser;
    if (!user) return;

    document.getElementById('profile-username').textContent = user.displayName || "Anonymous User";
    document.getElementById('profile-email').textContent = user.email || "No email";

    const tierEl = document.getElementById('profile-tier');
    if (tierEl) {
        tierEl.textContent = isZKVerified ? "Witness • Tier 2" : "Citizen • Tier 0";
        tierEl.style.color = isZKVerified ? "#10b981" : "#eab308";
    }
}


    // Start Verification Button
    document.getElementById('vw-btn')?.addEventListener('click', startZKVerification);

    // New Profile Buttons
    document.getElementById('btn-change-password')?.addEventListener('click', () => {
        showToast("Password change coming in v2.1", "info");
    });

    document.getElementById('btn-logout')?.addEventListener('click', logout);


        
    // 2. Auth & Navigation
    document.getElementById('btn-login')?.addEventListener('click', googleLogin);
    document.getElementById('btn-logout')?.addEventListener('click', logout);
    document.getElementById('btn-profile')?.addEventListener('click', () => 
        document.getElementById('profilePage').classList.remove('hidden'));
    document.getElementById('btn-close-profile')?.addEventListener('click', () => 
        document.getElementById('profilePage').classList.add('hidden'));

    // 3. Verification Listeners
    document.getElementById('btn-invite')?.addEventListener('click', sendInvitation);
    document.getElementById('btn-redeem-invite')?.addEventListener('click', checkIncomingInvite);
    document.getElementById('vw-btn')?.addEventListener('click', startZKVerification);
    // Uncomment if needed:
    // document.getElementById('btn-phone-verify')?.addEventListener('click', startPhoneVerification);

    // 4. Ledger & Feed Interaction
    document.getElementById('postButton')?.addEventListener('click', postNow);
    document.getElementById('btn-vocaltruth')?.addEventListener('click', () => switchFeed('vocaltruth'));
    document.getElementById('btn-citizentalk')?.addEventListener('click', () => switchFeed('citizentalk'));
    document.getElementById('feed')?.addEventListener('click', (e) => {
        if (e.target.classList.contains('peer-vote-btn')) {
            submitPeerVote(e.target.getAttribute('data-post-id'), 'verify');
        }
    });

    // 5. Media & Utility
    document.getElementById('btn-photo')?.addEventListener('click', () => document.getElementById('imageInput').click());
    document.getElementById('imageInput')?.addEventListener('change', (e) => handleImageSelect(e, document.getElementById('previewArea')));
    document.getElementById('btn-voice')?.addEventListener('click', (e) => toggleVoiceRecording(e.target));
    document.getElementById('languageSelector')?.addEventListener('change', (e) => translateUIElements(e.target.value));

    // 6. Miscellaneous
    document.getElementById('btn-premium')?.addEventListener('click', () => showToast("Premium benefits..."));
    document.getElementById('btn-notifications')?.addEventListener('click', () => showToast("🔔 Notifications pane"));
    document.getElementById('btn-livearena')?.addEventListener('click', () => showToast("🎥 Live Arena — Coming v2.4"));
});
