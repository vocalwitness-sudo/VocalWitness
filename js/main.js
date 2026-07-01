// js/main.js - FIXED VERSION (Firebase v11 compatible)
import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db, storage } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage } from './i18n.js';
import * as media from './media.js';
import { CitizenTalkEngine } from '../vocalWitnessEngine.js';

let engineInstance = null;
let currentUser = null;

window.loadFeed = (feedType) => {
    document.querySelectorAll('#main-nav button').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`[data-feed="${feedType}"]`);
    if (btn) btn.classList.add('active');
    initFeed(db, feedType);
};

window.publishTestimony = async () => {
    const user = currentUser || (await import('./auth.js')).getCurrentUser?.();
    if (!user) return showToast("Sign in first", "error");

    const content = document.getElementById('mainInput')?.value.trim() || "";
    if (!content && !window.selectedImageFile && !engineInstance?.currentAudioBlob) {
        return showToast("Add text/photo/voice", "error");
    }

    const btn = document.getElementById('postButton');
    btn.disabled = true;
    btn.textContent = "Publishing...";

    try {
        const mediaData = await media.uploadForensicMedia(user.uid);
        const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js");
        
        await addDoc(collection(db, "testimonies"), {
            authorId: user.uid,
            author: user.displayName || "Witness",
            content,
            imageUrl: mediaData.imageUrl,
            audioUrl: mediaData.audioUrl,
            timestamp: new Date().toISOString(),
            feedVisibility: "citizen-talk",
            likes: 0,
            disputes: 0
        });

        showToast("✅ Published!", "success");
        document.getElementById('mainInput').value = '';
        media.resetMediaState();
        window.loadFeed('citizen-talk');
    } catch (e) {
        console.error(e);
        showToast("Publish failed", "error");
    } finally {
        btn.disabled = false;
        btn.textContent = "🚀 Publish Testimony to the Square";
    }
};

async function bootstrap() {
    console.log("🚀 VocalWitness Starting...");
    await initAuth();
    initLanguage();
    
    engineInstance = new CitizenTalkEngine(db, storage);
    window.engineInstance = engineInstance;
    media.setEngine(engineInstance);

    // Attach all listeners
    document.getElementById('btn-photo')?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = 'image/*';
        input.onchange = e => media.handleImageSelect(e, document.getElementById('preview-area'));
        input.click();
    });

    document.getElementById('btn-voice')?.addEventListener('click', e => media.toggleVoiceRecording(e.currentTarget));
    document.getElementById('postButton')?.addEventListener('click', window.publishTestimony);

    setTimeout(() => window.loadFeed('citizen-talk'), 500);
}

document.addEventListener('DOMContentLoaded', bootstrap);

// Global helpers for HTML onclicks
window.showProfileSection = () => document.getElementById('profileModal')?.classList.remove('hidden');
window.closeProfile = () => document.getElementById('profileModal')?.classList.add('hidden');
