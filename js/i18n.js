// js/i18n.js - Production i18n Module (Full language support + RTL Header Fix)

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
  termsSection9Title: "9. User Indemnification & Dispute Protocol",
  termsSection9Text: "You agree to defend, indemnify, and hold harmless VocalWitness and its operators from any legal claims, liabilities, damages, or legal expenses arising from your violation of these Terms or your publication of illegal, defamatory, or infringing material. Any legal disputes or claims against content must be directed through our administrative takedown channel rather than against protocol infrastructure operators.",
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

function getNestedTranslation(obj, path) {
  if (!obj || !path) return null;
  return path.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : null), obj);
}

export function t(key, fallback = "") {
  // 1. Current language
  const val = getNestedTranslation(currentTranslations, key);
  if (val !== null && val !== "") return val;

  // 2. English fallback (loaded file)
  const fallbackVal = getNestedTranslation(fallbackTranslations, key);
  if (fallbackVal !== null && fallbackVal !== "") return fallbackVal;

  // 3. Hard-coded emergency dictionary
  if (DEFAULT_FALLBACK_DICTIONARY[key]) return DEFAULT_FALLBACK_DICTIONARY[key];

  // 4. Caller-provided fallback or the key itself
  return fallback || key;
}

function applyTextDirection(langCode) {
  const lang = supportedLanguages.find(l => l.code === langCode);
  const isRTL = lang?.rtl || false;

  // Set page direction
  document.documentElement.setAttribute('dir', isRTL ? 'rtl' : 'ltr');
  document.documentElement.setAttribute('lang', langCode);

  // CRITICAL: Keep header always LTR to prevent layout breakage
  const header = document.getElementById('main-header');
  if (header) {
    header.setAttribute('dir', 'ltr');
  }

  // Optional: also force any navigation that must stay LTR
  document.querySelectorAll('[data-force-ltr]').forEach(el => {
    el.setAttribute('dir', 'ltr');
  });
}

export function applyTranslations() {
  // Text content
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (!key) return;

    const text = t(key);
    if (!text || text === key) return; // skip if no real translation

    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      el.placeholder = text;
      return;
    }

    // Prefer a dedicated label span if present
    const labelSpan = el.querySelector(':scope > .i18n-label');
    if (labelSpan) {
      labelSpan.textContent = text;
      return;
    }

    // Replace first non-empty text node
    let textNodeFound = false;
    for (let node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '') {
        node.textContent = text;
        textNodeFound = true;
        break;
      }
    }

    // Fallback: element has no children → set whole text
    if (!textNodeFound && el.children.length === 0) {
      el.textContent = text;
    }
  });

  // Placeholders
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (!key) return;
    const text = t(key);
    if (text && text !== key) el.placeholder = text;
  });

  // Page title
  const pageTitle = t('pageTitle');
  if (pageTitle && pageTitle !== 'pageTitle') {
    document.title = pageTitle;
  }
}

function syncSelectors(langCode) {
  const selectors = document.querySelectorAll(
    '#languageSelect, #languageSelectMobile, #languageSelector, #languageSelector-desktop, #languageSelector-mobile, [data-i18n-selector], .lang-select'
  );
  selectors.forEach(sel => {
    if (sel && sel.value !== langCode) {
      sel.value = langCode;
    }
  });
}

export async function loadTranslations(langCode = 'en') {
  // Validate language code
  const isSupported = supportedLanguages.some(l => l.code === langCode);
  const targetLang = isSupported ? langCode : 'en';

  try {
    // Always keep English as fallback
    if (Object.keys(fallbackTranslations).length === 0) {
      try {
        const fallbackRes = await fetch('./translations/en.json');
        if (fallbackRes.ok) {
          fallbackTranslations = await fallbackRes.json();
        } else {
          fallbackTranslations = { ...DEFAULT_FALLBACK_DICTIONARY };
        }
      } catch (_) {
        fallbackTranslations = { ...DEFAULT_FALLBACK_DICTIONARY };
      }
    }

    // Load requested language
    if (targetLang === 'en') {
      currentTranslations = { ...fallbackTranslations };
      currentLang = 'en';
    } else {
      const response = await fetch(`./translations/${targetLang}.json`);
      if (response.ok) {
        currentTranslations = await response.json();
        currentLang = targetLang;
      } else {
        console.warn(`[i18n] ${targetLang}.json not found → falling back to English`);
        currentTranslations = { ...fallbackTranslations };
        currentLang = 'en';
      }
    }
  } catch (e) {
    console.warn(`[i18n] Failed to load language ${targetLang}`, e);
    currentTranslations = { ...fallbackTranslations };
    currentLang = 'en';
  }

  // Persist preference
  localStorage.setItem('preferredLang', currentLang);

  // Apply everything
  document.documentElement.lang = currentLang;
  applyTextDirection(currentLang);
  applyTranslations();
  syncSelectors(currentLang);

  // Notify the rest of the app
  window.dispatchEvent(new CustomEvent('languageChanged', {
    detail: { lang: currentLang }
  }));
}

export async function updateUILanguage(langCode) {
  await loadTranslations(langCode);
}

export function initLanguage() {
  // Restore last chosen language (or default to English)
  let savedLang = localStorage.getItem('preferredLang') || 'en';

  // Optional safety: if you still want to block Arabic temporarily, uncomment the next 3 lines
  // if (savedLang === 'ar') {
  //   savedLang = 'en';
  //   localStorage.setItem('preferredLang', 'en');
  // }

  // Listen for language selector changes
  document.addEventListener('change', (e) => {
    if (
      e.target.matches(
        '#languageSelect, #languageSelectMobile, #languageSelector, #languageSelector-desktop, #languageSelector-mobile, [data-i18n-selector], .lang-select'
      )
    ) {
      const selectedLang = e.target.value;
      loadTranslations(selectedLang);
    }
  });

  // Initial load
  loadTranslations(savedLang);
}

// ── Mutation Observer (auto-translate dynamically added content) ──
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
    }, 40);
  }
});

if (document.body) {
  observer.observe(document.body, { childList: true, subtree: true });
} else {
  document.addEventListener('DOMContentLoaded', () => {
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

// Boot
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLanguage);
} else {
  initLanguage();
}

// Global exports (for non-module scripts)
window.initLanguage = initLanguage;
window.changeLanguage = loadTranslations;
window.setLanguage = loadTranslations;
window.updateUILanguage = updateUILanguage;
window.t = t;
window.applyTranslations = applyTranslations;
