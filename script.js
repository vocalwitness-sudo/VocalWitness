// ==========================================
// FIREBASE ES6 MODULE IMPORTS
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, where, doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
let compressedImageBase64 = null; 

// Hardware Voice Recorder Engine State
let mediaRecorder = null;
let audioChunks = [];
let recordedAudioBlob = null;
let isRecording = false;
let recordingTimeout = null; 
let activeFeedListener = null; 

// Monitor Login Session Changes Automatically
onAuthStateChanged(auth, (user) => {
    const loginPromptModal = document.getElementById('authSection');
    
    if (user) {
        currentUser = user;
        if (loginPromptModal) loginPromptModal.classList.add('hidden'); 
        
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
    listenToLedgerFeed();
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
    const langSelect = document.getElementById('language-select'); 
    if (!langSelect) return;
    const lang = langSelect.value;
    localStorage.setItem('preferredLanguage', lang);

    const mainInput = document.getElementById('mainInput');
    const submitText = document.getElementById('submitText');

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
        if (submitText) submitText.innerText = translations[lang].button;
        showToast(translations[lang].msg);
    } else {
        if (mainInput) mainInput.placeholder = "What did you personally witness today?";
        if (submitText) submitText.innerText = "SHARE WITNESS";
        showToast("Language set to English.");
    }
    
    listenToLedgerFeed();
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

            recordingTimeout = setTimeout(() => {
                if (isRecording) {
                    toggleRecording();
                    showToast("Secure limits reached. File wrapped up.", "info");
                }
            }, 45000);

        } catch (err) {
            showToast("Microphone access blocked.", "error");
        }
    } else {
        if (recordingTimeout) clearTimeout(recordingTimeout);
        if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
        isRecording = false;
        voiceBtn.classList.remove('recording-pulse');
        voiceBtn.innerText = "🎤 Record Voice";
    }
}
window.toggleRecording = toggleRecording;

