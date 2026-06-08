// js/main.js
import { db, storage } from "./firebase-config.js";
import { googleLogin, logout } from "./auth.js";
import { listenToLedgerFeed, postNow, switchFeed } from "./feed.js";
import { handleImageSelect, toggleVoiceRecording } from "./media.js";
import { translateUIElements } from "./i18n.js";
import { VocalWitnessEngine } from "./engine.js";

export const witnessEngine = new VocalWitnessEngine(db, storage);

document.addEventListener('DOMContentLoaded', () => {
    listenToLedgerFeed();
    
    // Bindings
    window.googleLogin = googleLogin;
    window.logout = logout;
    window.postNow = postNow;
    window.switchFeed = switchFeed;
    window.toggleVoiceRecording = toggleVoiceRecording;

    const langSelect = document.getElementById('languageSelector');
    if (langSelect) langSelect.addEventListener('change', (e) => translateUIElements(e.target.value));

    const imageInput = document.getElementById('imageInput');
    const previewArea = document.getElementById('previewArea');
    if (imageInput) imageInput.addEventListener('change', (e) => handleImageSelect(e, previewArea));
        
    const voiceBtn = document.getElementById('voiceBtn');
    if (voiceBtn) voiceBtn.addEventListener('click', (e) => toggleVoiceRecording(e.target));
    
    console.log("⚡ VocalWitness Node Terminal Online: Main Orchestrator Initialized");
});
