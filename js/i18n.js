// js/i18n.js - Fixed & Robust Multi-Language Support
let currentTranslations = {};
let currentLang = 'en';

const supportedLanguages = [
    { code: 'en', name: 'English', flag: '🇬🇧', native: 'English' },
    { code: 'ig', name: 'Igbo', flag: '🇳🇬', native: 'Igbo' },
    { code: 'ha', name: 'Hausa', flag: '🇳🇬', native: 'Hausa' },
    { code: 'yo', name: 'Yorùbá', flag: '🇳🇬', native: 'Yorùbá' },
    { code: 'sw', name: 'Kiswahili', flag: '🇰🇪', native: 'Kiswahili' },
    { code: 'fr', name: 'Français', flag: '🇫🇷', native: 'Français' },
    { code: 'es', name: 'Español', flag: '🇪🇸', native: 'Español' },
    { code: 'ar', name: 'العربية', flag: '🇸🇦', native: 'العربية' },
    { code: 'pt', name: 'Português', flag: '🇵🇹', native: 'Português' }
];

export async function loadTranslations(langCode = 'en') {
    try {
        // Force fallback for unsupported/missing languages
        const isSupported = supportedLanguages.some(l => l.code === langCode);
        if (!isSupported) {
            langCode = 'en';
        }

        const response = await fetch(`translations/${langCode}.json`);

        if (response.ok) {
            currentTranslations = await response.json();
            console.log(`✅ Loaded ${langCode} translations successfully`);
        } else {
            console.warn(`⚠️ ${langCode}.json not found → using English fallback`);
            currentTranslations = {}; // Will use English text
        }
    } catch (e) {
        console.warn(`⚠️ Failed to load ${langCode}:`, e.message);
        currentTranslations = {};
    }

    currentLang = langCode;
    localStorage.setItem('preferredLang', langCode);
    applyTranslations();
}

function applyTranslations() {
    console.log("Applying translations for:", currentLang);

    // Main input placeholder
    const mainInput = document.getElementById('mainInput');
    if (mainInput) {
        mainInput.placeholder = currentTranslations.placeholder || 
            "Share your raw testimony... What did you witness?";
    }

    // All data-i18n elements
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
        selector.innerHTML = supportedLanguages
            .map(lang => `
                <option value="${lang.code}">
                    ${lang.flag} ${lang.name} (${lang.code.toUpperCase()})
                </option>
            `).join('');
        selector.value = savedLang;

        selector.addEventListener('change', (e) => {
            loadTranslations(e.target.value);
        });
    }

    // Silent load on startup
    loadTranslations(savedLang);
}

export function changeLanguage(langCode) {
    loadTranslations(langCode);
}

window.changeLanguage = changeLanguage;
