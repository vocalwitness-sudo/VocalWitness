// js/i18n.js - Production Ready with ICU Plural + Enhanced Selector
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

function getLangName(code) {
    const lang = supportedLanguages.find(l => l.code === code);
    return lang ? lang.native : code;
}

export async function loadTranslations(langCode = 'en') {
    try {
        const isSupported = supportedLanguages.some(l => l.code === langCode);
        if (!isSupported) langCode = 'en';

        const response = await fetch(`translations/${langCode}.json`);
        if (response.ok) {
            currentTranslations = await response.json();
            console.log(`✅ Loaded ${langCode} translations`);
        }
    } catch (e) {
        console.warn(`Failed to load ${langCode}`);
    }

    currentLang = langCode;
    localStorage.setItem('preferredLang', langCode);
    applyTranslations();
    applyTextDirection(langCode);

    showToast(`🌍 ${getLangName(langCode)} activated`, "success");
}

function applyTextDirection(langCode) {
    const lang = supportedLanguages.find(l => l.code === langCode);
    const isRTL = lang ? lang.rtl : false;
    document.documentElement.setAttribute('dir', isRTL ? 'rtl' : 'ltr');
    document.body.style.textAlign = isRTL ? 'right' : 'left';
}

// ICU-style Plural + Placeholder Support
export function t(key, params = {}) {
    let text = currentTranslations[key] || key;

    // Pluralization
    if (params.count !== undefined) {
        const pluralForm = getPluralForm(params.count, currentLang);
        const pluralKey = `${key}_${pluralForm}`;
        if (currentTranslations[pluralKey]) {
            text = currentTranslations[pluralKey];
        }
    }

    // Replace {name}, {count}, etc.
    Object.keys(params).forEach(param => {
        text = text.replace(new RegExp(`{${param}}`, 'g'), params[param]);
    });

    return text;
}

function getPluralForm(count, lang) {
    if (count === 0) return 'zero';
    if (count === 1) return 'one';
    if (count === 2) return 'two';
    return 'other';
}

function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const count = el.dataset.count ? parseInt(el.dataset.count) : undefined;
        const text = t(key, { count });

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
            <option value="${lang.code}">
                ${lang.flag} ${lang.native}
            </option>
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
window.t = t;
