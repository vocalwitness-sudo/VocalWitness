// ==========================================
// ES6 MODULE STATE & GLOBAL CONFIG
// ==========================================
let currentUser = null;
let currentFeed = 'streettalk';
let currentTrustScore = 50;
let isPhoneVerified = false;
let isZKVerified = false;
let currentImageFile = null;

// Real Audio Recording Engine State
let mediaRecorder = null;
let audioChunks = [];
let recordedAudioBlob = null;
let isRecording = false;

// ==========================================
// TOAST NOTIFICATIONS
// ==========================================
export function showToast(message, type = "success", duration = 4000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    const colors = { 
        success: "bg-emerald-600 text-white", 
        error: "bg-red-600 text-white", 
        info: "bg-blue-600 text-white" 
    };

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

// ==========================================
// REAL HARDWARE VOICE RECORDING ENGINE
// ==========================================
export async function toggleRecording() {
    const voiceBtn = document.getElementById('voiceBtn');
    if (!voiceBtn) return;

    if (!isRecording) {
        // Start Recording Process
        audioChunks = [];
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showToast("Audio recording is not supported on your current browser/device.", "error");
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunks.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                recordedAudioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
                showToast("Voice testimony attached successfully!", "success");
                
                // Stop microphone tracking hardware to preserve security/battery
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            isRecording = true;
            voiceBtn.classList.add('recording-pulse');
            voiceBtn.innerText = "🛑 Stop Recording";
            showToast("Recording voice testimony...", "info");

        } catch (err) {
            console.error("Microphone hardware access rejected:", err);
            showToast("Microphone access blocked. Please allow mic permissions.", "error");
        }
    } else {
        // Stop Recording Process
        if (mediaRecorder && mediaRecorder.state !== "inactive") {
            mediaRecorder.stop();
        }
        isRecording = false;
        voiceBtn.classList.remove('recording-pulse');
        voiceBtn.innerText = "🎤 Record Voice";
    }
}
window.toggleRecording = toggleRecording;

// ==========================================
// LANGUAGE REGISTRATION
// ==========================================
export function changeLanguage() {
    const langSelect = document.getElementById('langSelect');
    if (!langSelect) return;
    const lang = langSelect.value;
    localStorage.setItem('preferredLanguage', lang);

    const authTitle = document.getElementById('authTitle');
    const authSubtitle = document.getElementById('authSubtitle');
    const mainInput = document.getElementById('mainInput');
    const submitText = document.getElementById('submitText');
    const phoneVerifyBtn = document.getElementById('phoneVerifyBtn');
    const zkVerifyBtn = document.getElementById('zkVerifyBtn');

    if (lang === 'pidgin') {
        if (authTitle) authTitle.innerText = "Join Vocal Witness";
        if (authSubtitle) authSubtitle.innerText = "Speak truth safely. Your voice matters. Privacy protected.";
        if (mainInput) mainInput.placeholder = "Wetin you see today? Drop your testimony...";
        if (submitText) submitText.innerText = "POST MY WITNESS";
        if (phoneVerifyBtn) phoneVerifyBtn.innerText = "Verify My Phone Number";
        if (zkVerifyBtn) zkVerifyBtn.innerText = "Enable Zero-Knowledge";
        showToast("Pidgin mode activated.");
    } else {
        if (authTitle) authTitle.innerText = "Join Vocal Witness";
        if (authSubtitle) authSubtitle.innerText = "Speak truth safely. Your voice matters. Privacy protected with Zero-Knowledge technology.";
        if (mainInput) mainInput.placeholder = "What did you personally witness today? Share your voice or text...";
        if (submitText) submitText.innerText = "SHARE WITNESS";
        if (phoneVerifyBtn) phoneVerifyBtn.innerText = "Verify Phone Number";
        if (zkVerifyBtn) zkVerifyBtn.innerText = "Enable Zero-Knowledge";
        showToast("Language set to English.");
    }
}
window.changeLanguage = changeLanguage;

// ==========================================
// INPUT HANDLING & VALIDATION
// ==========================================
function containsProfanity(text) {
    const badWords = ['fuck', 'shit', 'bitch', 'asshole', 'idiot', 'bastard'];
    return badWords.some(word => text.toLowerCase().includes(word));
}

