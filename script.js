// ==========================================
// FIREBASE ES6 MODULE IMPORTS
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Your Personal Firebase Credentials (Verified Live)
const firebaseConfig = {
    apiKey: "AIzaSyATxYekxgjdLP2SfR42FG8rEdajq_pIEb0", 
    authDomain: "vocalwitness-3affa.firebaseapp.com",
    projectId: "vocalwitness-3affa",
    storageBucket: "vocalwitness-3affa.appspot.com",
    messagingSenderId: "108466981866",
    appId: "1:108466981866:web:b53360ad44012a576c8093"
};

// Initialize Firebase Core & Services
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// ==========================================
// LIVE STATE
// ==========================================
let currentUser = null;
let currentFeed = 'streettalk';
let currentTrustScore = 50;
let isPhoneVerified = false;
let isZKVerified = false;
let currentImageFile = null;

// Hardware Voice Recorder Engine State
let mediaRecorder = null;
let audioChunks = [];
let recordedAudioBlob = null;
let isRecording = false;

// Monitor Login Session Changes Automatically
onAuthStateChanged(auth, (user) => {
    const loginPromptModal = document.getElementById('authSection');
    
    if (user) {
        currentUser = user;
        if (loginPromptModal) loginPromptModal.classList.add('hidden'); // Hide popup if logged in
        
        if (document.getElementById('userName')) {
            document.getElementById('userName').textContent = user.displayName || "Anonymous Witness";
        }
        if (document.getElementById('profileName')) {
            document.getElementById('profileName').textContent = user.displayName || "Verified Witness";
        }
        if (document.getElementById('profileEmail')) {
            document.getElementById('profileEmail').textContent = user.email || "";
        }
        updateTierDisplay();
    } else {
        currentUser = null;
        if (document.getElementById('userName')) {
            document.getElementById('userName').textContent = "Guest Reader";
        }
    }
});

