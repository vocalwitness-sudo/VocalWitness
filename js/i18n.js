/**
 * VocalWitness Internationalization (i18n) Module
 * Manages global accessibility and localized node interface
 */

export const translationDictionary = {
    en: {
        privacyWarning: "Privacy Protection Warning (ZERO-KNOWLEDGE CRYPTOGRAPHIC PROTOCOL NOTICE)",
        upgradeSecurity: "Upgrade Security and Permissions (Code + Privacy Proofs)",
        settingsDashboard: "Settings Dashboard",
        logoutBtn: "Log Out",
        placeholder: "Provide raw, unedited description...",
        postButton: "Publish to Decentralized Ledger",
        witnessVoice: "👁️ Witness Voice",
        activeLanguage: "English (EN)"
    },
    fr: {
        privacyWarning: "Avertissement de Protection de la Vie Privée (PROTOCOLE CRYPTOGRAPHIQUE ZERO-KNOWLEDGE)",
        upgradeSecurity: "Améliorer la Sécurité et les Permissions",
        settingsDashboard: "Tableau de Bord des Paramètres",
        logoutBtn: "Se Déconnecter",
        placeholder: "Fournissez une description brute, non éditée...",
        postButton: "Publier sur le Registre Décentralisé",
        witnessVoice: "👁️ Voix du Témoin",
        activeLanguage: "Français (FR)"
    },
    es: {
        privacyWarning: "Advertencia de Protección de Privacidad (PROTOCOLO CRIPTOGRÁFICO ZERO-KNOWLEDGE)",
        upgradeSecurity: "Mejorar Seguridad y Permisos",
        settingsDashboard: "Panel de Configuración",
        logoutBtn: "Cerrar Sesión",
        placeholder: "Proporcione una descripción cruda, sin editar...",
        postButton: "Publicar en el Ledger Descentralizado",
        witnessVoice: "👁️ Voz del Testigo",
        activeLanguage: "Español (ES)"
    },
    ha: {
        privacyWarning: "Gargaɗi Game da Tsaron Sirri (SANARWAR TSARIN SIRRI NA ZERO-KNOWLEDGE)",
        upgradeSecurity: "Haɓaka Tsaro da Izini (Lambar Shaidar Sirri)",
        settingsDashboard: "Saitunan Dashboard",
        logoutBtn: "Fita Daga Shafin",
        placeholder: "Shigar da shaidarku...",
        postButton: "Yada Shaidarka",
        witnessVoice: "👁️ Muryar Shaida",
        activeLanguage: "Hausa (HA)"
    },
    yo: {
        privacyWarning: "Ikilo Idaabobo Aṣiri (AṢIYAN PROTOCOL CRYPTOGRAPHIC KÒ SÍ ÌMỌ̀-IṢẸ́)",
        upgradeSecurity: "Ṣe Imudojuiwọn Aabo ati Awọn Gbigbanilaaye",
        settingsDashboard: "Dashboard Eto",
        logoutBtn: "Wọlé Kúrò",
        placeholder: "Sọ otitọ rẹ...",
        postButton: "PIN SỌ TITỌ",
        witnessVoice: "👁️ Ohùn Ẹlẹ́rìí",
        activeLanguage: "Yorùbá (YO)"
    },
    ig: {
        privacyWarning: "Ịdọ aka na ntị maka nchebe nzuzo (ZERO-KNOWLEDGE CRYPTOGRAPHIC PROTOCOL NOTICE)",
        upgradeSecurity: "Melite Nchebe na Ikike",
        settingsDashboard: "Ebe Ndabere Ntọala",
        logoutBtn: "Banye Pụọ",
        placeholder: "Debe nkọwa gị...",
        postButton: "Bipụta na Ledger",
        witnessVoice: "👁️ Voice nke Aka",
        activeLanguage: "Igbo (IG)"
    },
    sw: {
        privacyWarning: "Onyo la Kulinda Faragha (ILANI YA PROTOKALI YA USINDIKAJI WA BIOMETRIKI)",
        upgradeSecurity: "Boresha Usalama na Ruhusa",
        settingsDashboard: "Eneo la Mipangilio",
        logoutBtn: "Ondoka Kwenye Akaunti",
        placeholder: "Andika ushuhuda wako hapa...",
        postButton: "Chapisha kwenye Daftari",
        witnessVoice: "👁️ Sauti ya Ushahidi",
        activeLanguage: "Kiswahili (SW)"
    }
};

/**
 * Updates UI elements and saves user preference
 */
export function translateUIElements(langCode) {
    const lexicon = translationDictionary[langCode] || translationDictionary.en;
    if (!lexicon) return;

    localStorage.setItem('preferredLang', langCode);

    // Update main composer elements
    const mainInput = document.getElementById('mainInput');
    const postButton = document.getElementById('postButton');
    const witnessVoiceBtn = document.getElementById('btn-vocaltruth');
    const activeBadge = document.getElementById('activeLanguageDisplay');

    if (mainInput) mainInput.placeholder = lexicon.placeholder;
    if (postButton) postButton.textContent = lexicon.postButton;
    if (witnessVoiceBtn) witnessVoiceBtn.textContent = lexicon.witnessVoice;
    if (activeBadge) activeBadge.textContent = lexicon.activeLanguage;

    // Update static UI text elements via ID mapping
    const mappings = {
        'privacy-notice-text': lexicon.privacyWarning,
        'security-upgrade-text': lexicon.upgradeSecurity,
        'settings-dashboard-text': lexicon.settingsDashboard,
        'logout-action-text': lexicon.logoutBtn
    };

    Object.entries(mappings).forEach(([id, text]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    });
}

/**
 * Auto-load user's last saved language
 */
export function initLanguage() {
    const savedLang = localStorage.getItem('preferredLang') || 'en';
    
    const langSelect = document.getElementById('languageSelector');
    if (langSelect) langSelect.value = savedLang;

    translateUIElements(savedLang);
}

/**
 * Wrapper for the language change event
 */
export function changeLanguage(langCode) {
    translateUIElements(langCode);
    // Assuming showToast is still imported from './utils.js'
    // showToast(`Language switched to ${langCode.toUpperCase()}`);
}
