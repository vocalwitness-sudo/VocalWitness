// js/i18n.js
/**
 * Advanced Dynamic Internationalization System
 * - JSON-based loading
 * - Full RTL Support (Arabic, Hebrew)
 * - Fallback system
 * - Auto language selector population
 */

let currentTranslations = {};
let currentLang = 'en';

const supportedLanguages = {
    en: "English (EN)",
    fr: "Français (FR)",
    es: "Español (ES)",
    ha: "Hausa (HA)",
    yo: "Yorùbá (YO)",
    ig: "Igbo (IG)",
    sw: "Kiswahili (SW)",
    zu: "isiZulu (ZU)",
    pt: "Português (PT)",
    ar: "العربية (AR)",
    he: "עברית (HE)"
};

const rtlLanguages = ['ar', 'he'];

export async function loadTranslations(langCode = 'en') {
    try {
        const response = await fetch(`translations/${langCode}.json`);
        if (response.ok) {
            currentTranslations = await response.json();
            console.log(`✅ Loaded ${langCode} translations from JSON`);
        } else {
            throw new Error('JSON not found');
        }
    } catch (e) {
        console.warn(`⚠️ Falling back to embedded translations for ${langCode}`);
        currentTranslations = getEmbeddedTranslations(langCode);
    }

    currentLang = langCode;
    localStorage.setItem('preferredLang', langCode);
    
    applyTranslations();
    applyRTLSupport(langCode);
    
    return currentTranslations;
}

function getEmbeddedTranslations(lang) {
    // Minimal fallback - full translations are in JSON files
    return {
        privacyWarning: "VocalWitness functions strictly as an un-manipulated decentralized distribution medium.",
        placeholder: "Provide raw description...",
        postButton: "Publish to Decentralized Ledger",
        witnessVoice: "Witness Voice",
        citizenTalk: "Citizen Talk",
        liveArena: "Live Arena",
        profile: "Profile",
        activeLanguage: supportedLanguages[lang] || "English (EN)"
    };
}

function applyTranslations() {
    // Main composer
    const mainInput = document.getElementById('mainInput');
    const postButton = document.getElementById('postButton');
    if (mainInput) mainInput.placeholder = currentTranslations.placeholder || "Provide raw description...";
    if (postButton) postButton.textContent = currentTranslations.postButton || "Publish to Decentralized Ledger";

    // Navigation
    const navButtons = document.querySelectorAll('.nav-btn');
    if (navButtons[0]) navButtons[0].textContent = currentTranslations.witnessVoice || "Witness Voice";
    if (navButtons[1]) navButtons[1].textContent = currentTranslations.citizenTalk || "Citizen Talk";
    if (navButtons[2]) navButtons[2].textContent = currentTranslations.liveArena || "Live Arena";

    // Profile
    const profileBtn = document.getElementById('btn-profile');
    if (profileBtn) profileBtn.textContent = currentTranslations.profile || "Profile";

    const activeBadge = document.getElementById('activeLanguageDisplay');
    if (activeBadge) activeBadge.textContent = currentTranslations.activeLanguage || "English (EN)";

    window.dispatchEvent(new CustomEvent('language-changed', { detail: { lang: currentLang } }));
}

function applyRTLSupport(langCode) {
    const isRTL = rtlLanguages.includes(langCode);
    document.documentElement.setAttribute('dir', isRTL ? 'rtl' : 'ltr');
    
    const container = document.querySelector('.max-w-2xl');
    if (container) container.style.textAlign = isRTL ? 'right' : 'left';
}

/**
 * Initialize i18n
 */
export function initLanguage() {
    const savedLang = localStorage.getItem('preferredLang') || 'en';
    
    const langSelect = document.getElementById('languageSelector');
    if (langSelect) {
        langSelect.innerHTML = Object.entries(supportedLanguages)
            .map(([code, name]) => `<option value="${code}">${name}</option>`)
            .join('');
        langSelect.value = savedLang;
    }

    loadTranslations(savedLang);
}

/**
 * Change language
 */
export async function changeLanguage(langCode) {
    if (!supportedLanguages[langCode]) return;
    await loadTranslations(langCode);
}
