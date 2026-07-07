// js/i18n.js - Enhanced with Flags + Phone Codes
let currentTranslations = {};
let currentLang = 'en';

const supportedLanguages = [
    { code: 'en', name: 'English', flag: '🇬🇧', native: 'English', phoneCode: '+44' },
    { code: 'ha', name: 'Hausa', flag: '🇳🇬', native: 'Hausa', phoneCode: '+234' },
    { code: 'yo', name: 'Yorùbá', flag: '🇳🇬', native: 'Yorùbá', phoneCode: '+234' },
    { code: 'ig', name: 'Igbo', flag: '🇳🇬', native: 'Igbo', phoneCode: '+234' },
    { code: 'sw', name: 'Kiswahili', flag: '🇰🇪', native: 'Kiswahili', phoneCode: '+254' },
    { code: 'fr', name: 'Français', flag: '🇫🇷', native: 'Français', phoneCode: '+33' },
    { code: 'es', name: 'Español', flag: '🇪🇸', native: 'Español', phoneCode: '+34' },
    { code: 'pt', name: 'Português', flag: '🇵🇹', native: 'Português', phoneCode: '+351' },
    { code: 'ar', name: 'العربية', flag: '🇸🇦', native: 'العربية', phoneCode: '+966' },
];

export async function loadTranslations(langCode = 'en') {
    try {
        const isSupported = supportedLanguages.some(l => l.code === langCode);
        if (!isSupported) langCode = 'en';

        const response = await fetch(`translations/${langCode}.json`);
        if (response.ok) {
            currentTranslations = await response.json();
            console.log(`✅ Loaded ${langCode} translations successfully`);
        } else {
            console.warn(`⚠️ ${langCode}.json not found, using English fallback`);
            currentTranslations = {};
        }
    } catch (e) {
        console.warn(`Failed to load ${langCode}`);
        currentTranslations = {};
    }

    currentLang = langCode;
    localStorage.setItem('preferredLang', langCode);
    applyTranslations();
}

function applyTranslations() {
    // Main input placeholder
    const mainInput = document.getElementById('mainInput');
    if (mainInput && currentTranslations.placeholder) {
        mainInput.placeholder = currentTranslations.placeholder;
    }

    // All elements with data-i18n
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (currentTranslations[key]) {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.placeholder = currentTranslations[key];
            } else {
                el.textContent = currentTranslations[key];
            }
        }
    });

    if (currentTranslations.pageTitle) {
        document.title = currentTranslations.pageTitle;
    }
}

export function initLanguage() {
    const selector = document.getElementById('languageSelector');
    const savedLang = localStorage.getItem('preferredLang') || 'en';

    if (selector) {
        selector.innerHTML = supportedLanguages.map(lang => `
            <option value="${lang.code}">
                ${lang.flag} ${lang.name}
            </option>
        `).join('');

        selector.value = savedLang;
        selector.addEventListener('change', (e) => {
            loadTranslations(e.target.value);
        });
    }

    // Load saved language silently
    loadTranslations(savedLang);
}

export function changeLanguage(langCode) {
    loadTranslations(langCode);
}

// Global access
window.changeLanguage = changeLanguage;
window.initLanguage = initLanguage;
