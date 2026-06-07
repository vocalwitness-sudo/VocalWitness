import { googleLogin, logout } from "./auth.js";
import { listenToLedgerFeed, postNow } from "./feed.js";
import { handleImageSelect, toggleVoiceRecording } from "./media.js";
import { translateUIElements } from "./i18n.js";

document.addEventListener('DOMContentLoaded', () => {
    // 1. Start App
    listenToLedgerFeed();
    
    // 2. Setup Language Switcher
    const langSelect = document.getElementById('language-select');
    if (langSelect) {
        langSelect.addEventListener('change', (e) => translateUIElements(e.target.value));
    }

    // 3. Setup Media Events
    const imageInput = document.getElementById('imageInput');
    const previewArea = document.getElementById('previewArea');
    if (imageInput) imageInput.addEventListener('change', (e) => handleImageSelect(e, previewArea));
        
    const voiceBtn = document.getElementById('voiceBtn');
    if (voiceBtn) voiceBtn.addEventListener('click', (e) => toggleVoiceRecording(e.target));

    // 4. Expose Auth/Post to Global Window (for HTML onclick handlers)
    window.googleLogin = googleLogin;
    window.logout = logout;
    window.postNow = postNow;
});
