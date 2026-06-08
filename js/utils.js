/**
 * VocalWitness Utilities Module
 * Handles Localization, Cryptographic Hashing, and UI Feedback
 */

// 🌐 Multi-Language Dictionary
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
 * UI Feedback: Displays a temporary notification
 */
export function showToast(message, type = "success") {
    const toast = document.createElement('div');
    const bgColor = type === 'error' ? 'bg-red-600' : 'bg-emerald-600';
    toast.className = `fixed bottom-5 right-5 p-4 rounded-2xl shadow-2xl z-[100] text-white font-bold text-sm ${bgColor}`;
    toast.innerText = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

/**
 * Data Mode Toggle
 */
export function isLowDataMode() {
    return localStorage.getItem('lowDataMode') === 'true';
}

export function toggleLowDataMode() {
    const current = isLowDataMode();
    localStorage.setItem('lowDataMode', !current);
    location.reload();
}

/**
 * Cryptographic Hash Generator (for Files)
 */
export async function generateSha256Hash(fileOrString) {
    const data = (typeof fileOrString === 'string') 
        ? new TextEncoder().encode(fileOrString) 
        : await fileOrString.arrayBuffer();
        
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Live DOM Translation Engine
 */
export function translateUIElements(langCode) {
    const lexicon = translationDictionary[langCode];
    if (!lexicon) return;

    const mappings = {
        'privacy-notice-text': lexicon.privacyWarning,
        'security-upgrade-text': lexicon.upgradeSecurity,
        'settings-dashboard-text': lexicon.settingsDashboard,
        'logout-action-text': lexicon.logoutBtn
    };

    Object.keys(mappings).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = mappings[id];
    });
}

// Bind to window for global access
window.showToast = showToast;
window.toggleLowDataMode = toggleLowDataMode;
