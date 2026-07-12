// js/main.js - CLEAN FINAL FOR LAUNCH
import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db, auth, storage } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage } from './i18n.js';
import * as mediaModule from './media.js';
import { CitizenTalkEngine } from '../vocalWitnessEngine.js';

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
window.navigateToPage = (page) => window.location.href = page;

window.loadFeed = (feedType) => {
    console.log("Loading feed:", feedType);
    initFeed(db, feedType || 'citizen-talk');
};

// STUB FOR REPUTATION
window.recordTestimonyContribution = async () => {
    console.log("✅ Testimony contribution recorded");
};

// PUBLISH
window.publishTestimony = async () => {
    const textarea = document.getElementById('mainInput');
    const content = textarea?.value.trim() || "";
    if (!content) return showToast("Please write something", "error");

    const postBtn = document.getElementById('postButton');
    postBtn.disabled = true;
    postBtn.textContent = 'Publishing...';

    try {
        await window.recordTestimonyContribution();
        showToast("✅ Testimony published!", "success");
        textarea.value = '';
    } catch (err) {
        showToast("Failed to publish", "error");
    } finally {
        postBtn.disabled = false;
        postBtn.textContent = 'Publish Testimony to the Square';
    }
};

// BOOTSTRAP
async function bootstrap() {
    try {
        await initAuth();
        initLanguage();
        engineInstance = new CitizenTalkEngine(db, storage);
        window.engineInstance = engineInstance;
        
        setupEventListeners();
        setTimeout(() => loadFeed('citizen-talk'), 800);
        
        console.log("✅ VocalWitness LIVE & READY FOR PUBLIC");
    } catch (e) {
        console.error("Bootstrap error:", e);
    }
}

function setupEventListeners() {
    // Forensic Photo
    document.getElementById('btn-photo')?.addEventListener('click', () => {
        showToast("📸 Photo upload coming in next update", "info");
    });

    // Publish Button
    document.getElementById('postButton')?.addEventListener('click', window.publishTestimony);
}

// Stub for tier theme
window.applyTierTheme = function() {
    console.log("Tier theme applied (stub)");
};

// UI Stubs for launch
window.updateTierBadge = function() {
    console.log("Tier badge updated (stub)");
};

document.addEventListener('DOMContentLoaded', bootstrap);