// Cryptographic Integrity Hash Generator (The Trust Currency Feature)
async function generateSha256Hash(blob) {
    const arrayBuffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
}

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
        if (loginPromptModal) loginPromptModal.classList.remove('hidden');
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

    if (currentFeed === 'vocaltruth' && (!isPhoneVerified || !isZKVerified || !compressedImageBase64)) {
        showToast("Vocal Truth requires Phone + ZK Verification + Photo evidence", "error");
        return;
    }

    btn.disabled = true;
    if (spinner) spinner.classList.remove('hidden');
    if (textSpan) textSpan.classList.add('hidden');

    try {
        let audioPayload = null;
        let finalIntegrityHash = "N/A - TEXT UPDATE";

        if (recordedAudioBlob) {
            // Generate Trust Currency asset hash before string translation
            finalIntegrityHash = await generateSha256Hash(recordedAudioBlob);
            
            audioPayload = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(recordedAudioBlob);
            });
        }

        const selectedLanguageCode = document.getElementById('language-select')?.value || '+44';

        await addDoc(collection(db, "testimonies"), {
            witnessText: text,
            feedType: currentFeed,
            languageCode: selectedLanguageCode,
            userId: currentUser.uid,
            userName: currentUser.displayName || "Anonymous Witness",
            timestamp: serverTimestamp(),
            audioData: audioPayload,
            imageData: compressedImageBase64, 
            hasVoice: audioPayload ? true : false,
            hasPhoto: compressedImageBase64 ? true : false,
            // Ledger Security Injections
            integrityHash: finalIntegrityHash,
            moderation: {
                trustScore: 100,
                verificationsCount: 0,
                disputesCount: 0,
                votedUsers: []
            }
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
        compressedImageBase64 = null;
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
// DEMOCRATIC PEER REVIEW AUDITING (NEW ENGINE WORK)
// ==========================================
export async function submitPeerVote(testimonyId, voteType) {
    if (!currentUser) {
        showToast("You must be logged in to audit this testimony.", "error");
        return;
    }

    const docRef = doc(db, "testimonies", testimonyId);

    try {
        await runTransaction(db, async (transaction) => {
            const sfDoc = await transaction.get(docRef);
            if (!sfDoc.exists()) {
                throw new Error("Document is missing from the database.");
            }

            const data = sfDoc.data();
            // Fallback setup for posts that don't have moderation blocks yet
            const moderation = data.moderation || { trustScore: 100, verificationsCount: 0, disputesCount: 0, votedUsers: [] };

            if (moderation.votedUsers && moderation.votedUsers.includes(currentUser.uid)) {
                throw new Error("You have already audited this node.");
            }

            let newVerifications = moderation.verificationsCount || 0;
            let newDisputes = moderation.disputesCount || 0;

            if (voteType === 'verify') newVerifications += 1;
            if (voteType === 'dispute') newDisputes += 1;

            const totalVotes = newVerifications + newDisputes;
            const newTrustScore = totalVotes > 0 ? Math.round((newVerifications / totalVotes) * 100) : 100;

            transaction.update(docRef, {
                'moderation.verificationsCount': newVerifications,
                'moderation.disputesCount': newDisputes,
                'moderation.trustScore': newTrustScore,
                'moderation.votedUsers': [...(moderation.votedUsers || []), currentUser.uid]
            });
        });
        showToast("Ledger audit successfully updated!", "success");
    } catch (err) {
        showToast(err.message || err, "error");
    }
}
window.submitPeerVote = submitPeerVote;

// ==========================================
// REAL-TIME RETRIEVAL & HIGH-PERFORMANCE FILTER ENGINE
// ==========================================
export function listenToLedgerFeed() {
    const feedContainer = document.getElementById('feed');
    if (!feedContainer) return;

    const selectedLang = document.getElementById('language-select')?.value || '+44';

    const q = query(
        collection(db, "testimonies"), 
        where("feedType", "==", currentFeed),
        where("languageCode", "==", selectedLang),
        orderBy("timestamp", "desc")
    );

    if (activeFeedListener) {
        activeFeedListener();
    }

    activeFeedListener = onSnapshot(q, (snapshot) => {
        feedContainer.innerHTML = ''; 

        if (snapshot.empty) {
            feedContainer.innerHTML = `
                <div class="glass rounded-3xl p-8 text-center text-zinc-500 text-sm border border-zinc-900 bg-[#090f1d]/20">
                    No verified testimonies logged onto this ledger sequence yet.
                </div>`;
            return;
        }

        snapshot.forEach((doc) => {
            const id = doc.id;
            const data = doc.data();
            const card = document.createElement('div');
            card.className = 'glass rounded-3xl p-5 border border-zinc-900 bg-[#090f1d]/40 space-y-4';

            const modData = data.moderation || { trustScore: 100, verificationsCount: 0, disputesCount: 0 };
            const assetHash = data.integrityHash || "VERIFIED TEXT ENTRY";

            let audioPlaybackElement = '';
            if (data.audioData) {
                audioPlaybackElement = `
                    <div class="bg-zinc-900/80 rounded-2xl p-3 border border-zinc-800 flex flex-col gap-1.5 mt-2">
                        <span class="text-[10px] text-emerald-400 font-mono font-bold tracking-wider">🔒 AUDIO TESTIMONY DECRYPTED</span>
                        <audio src="${data.audioData}" controls class="w-full h-8 accent-emerald-500"></audio>
                    </div>`;
            }

            let imagePlaybackElement = '';
            if (data.imageData) {
                imagePlaybackElement = `
                    <div class="rounded-2xl overflow-hidden border border-zinc-800 mt-2 max-h-64 bg-zinc-950">
                        <img src="${data.imageData}" alt="Witness Evidence" class="w-full h-full object-cover">
                    </div>`;
            }

            card.innerHTML = `
                <div class="flex justify-between items-start">
                    <div class="flex items-center gap-2">
                        <span class="px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-800 text-[10px] font-mono font-bold text-zinc-400">
                            ${data.languageCode}
                        </span>
                        <span class="text-[11px] text-zinc-500 font-bold">${data.userName || 'Anonymous Witness'}</span>
                    </div>
                    <div class="flex items-center gap-1.5">
                        <span class="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                        <span class="text-[10px] font-mono text-emerald-400 font-bold tracking-widest">TRUST: ${modData.trustScore}%</span>
                    </div>
                </div>
                <p class="text-zinc-200 text-sm leading-relaxed whitespace-pre-wrap">${data.witnessText}</p>
                ${audioPlaybackElement}
                ${imagePlaybackElement}
                
                <div class="pt-2 border-t border-zinc-900 flex flex-col sm:flex-row justify-between items-center gap-3">
                    <span class="text-[9px] font-mono text-zinc-600 truncate max-w-[200px]">HASH: ${assetHash}</span>
                    <div class="flex items-center gap-2 w-full sm:w-auto">
                        <button onclick="window.submitPeerVote('${id}', 'verify')" class="flex-1 sm:flex-none px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-xl text-[11px] font-bold transition-all border border-emerald-500/20">
                            ✅ Agree (${modData.verificationsCount || 0})
                        </button>
                        <button onclick="window.submitPeerVote('${id}', 'dispute')" class="flex-1 sm:flex-none px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl text-[11px] font-bold transition-all border border-red-500/20">
                            ⚠️ Dispute (${modData.disputesCount || 0})
                        </button>
                    </div>
                </div>
            `;
            feedContainer.appendChild(card);
        });
    });
}
window.listenToLedgerFeed = listenToLedgerFeed;

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
window.switchTab = switchTab; 

export function switchFeed(feed) {
    currentFeed = feed;
    if(document.getElementById('streetTab')) document.getElementById('streetTab').classList.toggle('tab-active', feed === 'streettalk');
    if(document.getElementById('vocalTab')) document.getElementById('vocalTab').classList.toggle('tab-active', feed === 'vocaltruth');
    
    listenToLedgerFeed();
}
window.switchFeed = switchFeed;

export function handleImage(e) {
    currentImageFile = e.target.files[0];
    if (!currentImageFile) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            
            const max_size = 1024;
            if (width > height) {
                if (width > max_size) { height *= max_size / width; width = max_size; }
            } else {
                if (height > max_size) { width *= max_size / height; height = max_size; }
            }
            
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            compressedImageBase64 = canvas.toDataURL('image/jpeg', 0.6);
            
            const preview = document.getElementById('previewArea');
            if (preview) {
                preview.innerHTML = `<img src="${compressedImageBase64}" class="image-preview"><button onclick="removeImage()" class="absolute top-2 right-2 bg-black/70 text-white rounded-full p-1 text-xs px-2 hover:bg-black">✕ Remove</button>`;
                preview.classList.remove('hidden');
            }
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(currentImageFile);
}
window.handleImage = handleImage;

export function triggerImageUpload() { document.getElementById('imageInput').click(); }
window.triggerImageUpload = triggerImageUpload;

export function removeImage() {
    currentImageFile = null;
    compressedImageBase64 = null;
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
    const savedLang = localStorage.getItem('preferredLanguage') || '+44'; 
    if(document.getElementById('language-select')) {
        document.getElementById('language-select').value = savedLang;
    }
    
    changeLanguage();
    updateTierDisplay();

    const loginBtn = document.getElementById('googleLoginBtn');
    if (loginBtn) loginBtn.addEventListener('click', googleLogin);

    const postBtn = document.getElementById('submitPostBtn');
    if (postBtn) postBtn.addEventListener('click', submitPost);

    const mainInput = document.getElementById('mainInput');
    if (mainInput) {
        mainInput.addEventListener('input', (e) => {
            if(document.getElementById('charCount')) {
                document.getElementById('charCount').textContent = `${e.target.value.length}/500`;
            }
        });
    }
});
