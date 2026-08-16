// js/i18n.js - Hardened Production i18n Module
let currentTranslations = {};
let fallbackTranslations = {};
let currentLang = 'en';

const supportedLanguages = [
    { code: 'en',  name: 'English',      flag: '🇬🇧', native: 'English',     rtl: false },
    { code: 'pcm', name: 'Naija Pidgin',  flag: '🇳🇬', native: 'Pidgin',      rtl: false },
    { code: 'ha',  name: 'Hausa',         flag: '🇳🇬', native: 'Hausa',       rtl: false },
    { code: 'yo',  name: 'Yorùbá',        flag: '🇳🇬', native: 'Yorùbá',      rtl: false },
    { code: 'ig',  name: 'Igbo',          flag: '🇳🇬', native: 'Igbo',        rtl: false },
    { code: 'sw',  name: 'Swahili',       flag: '🇹🇿', native: 'Kiswahili',   rtl: false },
    { code: 'ar',  name: 'Arabic',        flag: '🇸🇦', native: 'العربية',     rtl: true },
    { code: 'es',  name: 'Spanish',       flag: '🇪🇸', native: 'Español',     rtl: false },
    { code: 'fr',  name: 'French',        flag: '🇫🇷', native: 'Français',    rtl: false },
    { code: 'pt',  name: 'Portuguese',    flag: '🇵🇹', native: 'Português',   rtl: false }
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
        // Ensure base English translations are cached for fallback lookup
        if (Object.keys(fallbackTranslations).length === 0 && targetLang !== 'en') {
            try {
                const fallbackRes = await fetch('./translations/en.json');
                if (fallbackRes.ok) fallbackTranslations = await fallbackRes.json();
            } catch (_) {
                console.warn('[i18n] Could not load base fallback translations.');
            }
        }

        const response = await fetch(`./translations/${targetLang}.json`);
        
        if (response.ok) {
            currentTranslations = await response.json();
            currentLang = targetLang;
            if (targetLang === 'en') fallbackTranslations = currentTranslations;
        } else {
            console.warn(`[i18n] Translation file for ${targetLang} missing. Preserving fallback state.`);
            if (targetLang === 'en') currentTranslations = fallbackTranslations;
        }
    } catch (e) {
        console.warn(`[i18n] Network error loading ${targetLang}. Using available memory cache.`, e);
    }

    localStorage.setItem('preferredLang', currentLang);
    applyTextDirection(currentLang);
    applyTranslations();
    syncSelectors(currentLang);

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

        // Form inputs and textareas
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            el.placeholder = text;
            return;
        }

        // Preserve SVG/child element nodes by only replacing text nodes
        let textNodeFound = false;
        for (let node of el.childNodes) {
            if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '') {
                node.textContent = text;
                textNodeFound = true;
                break;
            }
        }

        if (!textNodeFound && el.children.length === 0) {
            el.textContent = text;
        }
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (key) {
            const text = t(key);
            if (text && text !== key) el.placeholder = text;
        }
    });

    const pageTitle = t('pageTitle');
    if (pageTitle && pageTitle !== 'pageTitle') {
        document.title = pageTitle;
    }
}

function syncSelectors(langCode) {
    const selectors = document.querySelectorAll('#languageSelector, #languageSelector-desktop, #languageSelector-mobile, [data-i18n-selector]');
    selectors.forEach(sel => {
        if (sel.value !== langCode) sel.value = langCode;
    });
}

export function initLanguage() {
    const savedLang = localStorage.getItem('preferredLang') || 'en';
    const optionsHTML = supportedLanguages.map(lang => `
        <option value="${lang.code}">${lang.flag} ${lang.native}</option>
    `).join('');

    const selectors = document.querySelectorAll('#languageSelector, #languageSelector-desktop, #languageSelector-mobile, [data-i18n-selector]');
    
    selectors.forEach(selector => {
        selector.innerHTML = optionsHTML;
        selector.value = savedLang;
        selector.onchange = (e) => loadTranslations(e.target.value);
    });

    loadTranslations(savedLang);
}

// Optimized dynamic loader for your existing UI logic
async function fetchLanguageData(langCode) {
    try {
        const response = await fetch(`./translations/${langCode}.json`);
        if (!response.ok) throw new Error('Language file not found');
        return await response.json();
    } catch (err) {
        console.error(`[i18n] Failed to load ${langCode}, falling back to English:`, err);
        const fallback = await fetch('./translations/en.json');
        return await fallback.json();
    }
}

// Your existing logic, but made async to handle the fetch
export async function updateUILanguage(langCode) {
    document.documentElement.lang = langCode;
    const activeData = await fetchLanguageData(langCode);
    
    // Update innerText
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (activeData[key]) el.innerText = activeData[key];
    });

    // Update Placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (activeData[key]) el.placeholder = activeData[key];
    });
}

// Global exposure for non-module inline scripts and event handlers
window.initLanguage = initLanguage;
window.changeLanguage = loadTranslations;
window.t = t;
