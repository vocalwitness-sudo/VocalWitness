// js/i18n.js - Advanced with Pluralization & Placeholder Support
let currentTranslations = {};
let currentLang = 'en';

const supportedLanguages = [
    { code: 'en', name: 'English', flag: '🇬🇧', native: 'English', rtl: false },
    { code: 'ha', name: 'Hausa', flag: '🇳🇬', native: 'Hausa', rtl: false },
    { code: 'ig', name: 'Igbo', flag: '🇳🇬', native: 'Igbo', rtl: false },
    { code: 'yo', name: 'Yorùbá', flag: '🇳🇬', native: 'Yorùbá', rtl: false },
    { code: 'pcm', name: 'Naija Pidgin', flag: '🇳🇬', native: 'Pidgin', rtl: false },
    { code: 'sw', name: 'Kiswahili', flag: '🇰🇪', native: 'Kiswahili', rtl: false },
    { code: 'fr', name: 'Français', flag: '🇫🇷', native: 'Français', rtl: false },
    { code: 'pt', name: 'Português', flag: '🇵🇹', native: 'Português', rtl: false },
    { code: 'es', name: 'Español', flag: '🇪🇸', native: 'Español', rtl: false },
    { code: 'ar', name: 'العربية', flag: '🇸🇦', native: 'العربية', rtl: true }
];

export async function loadTranslations(langCode = 'en') {
    try {
        const isSupported = supportedLanguages.some(l => l.code === langCode);
        if (!isSupported) langCode = 'en';

        const response = await fetch(`translations/${langCode}.json`);
        
        if (response.ok) {
            currentTranslations = await response.json();
            console.log(`✅ Loaded ${langCode} translations`);
        } else {
            currentTranslations = {};
        }
    } catch (e) {
        console.warn(`Failed to load ${langCode}`);
        currentTranslations = {};
    }

    currentLang = langCode;
    localStorage.setItem('preferredLang', langCode);
    applyTranslations();
    applyTextDirection(langCode);

    const lang = supportedLanguages.find(l => l.code === langCode);
    showToast(`🌍 ${lang ? lang.native : langCode} activated`, "success");
}

function applyTextDirection(langCode) {
    const lang = supportedLanguages.find(l => l.code === langCode);
    const isRTL = lang ? lang.rtl : false;
    document.documentElement.setAttribute('dir', isRTL ? 'rtl' : 'ltr');
    document.body.style.textAlign = isRTL ? 'right' : 'left';
}

// Advanced translation with pluralization and placeholders
export function t(key, params = {}) {
    let text = currentTranslations[key] || key;

    // Replace placeholders like {name}, {count}
    Object.keys(params).forEach(param => {
        const regex = new RegExp(`{${param}}`, 'g');
        text = text.replace(regex, params[param]);
    });

    // Simple pluralization (for English-style: count items)
    if (params.count !== undefined && currentTranslations[`${key}_plural`]) {
        const pluralKey = params.count === 1 ? key : `${key}_plural`;
        text = currentTranslations[pluralKey] || text;
    }

    return text;
}

function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (!key) return;

        const text = t(key, {
            count: el.dataset.count ? parseInt(el.dataset.count) : undefined
        });

        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            el.placeholder = text;
        } else {
            el.textContent = text;
        }
    });

    if (currentTranslations.pageTitle) document.title = currentTranslations.pageTitle;
}

export function initLanguage() {
    const selector = document.getElementById('languageSelector');
    const savedLang = localStorage.getItem('preferredLang') || 'en';

    if (selector) {
        selector.innerHTML = supportedLanguages.map(lang => `
            <option value="${lang.code}">${lang.flag} ${lang.native}</option>
        `).join('');
        selector.value = savedLang;

        selector.addEventListener('change', (e) => loadTranslations(e.target.value));
    }

    loadTranslations(savedLang);
}

export function changeLanguage(langCode) {
    loadTranslations(langCode);
}

window.initLanguage = initLanguage;
window.changeLanguage = changeLanguage;
window.t = t;  // Global translation helper
