// localization.js - Bridge to Hardened i18n Engine
import { t, loadTranslations, updateUILanguage, initLanguage } from './js/i18n.js';

export { t, updateUILanguage, initLanguage };

// Map setLanguage to loadTranslations so language selectors update everything instantly
export function setLanguage(langCode) {
    loadTranslations(langCode);
}
