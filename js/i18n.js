// js/i18n.js - Hardened Production i18n Module

// ==========================================
// 1. STATE & CONSTANTS
// ==========================================

let currentTranslations = {};
let fallbackTranslations = {};
let currentLang = 'en';

const DEFAULT_FALLBACK_DICTIONARY = {
    shareTestimonyTitle: "Share Your Testimony",
    publicSquareSubtitle: "Public Square",
    headlinePlaceholder: "Headline or Title (Optional)",
    mainInputPlaceholder: "Share your raw testimony... What did you witness?",
    addPhotoEvidence: "Add Photo Evidence",
    recordVoiceMessage: "Record Voice Message",
    previewAreaText: "Preview will appear here...",

    // Section 9 Translations
    termsSection9Title: "9. User Indemnification & Dispute Protocol",
    termsSection9Text: "You agree to defend, indemnify, and hold harmless VocalWitness and its operators from any legal claims, liabilities, damages, or legal expenses arising from your violation of these Terms or your publication of illegal, defamatory, or infringing material. Any legal disputes or claims against content must be directed through our administrative takedown channel rather than against protocol infrastructure operators.",

    // Safety & Operational Security Translations
    safetyPageTitle: "Safety & Operational Security Guide • VocalWitness",
    safetyTitle: "Citizen OpSec & Safety Guide",
    safetySubtitle: "Practical protocols to protect your identity, location, and digital footprint when capturing and sharing evidence.",
    threatModelTitle: "Understand Your Threat Model",
    threatModelDesc: "While VocalWitness automatically scrubs EXIF metadata and utilizes client-side zero-knowledge proofs, technology alone cannot prevent accidental personal exposure. If you are submitting high-risk testimonies or evidence under hostile surveillance, follow these operational security best practices.",
    networkSafetyTitle: "Network Connection & IP Masking",
    networkTip1: "Use Tor or a Trustworthy VPN: Hide your physical location and IP address from network eavesdroppers before navigating to VocalWitness.",
    networkTip2: "Avoid Public Personal Wi-Fi: Do not upload sensitive whistleblower materials over home broadband or personal mobile accounts registered directly to your government ID.",
    mediaSafetyTitle: "Media & Metadata Protection",
    mediaTip1: "Automated Scrubbing: VocalWitness strips EXIF metadata (camera model, GPS coordinates) locally in your browser. However, check your background visually for identifying reflections, unique street signs, or private documents.",
    mediaTip2: "Voice & Face Anonymization: When recording video or audio in hostile environments, blur faces of non-consenting bystanders and alter distinct voice patterns before publishing.",
    identitySafetyTitle: "Identity & Account Discretion",
    identityTip1: "Pseudonymous Handle: Choose a username completely unlinked to your real name, social handles, or personal email address.",
    identityTip2: "Zero-Knowledge Verification: Take advantage of True Witness ZK-verification options to establish trust without linking personal contact details to your submissions.",
    physicalSafetyTitle: "Physical Security & Device Handling",
    physicalTip1: "Secure Device Storage: Keep your mobile phone encrypted and passcoded (avoid biometrics like fingerprint/face unlock in regions where authorities can compel biometric unlock).",
    physicalTip2: "Clear Browser Data: If using a shared or at-risk device, clear local storage and browser cache immediately after submitting your record.",
    goldenRuleTitle: "The Golden Rule of Citizen Witnessing",
    goldenRuleText: "Never put yourself in immediate physical danger to capture evidence. Secure your physical safety first. Once you are in a protected location, use cryptographic tools to notarize and share your record with the world."
};

const supportedLanguages = [
    { code: 'en',  name: 'English',     flag: '🇬🇧', native: 'English',     rtl: false },
    { code: 'pcm', name: 'Naija Pidgin', flag: '🇳🇬', native: 'Pidgin',        rtl: false },
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

function getNestedTranslation(obj, path) {
    if (!obj || !path) return null;
    return path.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : null), obj);
}

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
        if (sel.value !== langCode) {
            sel.value = langCode;
        }
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
                fallbackTranslations = DEFAULT_FALLBACK_DICTIONARY;
            }
        }

        const response = await fetch(`./translations/${targetLang}.json`);

        if (response.ok) {
            currentTranslations = await response.json();
            currentLang = targetLang;
            if (targetLang === 'en') fallbackTranslations = currentTranslations;
        } else {
            console.warn(`[i18n] Translation file for ${targetLang}.json not found (HTTP ${response.status}). Falling back to English.`);
            // If the translation file doesn't exist yet, fallback to English so the UI doesn't break
            const fallbackRes = await fetch('./translations/en.json');
            if (fallbackRes.ok) currentTranslations = await fallbackRes.json();
            currentLang = 'en';
        }
    } catch (e) {
        console.warn(`[i18n] Network/Fetch error loading ${targetLang}.`, e);
        currentTranslations = DEFAULT_FALLBACK_DICTIONARY;
        currentLang = 'en';
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

    // Global Listener with selection check protection
    document.addEventListener('change', (e) => {
        if (e.target.matches('#languageSelector, #languageSelector-desktop, #languageSelector-mobile, [data-i18n-selector], .lang-select')) {
            const selectedLang = e.target.value;
            loadTranslations(selectedLang);
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

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLanguage);
} else {
    initLanguage();
}

window.initLanguage = initLanguage;
window.changeLanguage = loadTranslations;
window.setLanguage = loadTranslations;
window.updateUILanguage = updateUILanguage;
window.t = t;
