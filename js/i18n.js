// js/i18n.js - Hardened Production i18n Module

// ==========================================
// 1. STATE & CONSTANTS
// ==========================================

let currentTranslations = {};
let fallbackTranslations = {};
let currentLang = 'en';

// Inline fallback dictionary if network/JSON fetching ever fails
const DEFAULT_FALLBACK_DICTIONARY = {
    shareTestimonyTitle: "Share Your Testimony",
    publicSquareSubtitle: "Public Square",
    headlinePlaceholder: "Headline or Title (Optional)",
    mainInputPlaceholder: "Share your raw testimony... What did you witness?",
    addPhotoEvidence: "Add Photo Evidence",
    recordVoiceMessage: "Record Voice Message",
    previewAreaText: "Preview will appear here..."
};

const supportedLanguages = [
    { code: 'en',  name: 'English',     flag: '🇬🇧', native: 'English',      rtl: false },
    { code: 'pcm', name: 'Naija Pidgin', flag: '🇳🇬', native: 'Pidgin',       rtl: false },
    { code: 'ha',  name: 'Hausa',        flag: '🇳🇬', native: 'Hausa',        rtl: false },
    { code: 'yo',  name: 'Yorùbá',       flag: '🇳🇬', native: 'Yorùbá',       rtl: false },
    { code: 'ig',  name: 'Igbo',         flag: '🇳🇬', native: 'Igbo',         rtl: false },
    { code: 'sw',  name: 'Swahili',      flag: '🇹🇿', native: 'Kiswahili',    rtl: false },
    { code: 'ar',  name: 'Arabic',       flag: '🇸🇦', native: 'العربية',      rtl: true },
    { code: 'es',  name: 'Spanish',      flag: '🇪🇸', native: 'Español',      rtl: false },
    { code: 'fr',  name: 'French',       flag: '🇫🇷', native: 'Français',     rtl: false },
    { code: 'pt',  name: 'Portuguese',   flag: '🇵🇹', native: 'Português',    rtl: false }
];

// ==========================================
// 2. HELPER FUNCTIONS & ENGINE
// ==========================================

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

    return DEFAULT_FALLBACK_DICTIONARY[key] || fallback || key;
}

function applyTextDirection(langCode) {
    const lang = supportedLanguages.find(l => l.code === langCode);
    const isRTL = lang?.rtl || false;
    document.documentElement.setAttribute('dir', isRTL ? 'rtl' : 'ltr');
}

export function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (!key) return;

        const text = t(key);
        if (!text || text === key) return;

        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            el.placeholder = text;
            return;
        }

        // If the element has a specific i18n span wrapper, update only that
        const labelSpan = el.querySelector(':scope > .i18n-label');
        if (labelSpan) {
            labelSpan.textContent = text;
            return;
        }

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
    const selectors = document.querySelectorAll('#languageSelector, #languageSelector-desktop, #languageSelector-mobile, [data-i18n-selector], .lang-select');
    selectors.forEach(sel => {
        if (sel.value !== langCode) sel.value = langCode;
    });
}

// ==========================================
// 3. ASYNC LOADING & LANGUAGE UPDATER
// ==========================================

export async function loadTranslations(langCode = 'en') {
    const targetLang = supportedLanguages.some(l => l.code === langCode) ? langCode : 'en';

    try {
        if (Object.keys(fallbackTranslations).length === 0 && targetLang !== 'en') {
            try {
                const fallbackRes = await fetch('./translations/en.json');
                if (fallbackRes.ok) fallbackTranslations = await fallbackRes.json();
            } catch (_) {
                console.warn('[i18n] Could not load base fallback translations file. Using inline default.');
                fallbackTranslations = DEFAULT_FALLBACK_DICTIONARY;
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
        console.warn(`[i18n] Network/Fetch error loading ${targetLang}. Using fallback cache.`, e);
        if (Object.keys(fallbackTranslations).length === 0) {
            fallbackTranslations = DEFAULT_FALLBACK_DICTIONARY;
        }
    }

    localStorage.setItem('preferredLang', currentLang);
    document.documentElement.lang = currentLang;
    applyTextDirection(currentLang);
    applyTranslations();
    syncSelectors(currentLang);

    window.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang: currentLang } }));
}

export async function updateUILanguage(langCode) {
    await loadTranslations(langCode);
}

export function initLanguage() {
    const savedLang = localStorage.getItem('preferredLang') || 'en';

    // Global Listener: Automatically handles language dropdown changes anywhere in the DOM
    document.addEventListener('change', (e) => {
        if (
            e.target.matches('#languageSelector, #languageSelector-desktop, #languageSelector-mobile, [data-i18n-selector], .lang-select')
        ) {
            loadTranslations(e.target.value);
        }
    });

    loadTranslations(savedLang);
}

// ==========================================
// 4. MUTATION OBSERVER & BOOTSTRAP
// ==========================================

let observerTimeout = null;

const observer = new MutationObserver((mutations) => {
    let shouldTranslate = false;

    for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
                if (
                    node.hasAttribute?.('data-i18n') || 
                    node.hasAttribute?.('data-i18n-placeholder') ||
                    node.querySelector?.('[data-i18n], [data-i18n-placeholder]')
                ) {
                    shouldTranslate = true;
                    break;
                }
            }
        }
        if (shouldTranslate) break;
    }

    if (shouldTranslate) {
        clearTimeout(observerTimeout);
        observerTimeout = setTimeout(() => {
            applyTranslations();
        }, 30);
    }
});

observer.observe(document.body, { childList: true, subtree: true });

// Auto-initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLanguage);
} else {
    initLanguage();
}

// Global exposure for non-module inline scripts
window.initLanguage = initLanguage;
window.changeLanguage = loadTranslations;
window.setLanguage = loadTranslations;
window.updateUILanguage = updateUILanguage;
window.t = t;
