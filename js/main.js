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



    document.addEventListener('DOMContentLoaded', () => {
    // 1. Initializations
    initLanguage();                    // ← ADD THIS LINE

    listenToLedgerFeed();
    populateCountryDropdown('languageSelector');
    showToast("⚡ VocalWitness Node Terminal Online");

        
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
