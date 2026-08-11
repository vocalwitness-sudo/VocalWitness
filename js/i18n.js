// js/i18n.js - Hardened Production i18n Module
let currentTranslations = {};
let fallbackTranslations = {};
let currentLang = 'en';

const supportedLanguages = [
    { code: 'en',  name: 'English',       flag: '🇬🇧', native: 'English',     rtl: false },
    { code: 'ar',  name: 'Arabic',        flag: '🇸🇦', native: 'العربية',     rtl: true },
    { code: 'es',  name: 'Spanish',       flag: '🇪🇸', native: 'Español',     rtl: false },
    { code: 'fr',  name: 'French',        flag: '🇫🇷', native: 'Français',    rtl: false },
    { code: 'ha',  name: 'Hausa',         flag: '🇳🇬', native: 'Hausa',       rtl: false },
    { code: 'ig',  name: 'Igbo',          flag: '🇳🇬', native: 'Igbo',        rtl: false },
    { code: 'pcm', name: 'Naija Pidgin',  flag: '🇳🇬', native: 'Pidgin',      rtl: false },
    { code: 'pt',  name: 'Portuguese',    flag: '🇵🇹', native: 'Português',   rtl: false },
    { code: 'yo',  name: 'Yorùbá',        flag: '🇳🇬', native: 'Yorùbá',      rtl: false },
    { code: 'sw',  name: 'Swahili',       flag: '🇹🇿', native: 'Kiswahili',   rtl: false }
];

/**
 * Safely resolves nested keys using dot-notation (e.g., 'supportModal.title')
 */
function getNestedTranslation(obj, path) {
    if (!obj || !path) return null;
    return path.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : null), obj);
}

/**
 * Main translation lookup with fallback logic
 */
export function t(key, fallback = "") {
    const val = getNestedTranslation(currentTranslations, key);
    if (val !== null && val !== "") return val;

    const fallbackVal = getNestedTranslation(fallbackTranslations, key);
    if (fallbackVal !== null && fallbackVal !== "") return fallbackVal;

    return fallback || key;
}

export async function loadTranslations(langCode = 'en') {
    const targetLang = supportedLanguages.some(l => l.code === langCode) ? langCode : 'en';

    try {
        // Ensure fallback base (English) is cached
        if (Object.keys(fallbackTranslations).length === 0 && targetLang !== 'en') {
            try {
                const fallbackRes = await fetch('translations/en.json');
                if (fallbackRes.ok) fallbackTranslations = await fallbackRes.json();
            } catch (_) {
                console.warn('Could not load base fallback translations.');
            }
        }

        const response = await fetch(`translations/${targetLang}.json`);
        
        if (response.ok) {
            currentTranslations = await response.json();
            currentLang = targetLang;
        } else {
            console.warn(`Translation file for ${targetLang} missing. Preserving fallback state.`);
            if (targetLang === 'en') currentTranslations = fallbackTranslations;
        }
    } catch (e) {
        console.warn(`Network error loading ${targetLang}. Using available memory cache.`, e);
    }

    localStorage.setItem('preferredLang', currentLang);
    applyTextDirection(currentLang);
    applyTranslations();

    window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang: currentLang } }));
}

function applyTextDirection(langCode) {
    const lang = supportedLanguages.find(l => l.code === langCode);
    const isRTL = lang?.rtl || false;
    document.documentElement.setAttribute('dir', isRTL ? 'rtl' : 'ltr');
}

function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (!key) return;

        const text = t(key);
        if (!text || text === key) return;

        // Form elements handling
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            el.placeholder = text;
            return;
        }

        // Targeted element updates that preserve internal SVG/HTML nodes
        let textNodeFound = false;
        for (let node of el.childNodes) {
            if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '') {
                node.textContent = text;
                textNodeFound = true;
                break;
            }
        }

        // If no standalone text node exists and element has zero children, safe to apply textContent
        if (!textNodeFound && el.children.length === 0) {
            el.textContent = text;
        }
    });

    // Handle separate placeholder attributes on standard inputs without data-i18n override
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (key) {
            const text = t(key);
            if (text && text !== key) el.placeholder = text;
        }
    });

    // Update Page Document Title
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
