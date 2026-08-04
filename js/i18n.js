// js/i18n.js - Final Production Version (Nested Keys + Input Support)
let currentTranslations = {};
let fallbackTranslations = {};
let currentLang = 'en';

const supportedLanguages = [
    { code: 'en',  name: 'English',        flag: '🇬🇧', native: 'English',     rtl: false },
    { code: 'ar',  name: 'Arabic',         flag: '🇸🇦', native: 'العربية',     rtl: true },
    { code: 'es',  name: 'Spanish',        flag: '🇪🇸', native: 'Español',     rtl: false },
    { code: 'fr',  name: 'French',         flag: '🇫🇷', native: 'Français',    rtl: false },
    { code: 'ha',  name: 'Hausa',          flag: '🇳🇬', native: 'Hausa',       rtl: false },
    { code: 'ig',  name: 'Igbo',           flag: '🇳🇬', native: 'Igbo',        rtl: false },
    { code: 'pcm', name: 'Naija Pidgin',   flag: '🇳🇬', native: 'Pidgin',      rtl: false },
    { code: 'pt',  name: 'Portuguese',     flag: '🇵🇹', native: 'Português',   rtl: false },
    { code: 'yo',  name: 'Yorùbá',         flag: '🇳🇬', native: 'Yorùbá',      rtl: false },
    { code: 'sw',  name: 'Swahili',        flag: '🇹🇿', native: 'Kiswahili',   rtl: false }
];

/**
 * Safely resolves nested keys using dot-notation (e.g., 'supportModal.title')
 */
function getNestedTranslation(obj, path) {
    if (!obj || !path) return null;
    return path.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : null), obj);
}

/**
 * Main function to lookup translation strings with fallback
 */
export function t(key, fallback = "") {
    const val = getNestedTranslation(currentTranslations, key);
    if (val !== null) return val;

    // Fallback to English if key is missing in active language
    const fallbackVal = getNestedTranslation(fallbackTranslations, key);
    if (fallbackVal !== null) return fallbackVal;

    // Return custom default/fallback text if provided, otherwise return key string as last resort
    return fallback || key;
}

export async function loadTranslations(langCode = 'en') {
    try {
        const isSupported = supportedLanguages.some(l => l.code === langCode);
        if (!isSupported) langCode = 'en';

        // Load English as fallback base if not already loaded
        if (Object.keys(fallbackTranslations).length === 0 && langCode !== 'en') {
            try {
                const fallbackRes = await fetch('translations/en.json');
                if (fallbackRes.ok) fallbackTranslations = await fallbackRes.json();
            } catch (_) {}
        }

        const response = await fetch(`translations/${langCode}.json`);
        
        if (response.ok) {
            currentTranslations = await response.json();
        } else {
            console.warn(`No translation for ${langCode}, falling back to English`);
            const enRes = await fetch('translations/en.json');
            currentTranslations = enRes.ok ? await enRes.json() : {};
        }
    } catch (e) {
        console.warn(`Translation load failed for ${langCode}, falling back to English`);
        try {
            const enRes = await fetch('translations/en.json');
            currentTranslations = enRes.ok ? await enRes.json() : {};
        } catch (_) {
            currentTranslations = {};
        }
    }

    currentLang = langCode;
    localStorage.setItem('preferredLang', langCode);

    applyTextDirection(langCode);
    applyTranslations();

    window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang: langCode } }));
}

function applyTextDirection(langCode) {
    const lang = supportedLanguages.find(l => l.code === langCode);
    const isRTL = lang?.rtl || false;
    document.documentElement.setAttribute('dir', isRTL ? 'rtl' : 'ltr');
    document.body.style.textAlign = isRTL ? 'right' : 'left';
}

function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (!key) return;

        const text = t(key);
        if (text === key && !getNestedTranslation(currentTranslations, key)) return;

        // Handle Form Inputs & Textareas (placeholders)
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            el.placeholder = text;
            return;
        }

        // Safe text replacement to preserve inner HTML/icons and avoid layout shift
        let textUpdated = false;
        for (let node of el.childNodes) {
            if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '') {
                node.textContent = text;
                textUpdated = true;
                break;
            }
        }

        if (!textUpdated) {
            if (el.children.length === 0 || el.tagName === 'BUTTON' || el.tagName === 'H2' || el.tagName === 'SPAN' || el.tagName === 'P') {
                el.textContent = text;
            }
        }
    });

    // Update Page Document Title if available
    const pageTitle = t('pageTitle');
    if (pageTitle && pageTitle !== 'pageTitle') {
        document.title = pageTitle;
    }
}

export function initLanguage() {
    const savedLang = localStorage.getItem('preferredLang') || 'en';
    
    const selector = document.getElementById('languageSelector');
    if (selector) {
        selector.innerHTML = supportedLanguages.map(lang => `
            <option value="${lang.code}">${lang.flag} ${lang.native}</option>
        `).join('');
        selector.value = savedLang;
        selector.onchange = (e) => loadTranslations(e.target.value);
    }

    loadTranslations(savedLang);
}

// Global Exports
window.initLanguage = initLanguage;
window.changeLanguage = loadTranslations;
window.t = t;
