import { 
    populateCountryDropdown, 
    startZKVerification, 
    startPhoneVerification,
    checkIncomingInvite,
    sendInvitation
} from "./verification.js";
import { db, storage } from "./firebase-config.js";
import { googleLogin, logout } from "./auth.js";
import { listenToLedgerFeed, postNow, switchFeed } from "./feed.js";
import { handleImageSelect, toggleVoiceRecording } from "./media.js";
import { translateUIElements } from "./i18n.js";
import { VocalWitnessEngine } from "./engine.js";
import { showToast } from "./utils.js";

// Now you can use it!
async function readMetadata(file) {
    let output = await exifr.parse(file);
    console.log('EXIF data:', output);
}

export const witnessEngine = new VocalWitnessEngine(db, storage);

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initializations
    listenToLedgerFeed();
    populateCountryDropdown('languageSelector');
    showToast("⚡ VocalWitness Node Terminal Online");

    // 2. Window Bindings (Functions available to HTML buttons)
    window.googleLogin = googleLogin;
    window.logout = logout;
    window.postNow = postNow;
    window.switchFeed = switchFeed;
    window.toggleVoiceRecording = toggleVoiceRecording;
    window.showToast = showToast;
    window.startZKVerification = startZKVerification;
    window.startPhoneVerification = startPhoneVerification;
    
    window.triggerImageUpload = () => document.getElementById('imageInput').click();
    
    // 3. UI State Triggers
    window.showProfile = () => document.getElementById('profilePage').classList.remove('hidden');
    window.showEarnModal = () => document.getElementById('earnModal').classList.remove('hidden');
    window.showSettings = () => document.getElementById('settingsModal').classList.remove('hidden');
    window.closeModal = (id) => document.getElementById(id).classList.add('hidden');
    
    window.showNotifications = () => showToast("🔔 Notifications pane updating.");
    window.showLiveArena = () => showToast("🎥 Live Arena — Scheduled for v2.4.");

    // 4. Event Listeners
    document.getElementById('languageSelector')?.addEventListener('change', (e) => translateUIElements(e.target.value));
    document.getElementById('imageInput')?.addEventListener('change', (e) => handleImageSelect(e, document.getElementById('previewArea')));
    document.getElementById('voiceBtn')?.addEventListener('click', (e) => toggleVoiceRecording(e.target));
});
