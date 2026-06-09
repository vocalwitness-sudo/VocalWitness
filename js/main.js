import { db, storage } from "./firebase-config.js";
import { googleLogin, logout } from "./auth.js";
import { listenToLedgerFeed, postNow, switchFeed } from "./feed.js";
import { handleImageSelect, toggleVoiceRecording } from "./media.js";
import { translateUIElements } from "./i18n.js";
import { VocalWitnessEngine } from "./engine.js";
import { showToast } from "./utils.js";
import { 
    populateCountryDropdown, 
    startZKVerification, 
    startPhoneVerification,
    checkIncomingInvite,
    sendInvitation
} from "./verification.js";

export const witnessEngine = new VocalWitnessEngine(db, storage);

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initializations
    listenToLedgerFeed();
    populateCountryDropdown('languageSelector');
    showToast("⚡ VocalWitness Node Terminal Online");

    // In main.js - DOMContentLoaded
document.getElementById('language-select')?.addEventListener('change', (e) => {
    changeLanguage(e.target.value);
});

    // In main.js
const engine = new VocalWitnessEngine(db, storage);

// When a button is clicked
document.getElementById('recordBtn').addEventListener('click', () => {
    engine.startVoiceRecording('citizen-talk');
});

    
    // Add this to your main.js
document.getElementById('feed').addEventListener('click', (e) => {
    if (e.target.classList.contains('peer-vote-btn')) {
        const postId = e.target.getAttribute('data-post-id');
        submitPeerVote(postId, 'verify');
    }
});

    // In main.js - DOMContentLoaded block
document.getElementById('btn-login')?.addEventListener('click', googleLogin);
document.getElementById('btn-logout')?.addEventListener('click', logout);

// Add these to your DOMContentLoaded listener in main.js:
document.getElementById('btn-invite')?.addEventListener('click', sendInvitation);
document.getElementById('btn-redeem-invite')?.addEventListener('click', checkIncomingInvite);
document.getElementById('vw-btn')?.addEventListener('click', startZKVerification);
// If you have a phone button:
// document.getElementById('btn-phone-verify')?.addEventListener('click', startPhoneVerification);
    
    // 2. Button Event Listeners (The "Bridge" solution)
    
    // Auth & Navigation
    document.getElementById('btn-profile')?.addEventListener('click', () => 
        document.getElementById('profilePage').classList.remove('hidden'));
        
    document.getElementById('btn-close-profile')?.addEventListener('click', () => 
        document.getElementById('profilePage').classList.add('hidden'));

    document.getElementById('btn-premium')?.addEventListener('click', () => showToast("Premium benefits..."));
    document.getElementById('btn-notifications')?.addEventListener('click', () => showToast("🔔 Notifications pane updating."));
    document.getElementById('btn-livearena')?.addEventListener('click', () => showToast("🎥 Live Arena — Scheduled for v2.4."));
    
    // Ledger Interaction
    document.getElementById('postButton')?.addEventListener('click', postNow);
    document.getElementById('btn-vocaltruth')?.addEventListener('click', () => switchFeed('vocaltruth'));
    document.getElementById('btn-citizentalk')?.addEventListener('click', () => switchFeed('citizentalk'));
    
    // Verification
    document.getElementById('vw-btn')?.addEventListener('click', startZKVerification);
    
    // Media & Inputs
    document.getElementById('btn-photo')?.addEventListener('click', () => document.getElementById('imageInput').click());
    document.getElementById('imageInput')?.addEventListener('change', (e) => handleImageSelect(e, document.getElementById('previewArea')));
    document.getElementById('btn-voice')?.addEventListener('click', (e) => toggleVoiceRecording(e.target));
    document.getElementById('languageSelector')?.addEventListener('change', (e) => translateUIElements(e.target.value));

    // Modals
    // Add similar listeners for settings/earn modals as needed...
});
