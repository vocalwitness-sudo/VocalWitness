/**
 * VocalWitness Internationalization (i18n) Engine
 * Modern, high-performance ESM translation module with RTL support,
 * parameter interpolation, dynamic MutationObserver, and complete accessibility binding.
 */

let currentTranslations = {};
let fallbackTranslations = {};
let currentLang = 'en';
let currentFetchController = null;

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

export const supportedLanguages = [
  { code: 'en',    name: 'English',      flag: '🇬🇧', native: 'English',     rtl: false },
  { code: 'pcm',   name: 'Naija Pidgin', flag: '🇳🇬', native: 'Pidgin',      rtl: false },
  { code: 'ha',    name: 'Hausa',        flag: '🇳🇬', native: 'Hausa',       rtl: false },
  { code: 'yo',    name: 'Yorùbá',       flag: '🇳🇬', native: 'Yorùbá',      rtl: false },
  { code: 'ig',    name: 'Igbo',         flag: '🇳🇬', native: 'Igbo',        rtl: false },
  { code: 'sw',    name: 'Swahili',      flag: '🇹🇿', native: 'Kiswahili',   rtl: false },
  { code: 'ar',    name: 'Arabic',       flag: '🇸🇦', native: 'العربية',     rtl: true  },
  { code: 'es',    name: 'Spanish',      flag: '🇪🇸', native: 'Español',     rtl: false },
  { code: 'fr',    name: 'French',       flag: '🇫🇷', native: 'Français',    rtl: false },
  { code: 'pt',    name: 'Portuguese',   flag: '🇵🇹', native: 'Português',   rtl: false },
  { code: 'de',    name: 'German',       flag: '🇩🇪', native: 'Deutsch',     rtl: false },
  { code: 'zh-CN', name: 'Chinese',      flag: '🇨🇳', native: '中文',        rtl: false },
  { code: 'ma',    name: 'Amharic',      flag: '🇪🇹', native: 'አማርኛ',        rtl: false },
  { code: 'hi',    name: 'Hindi',        flag: '🇮🇳', native: 'हिन्दी',      rtl: false },
  { code: 'id',    name: 'Indonesian',   flag: '🇮🇩', native: 'Bahasa',      rtl: false }
];

/**
 * Traverses nested JSON objects using dot notation (e.g., 'witness.upload.title')
 */
function getNestedTranslation(obj, path) {
  if (!obj || !path) return null;
  return path.split('.').reduce((acc, part) => {
    return (acc && acc[part] !== undefined) ? acc[part] : null;
  }, obj);
}

/**
 * Interpolates template variables into string (e.g., "Hello {name}" + {name: 'Alex'} -> "Hello Alex")
 */
function interpolate(template, params) {
  if (!template || typeof template !== 'string' || !params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    return params[key] !== undefined ? params[key] : `{${key}}`;
  });
}

/**
 * Main Translation Function
 * @param {string} key - Dictionary key (supports nested dot notation)
 * @param {Object|string} paramsOrFallback - Variables for interpolation OR fallback string
 * @param {string} defaultFallback - Fallback text if params object is supplied
 */
export function t(key, paramsOrFallback = {}, defaultFallback = "") {
  let params = {};
  let fallback = defaultFallback;

  if (typeof paramsOrFallback === 'string') {
    fallback = paramsOrFallback;
  } else if (typeof paramsOrFallback === 'object') {
    params = paramsOrFallback;
  }

  // 1. Current Language Lookup
  let val = getNestedTranslation(currentTranslations, key);

  // 2. Fallback to English (Loaded File)
  if (val === null || val === "") {
    val = getNestedTranslation(fallbackTranslations, key);
  }

  // 3. Fallback to Hardcoded Emergency Dictionary
  if ((val === null || val === "") && DEFAULT_FALLBACK_DICTIONARY[key]) {
    val = DEFAULT_FALLBACK_DICTIONARY[key];
  }

  // 4. Return resolved value or fallback/key
  const finalString = (val !== null && val !== "") ? val : (fallback || key);
  return interpolate(finalString, params);
}

/**
 * Updates html direction and lang attributes
 */
function applyTextDirection(langCode) {
  const lang = supportedLanguages.find(l => l.code === langCode);
  const isRTL = lang?.rtl || false;

  document.documentElement.setAttribute('dir', isRTL ? 'rtl' : 'ltr');
  document.documentElement.setAttribute('lang', langCode);

  // Keep navigation header strictly LTR to avoid broken layouts
  const header = document.getElementById('main-header');
  if (header) {
    header.setAttribute('dir', 'ltr');
  }

  document.querySelectorAll('[data-force-ltr]').forEach(el => {
    el.setAttribute('dir', 'ltr');
  });
}

/**
 * Scans the DOM and applies translations to marked elements
 */
