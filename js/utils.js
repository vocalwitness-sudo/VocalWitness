/**
 * VocalWitness Utilities Module
 * Handles Localization, Cryptographic Hashing, and UI Feedback
 */

import { showToast } from "./utils.js";

// Then just call it directly
showToast("Node Identity Synced.");

// 🌐 Multi-Language Dictionary (Keep as is)
export const translationDictionary = { /* ... */ };

/**
 * UI Feedback: Displays a temporary notification
 */
export function showToast(message, type = "success") {
    const toast = document.createElement('div');
    const bgColor = type === 'error' ? 'bg-red-600' : 'bg-emerald-600';
    toast.className = `fixed bottom-5 right-5 p-4 rounded-2xl shadow-2xl z-[100] text-white font-bold text-sm ${bgColor}`;
    toast.innerText = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

/**
 * Data Mode Toggle
 */
export function isLowDataMode() {
    return localStorage.getItem('lowDataMode') === 'true';
}

export function toggleLowDataMode() {
    const current = isLowDataMode();
    localStorage.setItem('lowDataMode', !current);
    location.reload();
}

/**
 * Cryptographic Hash Generator (for Files)
 */
export async function generateSha256Hash(fileOrString) {
    const data = (typeof fileOrString === 'string') 
        ? new TextEncoder().encode(fileOrString) 
        : await fileOrString.arrayBuffer();
        
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Live DOM Translation Engine
 */
export function translateUIElements(langCode) {
    const lexicon = translationDictionary[langCode];
    if (!lexicon) return;

    const mappings = {
        'privacy-notice-text': lexicon.privacyWarning,
        'security-upgrade-text': lexicon.upgradeSecurity,
        'settings-dashboard-text': lexicon.settingsDashboard,
        'logout-action-text': lexicon.logoutBtn
    };

    Object.keys(mappings).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = mappings[id];
    });
}
