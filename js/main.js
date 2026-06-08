import { db, storage } from "./firebase-config.js";
import { googleLogin, logout } from "./auth.js";
import { listenToLedgerFeed, postNow, switchFeed } from "./feed.js";
import { handleImageSelect, toggleVoiceRecording } from "./media.js";
import { translateUIElements } from "./i18n.js";
import { VocalWitnessEngine } from "./engine.js";
import { showToast } from "./utils.js";
import { populateCountryDropdown } from "./verification.js";

export const witnessEngine = new VocalWitnessEngine(db, storage);

document.addEventListener('DOMContentLoaded', () => {
    listenToLedgerFeed();
    
    // Bind functions to window so HTML buttons work
    window.googleLogin = googleLogin;
    window.logout = logout;
    window.postNow = postNow;
    window.switchFeed = switchFeed;
    window.toggleVoiceRecording = toggleVoiceRecording;
    window.showToast = showToast;
    window.triggerImageUpload = () => document.getElementById('imageInput').click();
    
    // Global UI State Triggers
    window.showProfile = () => document.getElementById('profilePage').classList.remove('hidden');
    window.showEarnModal = () => document.getElementById('earnModal').classList.remove('hidden');
    window.showSettings = () => document.getElementById('settingsModal').classList.remove('hidden');
    window.closeModal = (id) => document.getElementById(id).classList.add('hidden');
    
    // Feature Toasts
    window.showNotifications = () => showToast("🔔 Notifications pane updating.");
    window.showLiveArena = () => showToast("🎥 Live Arena — Scheduled for v2.4.");

    // Initialization
    populateCountryDropdown('languageSelector');
    showToast("⚡ VocalWitness Node Terminal Online");

    // Event Listeners
    document.getElementById('languageSelector')?.addEventListener('change', (e) => translateUIElements(e.target.value));
    document.getElementById('imageInput')?.addEventListener('change', (e) => handleImageSelect(e, document.getElementById('previewArea')));
    document.getElementById('voiceBtn')?.addEventListener('click', (e) => toggleVoiceRecording(e.target));
});
