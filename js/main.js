// js/main.js - Clean & Stable
import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db, auth } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage } from './i18n.js';
import * as mediaModule from './media.js';
import { initiatePlatformSupport } from './supporters.js';

let engineInstance = null;

async function bootstrap() {
    try {
        await initAuth();
        initLanguage();

        // Initialize other modules...
        engineInstance = new CitizenTalkEngine(db, storage); // if needed
        window.engineInstance = engineInstance;
        mediaModule.setEngine(engineInstance);

        setupEventListeners();
        
        // Load feed with small delay to prevent shift
        setTimeout(() => window.loadFeed('citizen-talk'), 400);
        
    } catch (e) {
        console.error(e);
        showToast("Failed to load app", "error");
    }
}

function setupEventListeners() {
    document.getElementById('btn-photo')?.addEventListener('click', () => {
        // photo handler
    });
    
    document.getElementById('btn-voice')?.addEventListener('click', mediaModule.toggleVoiceRecording);
    document.getElementById('postButton')?.addEventListener('click', window.publishTestimony);
}

window.loadFeed = (feedType) => { /* your existing logic */ };
window.publishTestimony = async () => { /* your existing logic */ };
window.showSupportersModal = () => { /* ... */ };
window.showProfile = () => { /* ... */ };
window.initiatePlatformSupport = initiatePlatformSupport;

// Start the app
document.addEventListener('DOMContentLoaded', bootstrap);
