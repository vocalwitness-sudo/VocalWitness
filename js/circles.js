
import { showToast } from "./utils.js";

export function changeLanguage() {
    const langSelect = document.getElementById('language-select'); 
    if (!langSelect) return;
    const lang = langSelect.value;
    localStorage.setItem('preferredLanguage', lang);

    const mainInput = document.getElementById('mainInput');
    const postButton = document.getElementById('postButton');

    const translations = {
        '+234-ha': { placeholder: "Me ka gani da kanka a yau? Shigar da shaidarku...", button: "YADA SHAIDARKA", msg: "Hausa mode activated." },
        '+234-yo': { placeholder: "Kini o foju ara rẹ rí loni? Sọ otitọ rẹ...", button: "PIN SỌ TITỌ", msg: "Yorùbá mode activated." },
        '+234-ig': { placeholder: "Gịnị ka ị ji anya gị hụ taa? Tinye ọka gị...", button: "ZUKO EZIOKWU", msg: "Igbo mode activated." },
        '+255':    { placeholder: "Nini ulishuhudia leo kwa macho yako? Andika hapa...", button: "SHIRIKI USHUHUDA", msg: "Swahili mode activated." },
        '+252':    { placeholder: "Maxaad markhaati ka ahayd maanta? Ku qor halkan...", button: "LA WADAAG MARKHAATIGA", msg: "Somali mode activated." },
        '+251-am': { placeholder: "ዛሬ ምን በዓይንዎ መሰከሩ? ምስክርነትዎን እዚህ ያስገቡ...", button: "ምስክርነት ያካፍሉ", msg: "Amharic mode activated." },
        '+251-or': { placeholder: "Har'a maal ijaan argite? Ragaa kee asitti barreessi...", button: "RAGAA QOODI", msg: "Oromo mode activated." },
        '+27-zu':  { placeholder: "Yini uyibone ngamehlo akho namuhla? Bhala ubufakazi bakho...", button: "YABA UBUFAKAZI", msg: "Zulu mode activated." },
        '+34':     { placeholder: "¿Qué presenciaste personalmente hoy? Escribe tu testimonio...", button: "COMPARTIR TESTIMONIO", msg: "Spanish mode activated." },
        '+33':     { placeholder: "Qu'avez-vous personnellement vu aujourd'hui? Déposez votre témoignage...", button: "PARTAGER LE TÉMOIGNAGE", msg: "French mode activated." }
    };

    if (translations[lang]) {
        if (mainInput) mainInput.placeholder = translations[lang].placeholder;
        if (postButton) postButton.innerText = translations[lang].button;
        showToast(translations[lang].msg);
    } else {
        if (mainInput) mainInput.placeholder = "Provide raw, unedited personal journalistic or forensic descriptions...";
        if (postButton) postButton.innerText = "Publish to Decentralized Ledger";
        showToast("Language set to English.");
    }
    
    if (window.listenToLedgerFeed) window.listenToLedgerFeed();
}
window.changeLanguage = changeLanguage;



