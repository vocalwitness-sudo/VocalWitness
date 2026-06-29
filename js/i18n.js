// js/i18n.js - Improved Version
let currentTranslations = {};
let currentLang = 'en';

const supportedLanguages = {
    en: "English (EN)",
    ha: "Hausa (HA)",
    yo: "Yorùbá (YO)",
    ig: "Igbo (IG)",
    sw: "Kiswahili (SW)",
    ar: "العربية (AR)"
};

const rtlLanguages = ['ar'];

export async function loadTranslations(langCode = 'en') {
    try {
        const response = await fetch(`translations/${langCode}.json`);
        if (response.ok) {
            currentTranslations = await response.json();
            console.log(`✅ Loaded ${langCode} translations`);
        } else {
            throw new Error();
        }
    } catch (e) {
        console.warn(`⚠️ Using fallback for ${langCode}`);
        currentTranslations = getFallbackTranslations();
    }

    currentLang = langCode;
    localStorage.setItem('preferredLang', langCode);
    
    applyTranslations();
    applyRTLSupport(langCode);
}

function getFallbackTranslations() {
    return {
        placeholder: "Share your raw testimony... What did you witness?",
        postButton: "🚀 Publish Testimony to the Square",
        citizenTalk: "Citizen Talk",
        trueWitness: "True Witness",
        liveArena: "Live Arena",
        profile: "Profile"
    };
}

function applyTranslations() {
    // Placeholders
    const mainInput = document.getElementById('mainInput');
    if (mainInput) mainInput.placeholder = currentTranslations.placeholder || mainInput.placeholder;

    // Buttons & Nav
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (currentTranslations[key]) el.textContent = currentTranslations[key];
    });
}

function applyRTLSupport(langCode) {
    const isRTL = rtlLanguages.includes(langCode);
    document.documentElement.setAttribute('dir', isRTL ? 'rtl' : 'ltr');
}

export function initLanguage() {
    const savedLang = localStorage.getItem('preferredLang') || 'en';
    const selector = document.getElementById('languageSelector');
    
    if (selector) {
        selector.innerHTML = Object.entries(supportedLanguages)
            .map(([code, name]) => `<option value="${code}">${name}</option>`)
            .join('');
        selector.value = savedLang;
    }
    
    loadTranslations(savedLang);
}

export async function changeLanguage(langCode) {
    if (!supportedLanguages[langCode]) return;
    await loadTranslations(langCode);
}
