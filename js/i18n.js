// js/i18n.js - Improved for minimal layout shift
let currentTranslations = {};
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

export async function loadTranslations(langCode = 'en') {
    try {
        const isSupported = supportedLanguages.some(l => l.code === langCode);
        if (!isSupported) langCode = 'en';

        const response = await fetch(`translations/${langCode}.json`);
        currentTranslations = response.ok 
            ? await response.json() 
            : (await fetch('translations/en.json')).json();
    } catch (e) {
        console.warn(`Translation load failed for ${langCode}, using English`);
        try {
            currentTranslations = await (await fetch('translations/en.json')).json();
        } catch (_) {
            currentTranslations = {};
        }
    }

    currentLang = langCode;
    localStorage.setItem('preferredLang', langCode);

    // Apply changes
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

        const translatedText = currentTranslations[key] || key;

        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
            el.placeholder = translatedText;
        } 
        else if (el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'H1' || el.tagName === 'H2') {
            // For elements that commonly cause layout shift, we try to preserve structure
            const textNode = Array.from(el.childNodes).find(node => 
                node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== ''
            );

            if (textNode) {
                textNode.textContent = translatedText;
            } else if (el.children.length === 0) {
                el.textContent = translatedText;
            }
            // If it has icons + text, we only update text node to avoid breaking layout
        } 
        else {
            el.textContent = translatedText;
        }
    });

    if (currentTranslations.pageTitle) {
        document.title = currentTranslations.pageTitle;
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

    // Load translations
   loadTranslations('en');
}

export function t(key) {
    return currentTranslations[key] || key;
}

// Expose to window
window.initLanguage = initLanguage;
window.changeLanguage = loadTranslations;
window.t = t;
