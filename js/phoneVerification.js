
// js/phoneVerification.js - Production-hardened
import { db, auth } from './firebase-config.js';
import { RecaptchaVerifier, linkWithPhoneNumber } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { showToast } from "./utils.js";
import { refreshTierAndUI } from './tier.js';
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js";

let recaptchaVerifier = null;
let confirmationResult = null;
let demoCode = null;

const isDemoMode =
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1') &&
  location.search.includes('demo=true');

function normalizePhone(raw) {
  let p = String(raw || '').trim().replace(/[\s\-()]/g, '');
  if (!p) return '';
  if (p.startsWith('0') && p.length >= 10) p = '+234' + p.slice(1); // Nigeria-first
  if (!p.startsWith('+')) p = '+' + p.replace(/^\+/, '');
  return p;
}

async function triggerServerPhoneConfirmation() {
  const functions = getFunctions();
  const confirm = httpsCallable(functions, "confirmPhoneVerification");
  await confirm({});
  // Force fresh ID token so custom claims (if any) and rules see latest state
  if (auth.currentUser) {
    await auth.currentUser.getIdToken(true);
  }
  if (typeof refreshTierAndUI === 'function') refreshTierAndUI();
  try {
    const { updateVerificationUI } = await import('./auth.js');
    updateVerificationUI?.(true);
  } catch (_) {}
}

export function initPhoneRecaptcha(containerId = 'phone-recaptcha-container') {
  if (isDemoMode) return null;
  try {
    let el = document.getElementById(containerId);
    if (!el) {
      el = document.createElement('div');
      el.id = containerId;
      el.className = 'flex justify-center my-2 min-h-[78px]';
      document.body.appendChild(el);
    }
    if (recaptchaVerifier) {
      try { recaptchaVerifier.clear(); } catch (_) {}
      recaptchaVerifier = null;
      window.recaptchaVerifier = null;
    }
    if (window.recaptchaVerifier) {
      try { window.recaptchaVerifier.clear(); } catch (_) {}
    }
    recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
      size: 'invisible',
      callback: () => {},
      'expired-callback': () => {
        showToast("Security check expired. Tap Send OTP again.", "error");
        try { recaptchaVerifier?.clear(); } catch (_) {}
        recaptchaVerifier = null;
        window.recaptchaVerifier = null;
      }
    });
    window.recaptchaVerifier = recaptchaVerifier;
    return recaptchaVerifier;
  } catch (e) {
    console.warn("reCAPTCHA init failed:", e);
    showToast("Security check failed to load. Refresh the page.", "error");
    return null;
  }
}

