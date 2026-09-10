// js/modals.js
// Central Profile & Settings Modal Controller + Phone Verification UI

import { populateEditProfileForm } from './profile.js';

function showModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function hideModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.add('hidden');
  modal.style.display = 'none';
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

export function closeProfile() {
  hideModal('profileModal');
}

export function closeEditProfile() {
  hideModal('editProfileModal');
}

export function closeSettings() {
  hideModal('settingsModal');
}

export function closePhoneVerification() {
  hideModal('phoneVerificationModal');
  if (typeof window.closeAllVerificationModals === 'function') {
    window.closeAllVerificationModals();
  }
}

export function openProfile() {
  showModal('profileModal');
}

export function openEditProfile() {
  // Populate form fields with current user state before showing the modal
  if (typeof populateEditProfileForm === 'function') {
    populateEditProfileForm();
  }
  showModal('editProfileModal');
}

export function openSettings() {
  showModal('settingsModal');
}

export function openPhoneVerification() {
  showModal('phoneVerificationModal');
  resetPhoneSteps();
}

function resetPhoneSteps() {
  const step1 = document.getElementById('phone-step-1');
  const step2 = document.getElementById('phone-step-2');
  if (step1) step1.classList.remove('hidden');
  if (step2) step2.classList.add('hidden');
  const phoneInput = document.getElementById('phone-input');
  const otpInput = document.getElementById('otp-input');
  if (phoneInput) phoneInput.value = '';
  if (otpInput) otpInput.value = '';
}

function showPhoneStep2() {
  const step1 = document.getElementById('phone-step-1');
  const step2 = document.getElementById('phone-step-2');
  if (step1) step1.classList.add('hidden');
  if (step2) step2.classList.remove('hidden');
}

function setupPhoneVerificationUI() {
  const sendBtn = document.getElementById('send-otp-btn');
  const verifyBtn = document.getElementById('verify-otp-btn');
  const changePhoneBtn = document.getElementById('change-phone-btn');

  sendBtn?.addEventListener('click', async () => {
    const phone = document.getElementById('phone-input')?.value?.trim();
    if (!phone) {
      if (typeof showToast === 'function') showToast('Please enter a phone number', 'error');
      return;
    }
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending...';
    try {
      const success = await window.sendPhoneVerification?.(phone);
      if (success) showPhoneStep2();
    } catch (err) {
      console.error(err);
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send Verification Code';
    }
  });

  verifyBtn?.addEventListener('click', async () => {
    const code = document.getElementById('otp-input')?.value?.trim();
    if (!code || code.length !== 6) {
      if (typeof showToast === 'function') showToast('Enter the 6-digit code', 'error');
      return;
    }
    verifyBtn.disabled = true;
    verifyBtn.textContent = 'Verifying...';
    try {
      await window.verifyPhoneCode?.(code);
    } catch (err) {
      console.error(err);
    } finally {
      verifyBtn.disabled = false;
      verifyBtn.textContent = 'Verify & Unlock Citizen Circle';
    }
  });

  changePhoneBtn?.addEventListener('click', () => {
    resetPhoneSteps();
  });
}

export function initProfileModals() {
  document.getElementById('closeProfileModalBtn')?.addEventListener('click', closeProfile);
  document.getElementById('closeEditProfileBtn')?.addEventListener('click', closeEditProfile);
  document.getElementById('cancelEditProfileBtn')?.addEventListener('click', closeEditProfile);
  document.getElementById('closeSettingsBtn')?.addEventListener('click', closeSettings);
  document.getElementById('closePhoneVerificationBtn')?.addEventListener('click', closePhoneVerification);

  ['profileModal', 'editProfileModal', 'settingsModal', 'phoneVerificationModal'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', (e) => {
      if (e.target.id === id) {
        if (id === 'profileModal') closeProfile();
        if (id === 'editProfileModal') closeEditProfile();
        if (id === 'settingsModal') closeSettings();
        if (id === 'phoneVerificationModal') closePhoneVerification();
      }
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeProfile();
      closeEditProfile();
      closeSettings();
      closePhoneVerification();
    }
  });

  document.getElementById('editProfileBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    openEditProfile();
  });

  document.getElementById('settingsBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    openSettings();
  });

  document.getElementById('securitySettingsBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    openSettings();
  });

  setupPhoneVerificationUI();
  console.log('✅ Profile + Phone modals initialized');
}

window.closeProfile = closeProfile;
window.closeEditProfile = closeEditProfile;
window.closeSettings = closeSettings;
window.closePhoneVerification = closePhoneVerification;
window.openPhoneVerification = openPhoneVerification;
window.openProfile = openProfile;
window.openEditProfile = openEditProfile;
window.openSettings = openSettings;