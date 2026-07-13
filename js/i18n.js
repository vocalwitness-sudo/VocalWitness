// js/i18n.js - Enhanced Version with Better UX
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
    applyTextDirection(langCode);
    
    // Show toast
    const lang = supportedLanguages.find(l => l.code === langCode);
    if (lang) {
        showToast(`🌍 ${lang.native} (${lang.flag})`, "success");
    }
}

function applyTextDirection(langCode) {
    const lang = supportedLanguages.find(l => l.code === langCode);
    const isRTL = lang ? lang.rtl : false;
    
    document.documentElement.setAttribute('dir', isRTL ? 'rtl' : 'ltr');
    document.body.style.textAlign = isRTL ? 'right' : 'left';
}

function applyTranslations() {
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
                ${lang.flag} ${lang.native}
            </option>
        `).join('');

        selector.value = savedLang;
        
        selector.addEventListener('change', (e) => {
            loadTranslations(e.target.value);
        });
    }

    loadTranslations(savedLang);
}

export function changeLanguage(langCode) {
    loadTranslations(langCode);
}

// Global access
window.initLanguage = initLanguage;
window.changeLanguage = changeLanguage;
