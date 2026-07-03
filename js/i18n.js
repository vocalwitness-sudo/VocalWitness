// js/i18n.js - Improved & Stable Version
let currentTranslations = {};
let currentLang = 'en';

const supportedLanguages = {
    en: "English (EN)",
    ha: "Hausa (HA)",
    yo: "Yorùbá (YO)",
    ig: "Igbo (IG)",
    sw: "Kiswahili (SW)"
    // ar: "العربية (AR)"  // Uncomment when Arabic is ready
};

export async function loadTranslations(langCode = 'en') {
    try {
        const response = await fetch(`translations/${langCode}.json`);
        if (response.ok) {
            currentTranslations = await response.json();
            console.log(`✅ Loaded ${langCode} translations`);
        } else {
            throw new Error(`Translation file not found for ${langCode}`);
        }
    } catch (e) {
        console.warn(`⚠️ Using English fallback for ${langCode}`);
        currentTranslations = {};
    }

    currentLang = langCode;
    localStorage.setItem('preferredLang', langCode);
    
    applyTranslations();
}

function applyTranslations() {
    // Handle placeholder
    const mainInput = document.getElementById('mainInput');
    if (mainInput && currentTranslations.placeholder) {
        mainInput.placeholder = currentTranslations.placeholder;
    }

    // Handle all data-i18n elements
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

        // Attach change listener
        selector.addEventListener('change', (e) => {
            loadTranslations(e.target.value);
        });
    }
    
    loadTranslations(savedLang);
}

export function changeLanguage(langCode) {
    if (supportedLanguages[langCode]) {
        loadTranslations(langCode);
    }
}

window.changeLanguage = changeLanguage;
