// ==========================================
// 🌐 MULTI-LANGUAGE TRANSLATION DICTIONARY
// ==========================================
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

// Add this to your existing js/utils.js
export function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-5 right-5 bg-gray-800 text-white p-4 rounded shadow-lg z-50';
    toast.innerText = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}
// ==========================================
// 🔄 LIVE DOM LANGUAGE TRANSLATION ENGINE
// ==========================================
export function translateUIElements(langCode) {
    const lexicon = translationDictionary[langCode];
    if (!lexicon) return; // Skip if chosen language translation isn't added yet

    // Direct, target matches for your layout elements
    const privacyNoticeText = document.getElementById('privacy-notice-text');
    const securityUpgradeText = document.getElementById('security-upgrade-text');
    const settingsDashboardText = document.getElementById('settings-dashboard-text');
    const logoutActionText = document.getElementById('logout-action-text');

    if (privacyNoticeText) privacyNoticeText.textContent = lexicon.privacyWarning;
    if (securityUpgradeText) securityUpgradeText.textContent = lexicon.upgradeSecurity;

    // Add this to js/utils.js
export async function generateSha256Hash(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
    if (settingsDashboardText) settingsDashboardText.textContent = lexicon.settingsDashboard;
    if (logoutActionText) logoutActionText.textContent = lexicon.logoutBtn;
}
