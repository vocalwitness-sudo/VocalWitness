/**
 * VocalWitness Main Orchestrator
 * Centralizes initialization and binds modules to the global window scope
 */

import { db, storage } from "./firebase-config.js";
import { googleLogin, logout } from "./auth.js";
import { listenToLedgerFeed, postNow, switchFeed } from "./feed.js";
import { handleImageSelect, toggleVoiceRecording } from "./media.js";
import { translateUIElements } from "./i18n.js";
import { VocalWitnessEngine } from "./engine.js";

// Initialize Engine
export const witnessEngine = new VocalWitnessEngine(db, storage);

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Feed
    listenToLedgerFeed();
    
    // 2. Global Window Exposure (for HTML inline onclick handlers)
    window.googleLogin = googleLogin;
    window.logout = logout;
    window.postNow = postNow;
    window.switchFeed = switchFeed;
    window.toggleVoiceRecording = toggleVoiceRecording;

    // 3. Setup UI Event Listeners
    const langSelect = document.getElementById('languageSelector'); // Updated ID match
    if (langSelect) {
        langSelect.addEventListener('change', (e) => translateUIElements(e.target.value));
    }

    const imageInput = document.getElementById('imageInput');
    const previewArea = document.getElementById('previewArea');
    if (imageInput) {
        imageInput.addEventListener('change', (e) => handleImageSelect(e, previewArea));
    }
        
    const voiceBtn = document.getElementById('voiceBtn');
    if (voiceBtn) {
        voiceBtn.addEventListener('click', (e) => toggleVoiceRecording(e.target));
    }
    
    console.log("⚡ VocalWitness Node Terminal Online: Main Orchestrator Initialized");
});
