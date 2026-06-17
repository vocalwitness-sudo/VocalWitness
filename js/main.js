/**
 * Centralized UI Listener Attachment
 * Refactored for safety, readability, and modular navigation
 */
function attachUIListeners() {
    
    // ==========================================
    // HELPER: Navigation Logic
    // ==========================================
    const navigate = (sectionId) => {
        const sections = ['homeSection', 'profileSection']; // Add more as you create them
        sections.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.toggle('active', id === sectionId);
        });
    };

    // ==========================================
    // NAVIGATION & FEED
    // ==========================================
    document.getElementById('btn-premium')?.addEventListener('click', googleLogin);

    document.getElementById('languageSelector')?.addEventListener('change', (e) => {
        changeLanguage(e.target.value);
    });

    document.getElementById('btn-witnessvoice')?.addEventListener('click', () => {
        currentFeed = 'witness-voice';
        initFeed(db, currentFeed);
        showToast("👁️ Witness Voice Mode Activated");
    });

    document.getElementById('btn-citizentalk')?.addEventListener('click', () => {
        currentFeed = 'citizen-talk';
        initFeed(db, currentFeed);
        showToast("💬 Citizen / Street Talk Mode Activated");
    });

    // ==========================================
    // MEDIA & PUBLISHING
    // ==========================================
    document.getElementById('btn-photo')?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => handleImageSelect(e, document.getElementById('preview-area'));
        input.click();
    });

    document.getElementById('btn-voice')?.addEventListener('click', (e) => toggleVoiceRecording(e.currentTarget));

    document.getElementById('postButton')?.addEventListener('click', async () => {
        const input = document.getElementById('mainInput');
        const text = input?.value.trim();
        
        if (!text && !selectedImageFile && !engine?.currentAudioBlob) {
            return showToast("Please add text, photo, or voice testimony", "error");
        }

        const tempId = 'temp-' + Date.now();
        addPostToFeed({ id: tempId, witnessText: text || "📸 Media Testimony" }, true);

        const clientPhoneVerified = !!state?.user?.providerData?.some(p => p.providerId === 'phone') || 
                                    !!document.getElementById('trust-score')?.innerText.includes('100');

        try {
            const mediaData = await uploadForensicMedia("current-user");
            await addDoc(collection(db, "testimonies"), {
                witnessText: text || "",
                feedVisibility: currentFeed,
                timestamp: new Date().toISOString(),
                languageCode: localStorage.getItem('preferredLang') || 'en',
                authorId: state?.user?.uid || "anonymous",
                ...mediaData,
                moderation: {
                    trustScore: clientPhoneVerified ? 100 : 50,
                    verificationsCount: 0,
                    disputesCount: 0
                }
            });

            if (input) input.value = '';
            if (typeof resetMediaState === 'function') resetMediaState();
            if (engine) engine.currentAudioBlob = null;
            showToast("✅ Forensic Testimony Published Successfully");
        } catch (e) {
            console.error(e);
            showToast("Failed to publish testimony", "error");
        }
    });

    // ==========================================
    // PROFILE NAVIGATION
    // ==========================================
    document.getElementById('btn-profile')?.addEventListener('click', () => {
        if (!state?.user) {
            showToast("Sign in required to view your profile", "info");
            googleLogin();
            return;
        }
        navigate('profileSection');
        updateProfileUI(state.user);
    });

    document.getElementById('btn-close-profile')?.addEventListener('click', () => navigate('homeSection'));
    document.getElementById('btn-logout')?.addEventListener('click', logout);

    // ==========================================
    // PHONE VERIFICATION
    // ==========================================
    const phoneModal = document.getElementById('phoneModal');
    
    document.getElementById('btn-verify-phone')?.addEventListener('click', () => {
        document.getElementById('phone-step-1')?.classList.remove('hidden');
        document.getElementById('phone-step-2')?.classList.add('hidden');
        phoneModal?.classList.remove('hidden');
    });

    document.getElementById('close-phone-modal')?.addEventListener('click', () => phoneModal?.classList.add('hidden'));

    document.getElementById('btn-send-otp')?.addEventListener('click', async (e) => {
        const phoneRaw = document.getElementById('phone-number-input')?.value.trim();
        if (!phoneRaw || !phoneRaw.startsWith('+') || phoneRaw.length < 8) {
            return showToast("Please enter a valid phone number (e.g., +1234567890)", "error");
        }
        e.target.disabled = true;
        const isSent = await sendPhoneVerification(phoneRaw);
        if (isSent) {
            document.getElementById('phone-step-1')?.classList.add('hidden');
            document.getElementById('phone-step-2')?.classList.remove('hidden');
        }
        e.target.disabled = false;
    });

    document.getElementById('btn-verify-otp')?.addEventListener('click', async (e) => {
        const otpCode = document.getElementById('phone-otp-input')?.value.trim();
        if (!otpCode || otpCode.length !== 6 || isNaN(otpCode)) {
            return showToast("Please enter a valid 6-digit code.", "error");
        }
        e.target.disabled = true;
        const success = await verifyPhoneCode(otpCode);
        if (success) {
            phoneModal?.classList.add('hidden');
            const score = document.getElementById('trust-score');
            if (score) score.innerText = "100";
        }
        e.target.disabled = false;
    });
}