export function ensurePhoneModal() {
  let modal = document.getElementById('phoneVerificationModal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'phoneVerificationModal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'phone-modal-title');
  modal.className = 'fixed inset-0 z-[110] hidden items-center justify-center bg-black/85 p-4';
  modal.innerHTML = `
    <div class="w-full max-w-md rounded-3xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
      <div class="mb-4 flex items-center justify-between">
        <h2 id="phone-modal-title" class="text-lg font-bold text-white">Verify phone · Citizen Circle</h2>
        <button type="button" class="close-modal-btn rounded-lg px-2 text-xl text-zinc-400 hover:text-white" aria-label="Close">×</button>
      </div>
      <p class="mb-4 text-sm text-zinc-400">
        International format required (e.g. <span class="font-mono text-emerald-400">+2348012345678</span>).
        Phone is used only for anti-spam — not written on the public sealed record.
      </p>
      <div id="phone-step-number" class="space-y-3">
        <label class="block text-xs font-medium text-zinc-300" for="phone-input">Phone number</label>
        <input id="phone-input" type="tel" inputmode="tel" autocomplete="tel"
               placeholder="+2348012345678"
               class="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none" />
        <div id="phone-recaptcha-container" class="flex min-h-[1px] justify-center"></div>
        <p id="phone-error" class="hidden text-sm text-red-400"></p>
        <button type="button" id="send-otp-btn"
                class="w-full rounded-xl bg-emerald-600 py-3 font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
          Send OTP
        </button>
      </div>
      <div id="phone-step-code" class="mt-4 hidden space-y-3">
        <label class="block text-xs font-medium text-zinc-300" for="otp-input">6-digit code</label>
        <input id="otp-input" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code"
               placeholder="123456"
               class="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-center font-mono text-lg tracking-widest text-white focus:border-emerald-500 focus:outline-none" />
        <button type="button" id="verify-otp-btn"
                class="w-full rounded-xl bg-emerald-600 py-3 font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
          Verify &amp; join Citizen Circle
        </button>
        <button type="button" id="resend-otp-btn" class="w-full text-sm text-zinc-400 hover:text-emerald-400">
          Resend code
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('.close-modal-btn')?.addEventListener('click', () => closeAllVerificationModals());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeAllVerificationModals();
  });

  modal.querySelector('#send-otp-btn')?.addEventListener('click', async () => {
    const input = modal.querySelector('#phone-input');
    const err = modal.querySelector('#phone-error');
    const phone = normalizePhone(input?.value);
    if (err) { err.classList.add('hidden'); err.textContent = ''; }
    if (!phone || phone.length < 10) {
      if (err) { err.textContent = 'Enter a valid international number, e.g. +2348012345678'; err.classList.remove('hidden'); }
      return;
    }
    const btn = modal.querySelector('#send-otp-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    const ok = await sendPhoneVerification(phone);
    if (btn) { btn.disabled = false; btn.textContent = 'Send OTP'; }
    if (ok) {
      modal.querySelector('#phone-step-code')?.classList.remove('hidden');
      modal.querySelector('#otp-input')?.focus();
    }
  });

  modal.querySelector('#verify-otp-btn')?.addEventListener('click', async () => {
    const code = modal.querySelector('#otp-input')?.value;
    const btn = modal.querySelector('#verify-otp-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Verifying…'; }
    await verifyPhoneCode(code);
    if (btn) { btn.disabled = false; btn.textContent = 'Verify & join Citizen Circle'; }
  });

  modal.querySelector('#resend-otp-btn')?.addEventListener('click', async () => {
    const phone = normalizePhone(modal.querySelector('#phone-input')?.value);
    if (phone) await sendPhoneVerification(phone);
  });

  modal.querySelector('#otp-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') modal.querySelector('#verify-otp-btn')?.click();
  });

  return modal;
}

export function setupModalDismissListeners() {
  if (window.__phoneModalDismissBound) return;
  window.__phoneModalDismissBound = true;
  document.addEventListener('click', (e) => {
    const target = e.target;
    if (
      target.closest('.close-modal-btn') ||
      target.closest('[data-dismiss="modal"]') ||
      target.classList?.contains('modal-backdrop')
    ) {
      if (target.closest('#phoneVerificationModal') || target.closest('#phone-upgrade-modal')) {
        e.preventDefault();
        closeAllVerificationModals();
      }
    }
  });
}

export function closeAllVerificationModals() {
  ['phoneVerificationModal', 'phone-upgrade-modal', 'verificationModal', 'phoneAuthModal'].forEach(id => {
    const modal = document.getElementById(id);
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      modal.style.display = 'none';
    }
  });
  document.body.style.overflow = '';
  if (recaptchaVerifier || window.recaptchaVerifier) {
    try { recaptchaVerifier?.clear(); window.recaptchaVerifier?.clear(); } catch (_) {}
    recaptchaVerifier = null;
    window.recaptchaVerifier = null;
  }
  confirmationResult = null;
  window.confirmationResult = null;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupModalDismissListeners);
} else {
  setupModalDismissListeners();
}

export function startPhoneVerification() {
  if (!auth.currentUser) {
    showToast("Please sign in first to verify your phone", "info");
    if (typeof window.showAuthModal === 'function') window.showAuthModal();
    return;
  }
  // Already has phone linked?
  const hasPhone = auth.currentUser.providerData?.some(p => p.providerId === 'phone');
  if (hasPhone) {
    triggerServerPhoneConfirmation()
      .then(() => {
        showToast("You are already phone verified (Citizen Circle).", "success");
        closeAllVerificationModals();
      })
      .catch(() => showToast("Could not refresh verification status.", "error"));
    return;
  }

  const modal = ensurePhoneModal();
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  modal.querySelector('#phone-step-code')?.classList.add('hidden');
  modal.querySelector('#phone-input')?.focus();
  initPhoneRecaptcha('phone-recaptcha-container');
}

export async function sendPhoneVerification(phoneNumber) {
  const phone = normalizePhone(phoneNumber);
  if (!phone || !phone.startsWith('+') || phone.length < 10) {
    showToast("Use international format, e.g. +2348012345678", "error");
    return false;
  }
  if (!auth.currentUser) {
    showToast("Please log in first", "error");
    return false;
  }
  if (isDemoMode) {
    demoCode = String(Math.floor(100000 + Math.random() * 900000));
    console.log(`%c🔑 DEMO OTP for ${phone}: ${demoCode}`, "color: lime; font-size: 16px; font-weight: bold");
    showToast("Demo OTP in console (F12)", "success");
    return true;
  }
  try {
    initPhoneRecaptcha('phone-recaptcha-container');
    if (!recaptchaVerifier) {
      showToast("Security check not ready. Refresh and try again.", "error");
      return false;
    }
    confirmationResult = await linkWithPhoneNumber(auth.currentUser, phone, recaptchaVerifier);
    window.confirmationResult = confirmationResult;
    showToast(`OTP sent to ${phone}`, "success");
    return true;
  } catch (e) {
    console.error("SMS Send Error:", e);
    if (e.code === 'auth/provider-already-linked') {
      const hasPhone = auth.currentUser.providerData.some(p => p.providerId === 'phone');
      if (hasPhone) {
        try { await triggerServerPhoneConfirmation(); } catch (_) {}
        showToast("You are already phone verified (Citizen Circle).", "success");
        closeAllVerificationModals();
        return true;
      }
      showToast("This phone number is already linked to another account.", "error");
      return false;
    }
    const map = {
      'auth/too-many-requests': "Too many attempts. Wait a few minutes.",
      'auth/invalid-phone-number': "Invalid phone number format.",
      'auth/quota-exceeded': "SMS quota exceeded. Try again later.",
      'auth/captcha-check-failed': "Security check failed. Refresh and try again.",
      'auth/credential-already-in-use': "This phone number is already linked to another account."
    };
    showToast(map[e.code] || e.message || "Failed to send OTP", "error");
    try { recaptchaVerifier?.clear(); } catch (_) {}
    recaptchaVerifier = null;
    window.recaptchaVerifier = null;
    return false;
  }
}

export async function verifyPhoneCode(enteredCode) {
  if (!auth.currentUser) {
    showToast("Please log in first", "error");
    return false;
  }
  const code = String(enteredCode || "").replace(/\D/g, "").trim();
  if (code.length !== 6) {
    showToast("Enter the 6-digit code", "error");
    return false;
  }
  try {
    if (isDemoMode) {
      if (code !== demoCode) {
        showToast("Incorrect code. Try again.", "error");
        return false;
      }
    } else {
      const result = confirmationResult || window.confirmationResult;
      if (!result) {
        showToast("No active verification. Please resend the code.", "error");
        return false;
      }
      await result.confirm(code);
    }
    await triggerServerPhoneConfirmation();
    showToast("Phone verified! You are in Citizen Circle", "success");
    closeAllVerificationModals();
    return true;
  } catch (e) {
    console.error("Verification Error:", e);
    const map = {
      'auth/invalid-verification-code': "Incorrect code. Check and try again.",
      'auth/code-expired': "Code expired. Request a new one.",
      'auth/credential-already-in-use': "This phone number is already linked to another account."
    };
    showToast(map[e.code] || "Invalid code or verification failed.", "error");
    return false;
  }
}

window.startPhoneVerification = startPhoneVerification;
window.sendPhoneVerification = sendPhoneVerification;
window.verifyPhoneCode = verifyPhoneCode;
window.initPhoneRecaptcha = initPhoneRecaptcha;
window.closeAllVerificationModals = closeAllVerificationModals;
window.ensurePhoneModal = ensurePhoneModal;
