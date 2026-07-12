// js/main.js - CLEAN FINAL PRODUCTION
import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db, auth, storage } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage } from './i18n.js';
import * as mediaModule from './media.js';
import { CitizenTalkEngine } from '../vocalWitnessEngine.js';
import { recordTestimonyContribution } from './dao.js';

// GLOBAL STATE
let engineInstance = null;

// DOOR SWITCHER
window.showDoorSwitcher = function() {
    const doorEl = document.getElementById('door-name');
    if (!doorEl) return;
    const doors = ["Public Square", "Citizen Talk", "True Witness", "Live Arena", "Groups"];
    let idx = doors.indexOf(doorEl.textContent.trim());
    if (idx === -1) idx = 0;
    const next = doors[(idx + 1) % doors.length];
    doorEl.textContent = next;
    showToast(`🚪 Switched to ${next}`, "success");
};

// NAVIGATION
window.navigateToPage = (page) => {
    window.location.href = page;
};

window.loadFeed = (feedType) => {
    console.log("Loading feed:", feedType);
    initFeed(db, feedType || 'citizen-talk');
};

// PUBLISH TESTIMONY (keep your full function here)
window.publishTestimony = async () => {
    const textarea = document.getElementById('mainInput');
    const content = textarea?.value.trim() || "";
    if (!content) return showToast("Please write something", "error");

    const postBtn = document.getElementById('postButton');
    postBtn.disabled = true;
    postBtn.textContent = 'Publishing...';

    try {
        await recordTestimonyContribution();
        showToast("✅ Testimony published!", "success");
        textarea.value = '';
    } catch (err) {
        showToast("Failed to publish", "error");
    } finally {
        postBtn.disabled = false;
        postBtn.textContent = 'Publish Testimony to the Square';
    }
};

// SUPPORT MODAL
window.showSupportModal = () => {
    document.getElementById('supportModal')?.classList.remove('hidden');
};

// SETUP
function setupEventListeners() {
    document.getElementById('btn-photo')?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.click();
    });
    document.getElementById('postButton')?.addEventListener('click', window.publishTestimony);
}

// BOOTSTRAP
async function bootstrap() {
    try {
        await initAuth();
        initLanguage();
        engineInstance = new CitizenTalkEngine(db, storage);
        window.engineInstance = engineInstance;
        setupEventListeners();
        setTimeout(() => loadFeed('citizen-talk'), 800);
        console.log("✅ VocalWitness LIVE & READY");
    } catch (e) {
        console.error("Bootstrap error:", e);
    }
}

document.addEventListener('DOMContentLoaded', bootstrap);
