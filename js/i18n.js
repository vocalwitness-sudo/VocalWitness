// js/i18n.js - Clean & Production Ready
let currentTranslations = {};
let currentLang = 'en';

const supportedLanguages = [
    { code: 'en',  name: 'English',       flag: '🇬🇧', native: 'English',      rtl: false },
    { code: 'ar',  name: 'Arabic',        flag: '🇸🇦', native: 'العربية',     rtl: true },
    { code: 'es',  name: 'Spanish',       flag: '🇪🇸', native: 'Español',      rtl: false },
    { code: 'fr',  name: 'French',        flag: '🇫🇷', native: 'Français',     rtl: false },
    { code: 'ha',  name: 'Hausa',         flag: '🇳🇬', native: 'Hausa',        rtl: false },
    { code: 'ig',  name: 'Igbo',          flag: '🇳🇬', native: 'Igbo',         rtl: false },
    { code: 'pcm', name: 'Naija Pidgin',  flag: '🇳🇬', native: 'Pidgin',       rtl: false },
    { code: 'pt',  name: 'Portuguese',    flag: '🇵🇹', native: 'Português',    rtl: false },
    { code: 'yo',  name: 'Yorùbá',        flag: '🇳🇬', native: 'Yorùbá',       rtl: false },
    { code: 'sw',  name: 'Swahili',       flag: '🇹🇿', native: 'Kiswahili',    rtl: false }
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
        } else {
            console.warn(`No translation file for ${langCode}`);
            currentTranslations = {};
        }
    } catch (e) {
        console.warn(`Failed to load ${langCode}, falling back to English`);
        try {
            const enRes = await fetch('translations/en.json');
            if (enRes.ok) currentTranslations = await enRes.json();
        } catch {}
    }

    currentLang = langCode;
    localStorage.setItem('preferredLang', langCode);
    
    applyTranslations();
    applyTextDirection(langCode);
    
    showToast(`🌍 ${getLangName(langCode)} activated`, "success");
}

function applyTextDirection(langCode) {
    const lang = supportedLanguages.find(l => l.code === langCode);
    const isRTL = lang?.rtl || false;
    document.documentElement.setAttribute('dir', isRTL ? 'rtl' : 'ltr');
    document.body.style.textAlign = isRTL ? 'right' : 'left';
}

export function t(key, params = {}) {
    let text = currentTranslations[key] || key;
    Object.keys(params).forEach(param => {
        text = text.replace(new RegExp(`{${param}}`, 'g'), params[param]);
    });
    return text;
}

function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (!key) return;
        
        const text = t(key);
        
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            el.placeholder = text;
        } else {
            el.textContent = text;
        }
    });

    if (currentTranslations.pageTitle) {
        document.title = currentTranslations.pageTitle;
    }
}

export function initLanguage() {
    const savedLang = localStorage.getItem('preferredLang') || 'en';
    
    applyTranslations(); // Initial fallback

    const selector = document.getElementById('languageSelector');
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

// Make available globally
window.initLanguage = initLanguage;
window.changeLanguage = changeLanguage;
window.t = t;
