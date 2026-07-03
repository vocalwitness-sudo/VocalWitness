// js/i18n.js - Full Multi-Language Support
let currentTranslations = {};
let currentLang = 'en';

const supportedLanguages = {
    en: "English (EN)",
    ig: "Igbo (IG)",
    ha: "Hausa (HA)",
    yo: "Yorùbá (YO)",
    sw: "Kiswahili (SW)",
    fr: "Français (FR)",
    es: "Español (ES)",
    ar: "العربية (AR)",
    pt: "Português (PT)"
};

export async function loadTranslations(langCode = 'en') {
    try {
        const response = await fetch(`translations/${langCode}.json`);
        if (response.ok) {
            currentTranslations = await response.json();
            console.log(`✅ Loaded ${langCode} translations successfully`);
        } else {
            throw new Error(`File not found: translations/${langCode}.json`);
        }
    } catch (e) {
        console.warn(`⚠️ Could not load ${langCode}, using English fallback`);
        currentTranslations = {};
    }

    currentLang = langCode;
    localStorage.setItem('preferredLang', langCode);
    
    applyTranslations();
}

function applyTranslations() {
    console.log("Applying translations for:", currentLang);

    const mainInput = document.getElementById('mainInput');
    if (mainInput && currentTranslations.placeholder) {
        mainInput.placeholder = currentTranslations.placeholder;
    }

    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (currentTranslations[key]) {
            el.textContent = currentTranslations[key];
        }
    });
}

export function initLanguage() {
    const savedLang = localStorage.getItem('preferredLang') || 'en';
    const selector = document.getElementById('languageSelector');
    
    if (selector) {
        selector.innerHTML = Object.entries(supportedLanguages)
            .map(([code, name]) => `<option value="${code}">${name}</option>`)
            .join('');
        selector.value = savedLang;

        selector.onchange = function() {
            loadTranslations(this.value);
        };
    }
    
    loadTranslations(savedLang);
}

export function changeLanguage(langCode) {
    if (supportedLanguages[langCode]) {
        loadTranslations(langCode);
    }
}

window.changeLanguage = changeLanguage;