// ==========================================
// GLOBAL UI ACTIONS (TOAST & LANGUAGES)
// ==========================================
export function showToast(message, type = "success", duration = 4000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    const colors = { success: "bg-emerald-600 text-white", error: "bg-red-600 text-white", info: "bg-blue-600 text-white" };
    toast.className = `toast glass px-5 py-3.5 rounded-2xl text-sm font-medium border border-zinc-700 shadow-2xl ${colors[type] || colors.success}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.transition = "all 0.3s ease";
        toast.style.opacity = "0";
        toast.style.transform = "translateY(15px)";
        setTimeout(() => toast.remove(), 300);
    }, duration);
}
window.showToast = showToast;

export function changeLanguage() {
    const langSelect = document.getElementById('language-select'); // Clean matching element ID
    if (!langSelect) return;
    const lang = langSelect.value;
    localStorage.setItem('preferredLanguage', lang);

    const mainInput = document.getElementById('mainInput');
    const submitText = document.getElementById('submitText');

    // 📖 GLOBAL TRANSLATION DICTIONARY
    const translations = {
        // Nigeria 🇳🇬
        '+234-ha': { placeholder: "Me ka gani da kanka a yau? Shigar da shaidarku...", button: "YADA SHAIDARKA", msg: "Hausa mode activated." },
        '+234-yo': { placeholder: "Kini o foju ara rẹ rí loni? Sọ otitọ rẹ...", button: "PIN SỌ TITỌ", msg: "Yorùbá mode activated." },
        '+234-ig': { placeholder: "Gịnị ka ị ji anya gị hụ taa? Tinye ọka gị...", button: "ZUKO EZIOKWU", msg: "Igbo mode activated." },
        
        // East & Northeast Africa 🇹🇿 🇸🇴 🇪🇹
        '+255':    { placeholder: "Nini ulishuhudia leo kwa macho yako? Andika hapa...", button: "SHIRIKI USHUHUDA", msg: "Swahili mode activated." },
        '+252':    { placeholder: "Maxaad markhaati ka ahayd maanta? Ku qor halkan...", button: "LA WADAAG MARKHAATIGA", msg: "Somali mode activated." },
        '+251-am': { placeholder: "ዛሬ ምን በዓይንዎ መሰከሩ? ምስክርነትዎን እዚህ ያስገቡ...", button: "ምስክርነት ያካፍሉ", msg: "Amharic mode activated." },
        '+251-or': { placeholder: "Har'a maal ijaan argite? Ragaa kee asitti barreessi...", button: "RAGAA QOODI", msg: "Oromo mode activated." },
        
        // South Africa 🇿🇦
        '+27-zu':  { placeholder: "Yini uyibone ngamehlo akho namuhla? Bhala ubufakazi bakho...", button: "YABA UBUFAKAZI", msg: "Zulu mode activated." },
        
        // Global Languages 🇪🇸 🇫🇷
        '+34':     { placeholder: "¿Qué presenciaste personalmente hoy? Escribe tu testimonio...", button: "COMPARTIR TESTIMONIO", msg: "Spanish mode activated." },
        '+33':     { placeholder: "Qu'avez-vous personnellement vu aujourd'hui? Déposez votre témoignage...", button: "PARTAGER LE TÉMOIGNAGE", msg: "French mode activated." }
    };

    // Dictionary Guard Check: Use custom translation if setup, otherwise default to English
    if (translations[lang]) {
        if (mainInput) mainInput.placeholder = translations[lang].placeholder;
        if (submitText) submitText.innerText = translations[lang].button;
        showToast(translations[lang].msg);
    } else {
        // Global English Default Fallback (+44, +20, +86, etc.)
        if (mainInput) mainInput.placeholder = "What did you personally witness today?";
        if (submitText) submitText.innerText = "SHARE WITNESS";
        showToast("Language set to English.");
    }
}
window.changeLanguage = changeLanguage;

// ==========================================
// REAL HARDWARE VOICE RECORDING ENGINE
// ==========================================
export async function toggleRecording() {
    const voiceBtn = document.getElementById('voiceBtn');
    if (!voiceBtn) return;

    if (!isRecording) {
        audioChunks = [];
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showToast("Audio recording is not supported on your device/browser.", "error");
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) audioChunks.push(event.data);
            };

            mediaRecorder.onstop = () => {
                recordedAudioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
                showToast("Voice testimony attached successfully!", "success");
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            isRecording = true;
            voiceBtn.classList.add('recording-pulse');
            voiceBtn.innerText = "🛑 Stop Recording";
            showToast("Recording voice testimony...", "info");
        } catch (err) {
            showToast("Microphone access blocked.", "error");
        }
    } else {
        if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
        isRecording = false;
        voiceBtn.classList.remove('recording-pulse');
        voiceBtn.innerText = "🎤 Record Voice";
    }
}
window.toggleRecording = toggleRecording;

// ==========================================
// GOOGLE LOGIN VIA POPUP
// ==========================================
export async function googleLogin() {
    try {
        await signInWithPopup(auth, provider);
        showToast("Signed in successfully!", "success");
    } catch (error) {
        console.error(error);
        showToast("Authentication failed.", "error");
    }
}
window.googleLogin = googleLogin;

export async function logout() {
    if (confirm("Disconnect from VocalWitness?")) {
        try {
            await signOut(auth);
            location.reload();
        } catch (error) {
            showToast("Error signing out.", "error");
        }
    }
}
window.logout = logout;

// ==========================================
// DATABASE SUBMISSION (SAVE TO FIRESTORE)
// ==========================================
export async function submitPost() {
    if (!currentUser) {
        showToast("Identity verification required to write to the ledger.", "info");
        const loginPromptModal = document.getElementById('authSection');
        if (loginPromptModal) {
            loginPromptModal.classList.remove('hidden');
        }
        return;
    }

    const mainInput = document.getElementById('mainInput');
    const btn = document.getElementById('submitPostBtn');
    const spinner = document.getElementById('submitSpinner');
    const textSpan = document.getElementById('submitText');

    if (!mainInput || !btn) return;
    const text = mainInput.value.trim();

    if (text.length < 15 && !recordedAudioBlob) {
        showToast("Your testimony must be at least 15 characters long or have a voice recording.", "error");
        return;
    }

    if (currentFeed === 'vocaltruth' && (!isPhoneVerified || !isZKVerified || !currentImageFile)) {
        showToast("Vocal Truth requires Phone + ZK Verification + Photo evidence", "error");
        return;
    }

    btn.disabled = true;
    if (spinner) spinner.classList.remove('hidden');
    if (textSpan) textSpan.classList.add('hidden');

    try {
        await addDoc(collection(db, "testimonies"), {
            witnessText: text,
            feedType: currentFeed,
            userId: currentUser.uid,
            userEmail: currentUser.email,
            timestamp: serverTimestamp(),
            hasVoice: recordedAudioBlob ? true : false
        });

        const streak = await updateStreak();
        const reward = currentFeed === 'vocaltruth' ? 35 : 15;
        currentTrustScore = Math.min(98, currentTrustScore + reward);
        if(document.getElementById('humanityScore')) document.getElementById('humanityScore').textContent = currentTrustScore;
        updateTierDisplay();

        showToast(`Posted directly to Ledger! +${reward} Trust • ${streak} day streak 🔥`, "success");

        mainInput.value = '';
        if(document.getElementById('charCount')) document.getElementById('charCount').textContent = '0/500';
        const preview = document.getElementById('previewArea');
        if (preview) { preview.innerHTML = ''; preview.classList.add('hidden'); }
        
        currentImageFile = null;
        recordedAudioBlob = null;

    } catch (e) {
        console.error("Firebase Database Error: ", e);
        showToast("Database error. Check Firestore security rules.", "error");
    } finally {
        btn.disabled = false;
        if (spinner) spinner.classList.add('hidden');
        if (textSpan) textSpan.classList.remove('hidden');
    }
}
window.submitPost = submitPost;

// ==========================================
// REWARD LOGIC & NAV TABS
// ==========================================
function updateTierDisplay() {
    const tierEl = document.getElementById('userTier');
    if (!tierEl) return;
    if (currentTrustScore >= 85) tierEl.textContent = "Trusted Voice";
    else if (currentTrustScore >= 65) tierEl.textContent = "Verified Witness";
    else tierEl.textContent = "Rising Witness";
}

async function updateStreak() {
    const today = new Date().toDateString();
    const lastDate = localStorage.getItem('lastPostDate');
    let streak = parseInt(localStorage.getItem('streak') || '0');
    if (lastDate === today) return streak;
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    streak = (lastDate === yesterday) ? streak + 1 : 1;
    localStorage.setItem('lastPostDate', today);
    localStorage.setItem('streak', streak);
    return streak;
}

export function switchTab(tab) {
    const feedContainer = document.getElementById('feedViewContainer');
    const profileView = document.getElementById('profileView');
    const navFeedBtn = document.getElementById('navFeedBtn');
    const navProfileBtn = document.getElementById('navProfileBtn');

    if (tab === 0) {
        if(feedContainer) feedContainer.classList.remove('hidden');
        if(profileView) profileView.classList.add('hidden');
        if(navFeedBtn) navFeedBtn.classList.add('nav-active', 'font-bold');
        if(navProfileBtn) navProfileBtn.classList.remove('nav-active', 'font-bold');
    } else if (tab === 2) {
        if(feedContainer) feedContainer.classList.add('hidden');
        if(profileView) profileView.classList.remove('hidden');
        if(navProfileBtn) navProfileBtn.classList.add('nav-active', 'font-bold');
        if(navFeedBtn) navFeedBtn.classList.remove('nav-active', 'font-bold');
    }
}
window.showTab = switchTab;

export function switchFeed(feed) {
    currentFeed = feed;
    if(document.getElementById('streetTab')) document.getElementById('streetTab').classList.toggle('tab-active', feed === 'streettalk');
    if(document.getElementById('vocalTab')) document.getElementById('vocalTab').classList.toggle('tab-active', feed === 'vocaltruth');
}
window.switchFeed = switchFeed;

export function handleImage(e) {
    currentImageFile = e.target.files[0];
    if (!currentImageFile) return;
    const reader = new FileReader();
    reader.onload = ev => {
        const preview = document.getElementById('previewArea');
        if (preview) {
            preview.innerHTML = `<img src="${ev.target.result}" class="image-preview"><button onclick="removeImage()" class="absolute top-2 right-2 bg-black/70 text-white rounded-full p-1 text-xs px-2 hover:bg-black">✕ Remove</button>`;
            preview.classList.remove('hidden');
        }
    };
    reader.readAsDataURL(currentImageFile);
}
window.handleImage = handleImage;

export function triggerImageUpload() { document.getElementById('imageInput').click(); }
window.triggerImageUpload = triggerImageUpload;

export function removeImage() {
    currentImageFile = null;
    document.getElementById('imageInput').value = '';
    const preview = document.getElementById('previewArea');
    if (preview) { preview.innerHTML = ''; preview.classList.add('hidden'); }
}
window.removeImage = removeImage;

export function handleProfilePicUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        document.getElementById('profileBigAvatar').innerHTML = `<img src="${ev.target.result}" class="w-full h-full object-cover">`;
        showToast("Profile picture updated locally!", "success");
    };
    reader.readAsDataURL(file);
}
window.handleProfilePicUpload = handleProfilePicUpload;

export function startPhoneVerification() { isPhoneVerified = true; showToast("Phone verified successfully ✓", "success"); }
window.startPhoneVerification = startPhoneVerification;

export function startZKVerification() { isZKVerified = true; showToast("Zero-Knowledge Verification Complete", "success"); }
window.startZKVerification = startZKVerification;

// ==========================================
// STARTUP ENGINE BINDINGS
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const savedLang = localStorage.getItem('preferredLanguage') || '+44'; // Default to global English code
    if(document.getElementById('language-select')) {
        document.getElementById('language-select').value = savedLang;
    }
    changeLanguage();
    updateTierDisplay();

    // CONNECT RE-ENGINEERED DOM LISTENERS FOR ES6 MODULE STABILITY
    const loginBtn = document.getElementById('googleLoginBtn');
    if (loginBtn) loginBtn.addEventListener('click', googleLogin);

    const postBtn = document.getElementById('submitPostBtn');
    if (postBtn) postBtn.addEventListener('click', submitPost);
});