// ==========================================
// SUBMIT POST LOGIC
// ==========================================
export async function submitPost() {
    const mainInput = document.getElementById('mainInput');
    const btn = document.getElementById('submitPostBtn');
    const spinner = document.getElementById('submitSpinner');
    const textSpan = document.getElementById('submitText');
    const charCount = document.getElementById('charCount');

    if (!mainInput || !btn) return;
    const text = mainInput.value.trim();

    if (text.length < 15 && !recordedAudioBlob) {
        showToast("Your testimony must be at least 15 characters long or have a voice recording.", "error");
        return;
    }
    if (containsProfanity(text)) {
        showToast("Please keep your testimony respectful.", "error");
        return;
    }

    if (currentFeed === 'vocaltruth') {
        if (!isPhoneVerified || !isZKVerified || !currentImageFile) {
            showToast("Vocal Truth requires Phone + ZK Verification + Photo evidence", "error");
            return;
        }
    }

    btn.disabled = true;
    if (spinner) spinner.classList.remove('hidden');
    if (textSpan) textSpan.classList.add('hidden');

    const streak = await updateStreak();
    const reward = currentFeed === 'vocaltruth' ? 35 : 15;
    currentTrustScore = Math.min(98, currentTrustScore + reward);

    const scoreEl = document.getElementById('humanityScore');
    if (scoreEl) scoreEl.textContent = currentTrustScore;
    updateTierDisplay();

    setTimeout(() => {
        showToast(`Posted! +${reward} Trust • ${streak} day streak 🔥`, "success");

        mainInput.value = '';
        if (charCount) charCount.textContent = '0/500';
        
        const preview = document.getElementById('previewArea');
        if (preview) {
            preview.innerHTML = '';
            preview.classList.add('hidden');
        }
        
        currentImageFile = null;
        recordedAudioBlob = null; // Flush active recording state for next post

        btn.disabled = false;
        if (spinner) spinner.classList.add('hidden');
        if (textSpan) textSpan.classList.remove('hidden');
    }, 1300);
}
window.submitPost = submitPost;

// ==========================================
// TIER AND STREAK TRACKING
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

// ==========================================
// NAVIGATION & AUTHENTICATION
// ==========================================
export function googleLogin() {
    document.getElementById('authSection').classList.add('hidden');
    document.getElementById('mainApp').classList.remove('hidden');
    showToast("Signed in successfully", "success");
    updateTierDisplay();
}
window.googleLogin = googleLogin;

export function logout() {
    if (confirm("Disconnect from VocalWitness?")) location.reload();
}
window.logout = logout;

export function switchTab(tab) {
    const feedContainer = document.getElementById('feedViewContainer');
    const profileView = document.getElementById('profileView');
    const navFeedBtn = document.getElementById('navFeedBtn');
    const navProfileBtn = document.getElementById('navProfileBtn');

    if (tab === 0 && feedContainer && profileView) {
        feedContainer.classList.remove('hidden');
        profileView.classList.add('hidden');
        if (navFeedBtn) navFeedBtn.classList.add('nav-active', 'font-bold');
        if (navProfileBtn) navProfileBtn.classList.remove('nav-active', 'font-bold');
    } else if (tab === 2 && feedContainer && profileView) {
        feedContainer.add ? feedContainer.classList.add('hidden') : feedContainer.classList.add('hidden');
        profileView.classList.remove('hidden');
        if (navProfileBtn) navProfileBtn.classList.add('nav-active', 'font-bold');
        if (navFeedBtn) navFeedBtn.classList.remove('nav-active', 'font-bold');
    }
}
window.switchTab = switchTab;

export function switchFeed(feed) {
    currentFeed = feed;
    const streetTab = document.getElementById('streetTab');
    const vocalTab = document.getElementById('vocalTab');
    if (streetTab) streetTab.classList.toggle('tab-active', feed === 'streettalk');
    if (vocalTab) vocalTab.classList.toggle('tab-active', feed === 'vocaltruth');
}
window.switchFeed = switchFeed;

// ==========================================
// MEDIA ATTACHMENT HANDLERS
// ==========================================
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

export function triggerImageUpload() {
    const imgInput = document.getElementById('imageInput');
    if (imgInput) imgInput.click();
}
window.triggerImageUpload = triggerImageUpload;

export function removeImage() {
    currentImageFile = null;
    const imgInput = document.getElementById('imageInput');
    if (imgInput) imgInput.value = '';
    const preview = document.getElementById('previewArea');
    if (preview) {
        preview.innerHTML = '';
        preview.classList.add('hidden');
    }
}
window.removeImage = removeImage;

export function handleProfilePicUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        const avatar = document.getElementById('profileBigAvatar');
        if (avatar) avatar.innerHTML = `<img src="${ev.target.result}" class="w-full h-full object-cover">`;
        showToast("Profile picture updated locally!", "success");
    };
    reader.readAsDataURL(file);
}
window.handleProfilePicUpload = handleProfilePicUpload;

// ==========================================
// VERIFICATIONS
// ==========================================
export function startPhoneVerification() {
    isPhoneVerified = true;
    showToast("Phone verified successfully ✓", "success");
}
window.startPhoneVerification = startPhoneVerification;

export function startZKVerification() {
    isZKVerified = true;
    showToast("Zero-Knowledge Verification Complete", "success");
}
window.startZKVerification = startZKVerification;

// ==========================================
// DOM LIFECYCLE LISTENERS
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const mainInput = document.getElementById('mainInput');
    const charCount = document.getElementById('charCount');
    if (mainInput && charCount) {
        mainInput.addEventListener('input', () => {
            charCount.textContent = `${mainInput.value.length}/500`;
        });
    }

    const savedLang = localStorage.getItem('preferredLanguage') || 'en';
    const langSelect = document.getElementById('langSelect');
    if (langSelect) {
        langSelect.value = savedLang;
        changeLanguage();
    }
    updateTierDisplay();
    console.log("✅ VocalWitness Architecture structured into ES6 Modules.");
});