export function applyTranslations(rootElement = document) {
  // 1. Inner Text & HTML Content
  rootElement.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (!key) return;

    let params = {};
    const paramsAttr = el.getAttribute('data-i18n-params');
    if (paramsAttr) {
      try { params = JSON.parse(paramsAttr); } catch (e) { /* ignore JSON parse errors */ }
    }

    const text = t(key, params);
    if (!text) return;

    // Preserve child icons/elements by only targetting text nodes
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

  // 2. Placeholders
  rootElement.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key) el.setAttribute('placeholder', t(key));
  });

  // 3. ARIA Labels (Accessibility)
  rootElement.querySelectorAll('[data-i18n-aria]').forEach(el => {
    const key = el.getAttribute('data-i18n-aria');
    if (key) el.setAttribute('aria-label', t(key));
  });

  // 4. Tooltips (Title attribute)
  rootElement.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    if (key) el.setAttribute('title', t(key));
  });

  // 5. Image Alt attributes
  rootElement.querySelectorAll('[data-i18n-alt]').forEach(el => {
    const key = el.getAttribute('data-i18n-alt');
    if (key) el.setAttribute('alt', t(key));
  });
}

/**
 * Syncs language selection dropdowns across desktop and mobile UI
 */
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

/**
 * Fetches and applies translation pack for chosen language
 */
export async function loadTranslations(langCode = 'en') {
  const isSupported = supportedLanguages.some(l => l.code === langCode);
  const targetLang = isSupported ? langCode : 'en';

  if (currentFetchController) {
    currentFetchController.abort();
  }
  currentFetchController = new AbortController();

  try {
    // Ensure English fallback dictionary is loaded
    if (Object.keys(fallbackTranslations).length === 0) {
      try {
        const fallbackRes = await fetch('/translations/en.json', {
          signal: currentFetchController.signal
        });
        if (fallbackRes.ok) {
          fallbackTranslations = await fallbackRes.json();
        } else {
          fallbackTranslations = { ...DEFAULT_FALLBACK_DICTIONARY };
        }
      } catch (err) {
        if (err.name === 'AbortError') return;
        fallbackTranslations = { ...DEFAULT_FALLBACK_DICTIONARY };
      }
    }

    if (targetLang === 'en') {
      currentTranslations = { ...fallbackTranslations };
      currentLang = 'en';
    } else {
      const response = await fetch(`/translations/${targetLang}.json`, {
        signal: currentFetchController.signal
      });
      if (response.ok) {
        currentTranslations = await response.json();
        currentLang = targetLang;
      } else {
        console.warn(`[i18n] ${targetLang}.json not found -> falling back to English`);
        currentTranslations = { ...fallbackTranslations };
        currentLang = 'en';
      }
    }
  } catch (e) {
    if (e.name === 'AbortError') return;
    console.warn(`[i18n] Failed to load language ${targetLang}`, e);
    currentTranslations = { ...fallbackTranslations };
    currentLang = 'en';
  } finally {
    currentFetchController = null;
  }

  localStorage.setItem('preferredLang', currentLang);

  document.documentElement.lang = currentLang;
  applyTextDirection(currentLang);
  applyTranslations();
  syncSelectors(currentLang);

  window.dispatchEvent(new CustomEvent('languageChanged', {
    detail: { lang: currentLang }
  }));
}

export async function updateUILanguage(langCode) {
  await loadTranslations(langCode);
}

export function initLanguage() {
  const savedLang = localStorage.getItem('preferredLang') || 'en';

  document.addEventListener('change', (e) => {
    if (
      e.target.matches(
        '#languageSelect, #languageSelectMobile, #languageSelector, #languageSelector-desktop, #languageSelector-mobile, [data-i18n-selector], .lang-select'
      )
    ) {
      loadTranslations(e.target.value);
    }
  });

  loadTranslations(savedLang);
}

// ── Mutation Observer for Dynamic UI Elements ──
let observerTimeout = null;
const observer = new MutationObserver((mutations) => {
  let shouldTranslate = false;

  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (
          node.hasAttribute?.('data-i18n') ||
          node.hasAttribute?.('data-i18n-placeholder') ||
          node.hasAttribute?.('data-i18n-aria') ||
          node.querySelector?.('[data-i18n], [data-i18n-placeholder], [data-i18n-aria]')
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
    }, 50);
  }
});

if (document.body) {
  observer.observe(document.body, { childList: true, subtree: true });
} else {
  document.addEventListener('DOMContentLoaded', () => {
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

// Boot setup
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLanguage);
} else {
  initLanguage();
}

// Global scope registration
if (typeof window !== 'undefined') {
  window.initLanguage = initLanguage;
  window.changeLanguage = loadTranslations;
  window.setLanguage = loadTranslations;
  window.updateUILanguage = updateUILanguage;
  window.t = t;
  window.applyTranslations = applyTranslations;
  window.supportedLanguages = supportedLanguages;
}
