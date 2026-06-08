/**
 * VocalWitness Internationalization (i18n) Module
 * Manages global accessibility and localized node interface
 */

export const translationDictionary = {
    en: {
        privacyWarning: "Privacy Protection Warning (ZERO-KNOWLEDGE CRYPTOGRAPHIC PROTOCOL NOTICE)",
        upgradeSecurity: "Upgrade Security and Permissions (Code + Privacy Proofs)",
        settingsDashboard: "Settings Dashboard",
        logoutBtn: "Log Out"
    },
    ha: {
        privacyWarning: "Gargaɗi Game da Tsaron Sirri (SANARWAR TSARIN SIRRI NA ZERO-KNOWLEDGE)",
        upgradeSecurity: "Haɓaka Tsaro da Izini (Lambar Shaidar Sirri)",
        settingsDashboard: "Saitunan Dashboard",
        logoutBtn: "Fita Daga Shafin"
    },
    yo: {
        privacyWarning: "Ikilo Idaabobo Aṣiri (AṢIYAN PROTOCOL CRYPTOGRAPHIC KÒ SÍ ÌMỌ̀-IṢẸ́)",
        upgradeSecurity: "Ṣe Imudojuiwọn Aabo ati Awọn Gbigbanilaaye",
        settingsDashboard: "Dashboard Eto",
        logoutBtn: "Wọlé Kúrò"
    },
    ig: {
        privacyWarning: "Ịdọ aka na ntị maka nchebe nzuzo (ZERO-KNOWLEDGE CRYPTOGRAPHIC PROTOCOL NOTICE)",
        upgradeSecurity: "Melite Nchebe na Ikike",
        settingsDashboard: "Ebe Ndabere Ntọala",
        logoutBtn: "Banye Pụọ"
    },
    sw: {
        privacyWarning: "Onyo la Kulinda Faragha (ILANI YA PROTOKALI YA USINDIKAJI WA BIOMETRIKI)",
        upgradeSecurity: "Boresha Usalama na Ruhusa",
        settingsDashboard: "Eneo la Mipangilio",
        logoutBtn: "Ondoka Kwenye Akaunti"
    }
};

/**
 * Updates UI elements and saves user preference
 */
export function translateUIElements(langCode) {
    const lexicon = translationDictionary[langCode];
    if (!lexicon) return;

    localStorage.setItem('preferredLang', langCode);

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
    translateUIElements(savedLang);
    const langSelect = document.getElementById('language-select');
    if (langSelect) langSelect.value = savedLang;
}
