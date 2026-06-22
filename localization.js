const translations = {
    "en": { /* your English JSON */ },
    "ar": { /* your Arabic JSON */ },
    "fr": { /* your French JSON */ },
    // ... etc
};

export function setLanguage(langCode) {
    const activeData = translations[langCode] || translations['en'];
    // Update all UI elements by class or ID
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        element.innerText = activeData[key];
    });
}

export function updateUILanguage(langCode) {
    document.documentElement.lang = langCode;
    const activeData = translations[langCode] || translations['en'];
    
    // Update innerText
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (activeData[key]) el.innerText = activeData[key];
    });

    // Update Placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (activeData[key]) el.placeholder = activeData[key];
    });
}

