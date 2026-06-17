function attachUIListeners() {
    // Premium Button
    document.getElementById('btn-premium')?.addEventListener('click', () => {
        googleLogin();
    });

    // Language Selector
    document.getElementById('languageSelector')?.addEventListener('change', (e) => {
        changeLanguage(e.target.value);
    });

    // Navigation (Feed tabs)
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

    // Media Buttons
    document.getElementById('btn-photo')?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => handleImageSelect(e, document.getElementById('preview-area'));
        input.click();
    });

    const voiceBtn = document.getElementById('btn-voice');
    if (voiceBtn) {
        voiceBtn.addEventListener('click', () => toggleVoiceRecording(voiceBtn));
    }

    // Publish Button
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
            
            // UPDATED: Use state?.user?.uid for author identification
            await addDoc(collection(db, "testimonies"), {
                witnessText: text || "",
                feedVisibility: currentFeed,
                timestamp: new Date().toISOString(),
                languageCode: localStorage.getItem('preferredLang') || 'en',
                
                // Fixed: Use real UID when logged in, otherwise "anonymous"
                authorId: state?.user?.uid || "anonymous",
                
                ...mediaData,
                moderation: {
                    trustScore: clientPhoneVerified ? 100 : 50,
                    verificationsCount: 0,
                    disputesCount: 0
                }
            });

            input.value = '';
            if (typeof resetMediaState === 'function') resetMediaState();
            if (engine) engine.currentAudioBlob = null;
            showToast("✅ Forensic Testimony Published Successfully");
        } catch (e) {
            console.error(e);
            showToast("Failed to publish testimony", "error");
        }
    });

    // ==================== PROFILE NAVIGATION ====================
    // ... (rest of your existing function code remains unchanged)
    const profileBtn = document.getElementById('btn-profile');
    const homeSection = document.getElementById('homeSection');
    const profileSection = document.getElementById('profileSection');
    const closeProfileBtn = document.getElementById('btn-close-profile');

    if (profileBtn) {
        profileBtn.addEventListener('click', () => {
            if (!state?.user) {
                googleLogin();
                return;
            }
            homeSection.classList.remove('active');
            profileSection.classList.add('active');
            updateProfileUI(state.user);
        });
    }

    if (closeProfileBtn) {
        closeProfileBtn.addEventListener('click', () => {
            profileSection.classList.remove('active');
            homeSection.classList.add('active');
        });
    }

    document.getElementById('btn-logout')?.addEventListener('click', logout);

    // ==================== PHONE VERIFICATION MODAL ====================
    const phoneModal = document.getElementById('phoneModal');
    const btnOpenPhoneModal = document.getElementById('btn-verify-phone');
    const btnClosePhoneModal = document.getElementById('close-phone-modal');
    const step1Container = document.getElementById('phone-step-1');
    const step2Container = document.getElementById('phone-step-2');
    const phoneNumberInput = document.getElementById('phone-number-input');
    const phoneOtpInput = document.getElementById('phone-otp-input');
    const btnSendOtp = document.getElementById('btn-send-otp');
    const btnVerifyOtp = document.getElementById('btn-verify-otp');

    if (btnOpenPhoneModal) {
        btnOpenPhoneModal.addEventListener('click', () => {
            if (step1Container && step2Container) {
                step1Container.classList.remove('hidden');
                step2Container.classList.add('hidden');
            }
            if (phoneNumberInput) phoneNumberInput.value = "";
            if (phoneOtpInput) phoneOtpInput.value = "";
            phoneModal?.classList.remove('hidden');
        });
    }

    if (btnClosePhoneModal) {
        btnClosePhoneModal.addEventListener('click', () => {
            phoneModal?.classList.add('hidden');
        });
    }

    if (btnSendOtp) {
        btnSendOtp.addEventListener('click', async () => {
            const phoneRaw = phoneNumberInput?.value.trim();
            if (!phoneRaw || !phoneRaw.startsWith('+') || phoneRaw.length < 8) {
                return showToast("Please enter a valid phone number starting with + and country code.", "error");
            }
            btnSendOtp.disabled = true;
            btnSendOtp.innerText = "Processing security handshake...";
            const isSent = await sendPhoneVerification(phoneRaw);
            if (isSent) {
                step1Container?.classList.add('hidden');
                step2Container?.classList.remove('hidden');
            }
            btnSendOtp.disabled = false;
            btnSendOtp.innerText = "Send Verification Code";
        });
    }

    if (btnVerifyOtp) {
        btnVerifyOtp.addEventListener('click', async () => {
            const otpCode = phoneOtpInput?.value.trim();
            if (!otpCode || otpCode.length !== 6 || isNaN(otpCode)) {
                return showToast("Please enter a valid 6-digit verification code.", "error");
            }
            btnVerifyOtp.disabled = true;
            btnVerifyOtp.innerText = "Anchoring confirmation data...";
            const success = await verifyPhoneCode(otpCode);
            if (success) {
                phoneModal?.classList.add('hidden');
                const trustScoreEl = document.getElementById('trust-score');
                if (trustScoreEl) trustScoreEl.innerText = "100";
            }
            btnVerifyOtp.disabled = false;
            btnVerifyOtp.innerText = "Verify & Upgrade Account";
        });
    }
}
