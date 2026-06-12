import { showToast } from "./utils.js";
import { listenToLedgerFeed } from "./feed.js";

const translations = {
    '+234-ha': { placeholder: "Me ka gani da kanka a yau? Shigar da shaidarku...", button: "YADA SHAIDARKA", msg: "Hausa mode activated." },
    '+234-yo': { placeholder: "Kini o foju ara rẹ rí loni? Sọ otitọ rẹ...", button: "PIN SỌ TITỌ", msg: "Yorùbá mode activated." },
    // ... rest of your objects
};

export function changeLanguage(lang) {
    localStorage.setItem('preferredLanguage', lang);

    const mainInput = document.getElementById('mainInput');
    const postButton = document.getElementById('postButton');
    const data = translations[lang];

    if (data) {
        if (mainInput) mainInput.placeholder = data.placeholder;
        if (postButton) postButton.innerText = data.button;
        showToast(data.msg);
    } else {
        if (mainInput) mainInput.placeholder = "Provide raw, unedited personal journalistic or forensic descriptions...";
        if (postButton) postButton.innerText = "Publish to Decentralized Ledger";
        showToast("Language set to English.");
    }
    
    // Call the function directly, no window check needed
    listenToLedgerFeed();
}
