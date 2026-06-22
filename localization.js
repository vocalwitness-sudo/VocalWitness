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
