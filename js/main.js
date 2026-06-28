// js/main.js - Updated for Multi-Page + Guardian Witness
import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage } from './i18n.js';
import { handleImageSelect, toggleVoiceRecording } from './media.js';

// Detect current page
function getCurrentPage() {
    const path = window.location.pathname;
    if (path.includes('true-witness')) return 'true-witness';
    if (path.includes('live-arena')) return 'live-arena';
    return 'citizen-talk'; // default
}

// ====================== NAVIGATION ======================
function highlightActiveNav() {
    const current = getCurrentPage();
    document.querySelectorAll('#main-nav a').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href').includes(current)) {
            link.classList.add('active');
        }
    });
}

// ====================== GUARDIAN WITNESS FUNCTIONS ======================
function showGuardianModal() {
    document.getElementById('guardianModal')?.classList.remove('hidden');
}

function hideGuardianModal() {
    document.getElementById('guardianModal')?.classList.add('hidden');
}

function activateGuardianWitness() {
    // TODO: Connect to your backend / payment logic here
    showToast("🛡️ Activating Guardian Witness...", "info");
    
    // Simulate activation (replace with real logic later)
    setTimeout(() => {
        showToast("✅ You are now a Guardian Witness! Welcome to the higher responsibility.", "success");
        hideGuardianModal();
        
        // You can add UI refresh here later (show guardian badge, unlock features, etc.)
    }, 1500);
}

// ====================== PUBLISH & OTHER FUNCTIONS ======================
async function publishTestimony() {
    const textarea = document.getElementById('mainInput');
    const text = textarea?.value.trim();
    if (!text || text.length < 10) {
        showToast("Please write a proper testimony (min 10 characters)", "error");
        return;
    }
    showToast("Publishing to the Square...", "info");
    try {
        console.log("📤 Publishing testimony:", text);
        showToast("✅ Testimony published successfully!", "success");
        if (textarea) textarea.value = '';
    } catch (err) {
        console.error(err);
        showToast("Failed to publish. Please try again.", "error");
    }
}

// ====================== CLICK HANDLER ======================


        document.addEventListener('click', (e) => {
    if (e.target.classList.contains('verify-btn')) {
        const id = e.target.dataset.id;
        submitPeerVote(id, 'verify');
    }
});
        
        console.log("🖱️ Clicked:", btn.id || btn.textContent.trim());

        // Existing buttons
        if (btn.id === 'btn-profile') showProfileSection();
        if (btn.id === 'btn-close-profile') hideProfileSection();
        
        if (btn.id === 'btn-photo') {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = (ev) => handleImageSelect(ev, document.getElementById('preview-area'));
            input.click();
        }
        
        if (btn.id === 'btn-voice') toggleVoiceRecording(btn);
        if (btn.id === 'postButton') publishTestimony();

        // === NEW GUARDIAN WITNESS HANDLERS ===
        if (btn.id === 'btn-guardian') {
            showGuardianModal();
        }
        
        if (btn.id === 'btn-activate-guardian') {
            activateGuardianWitness();
        }
        
        if (btn.id === 'btn-close-guardian') {
            hideGuardianModal();
        }
    });
}

// ====================== BOOTSTRAP ======================
async function bootstrap() {
    console.log("🚀 Initializing VocalWitness...");
    try {
        await initAuth();
        initLanguage();
        attachUIListeners();
        highlightActiveNav();
        
        const currentPage = getCurrentPage();
        console.log(`✅ Loaded ${currentPage} mode`);
       
        if (typeof initFeed === 'function') {
            initFeed(db, currentPage);
        }
       
        console.log("✅ VocalWitness Core Loaded Successfully");
    } catch (error) {
        console.error("❌ Bootstrap failed:", error);
    }
}

document.addEventListener('DOMContentLoaded', bootstrap);
