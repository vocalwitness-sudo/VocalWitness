
// js/phoneVerification.js - Production-hardened (HTML modal + fallback)
import { auth } from './firebase-config.js';
import { RecaptchaVerifier, linkWithPhoneNumber } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { showToast } from "./utils.js";
import { refreshTierAndUI, clearProfileCache } from './tier.js';
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js";

let recaptchaVerifier = null;
let confirmationResult = null;
let demoCode = null;
let existingModalWired = false;

const isDemoMode =
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1') &&
  location.search.includes('demo=true');

/** Normalize NG / local numbers to E.164 */
export function normalizePhone(raw) {
  let p = String(raw || '').trim().replace(/[\s\-()]/g, '');
  if (!p) return '';
  if (p.startsWith('00')) p = '+' + p.slice(2);
  if (p.startsWith('0') && p.length >= 10) p = '+234' + p.slice(1); // Nigeria-first
  if (/^234\d{10}$/.test(p)) p = '+' + p;
  if (!p.startsWith('+')) p = '+' + p.replace(/^\+/, '');
  return p;
}

async function triggerServerPhoneConfirmation() {
  const functions = getFunctions();
  const confirm = httpsCallable(functions, "confirmPhoneVerification");
  await confirm({});

  if (auth.currentUser) {
    try {
      await auth.currentUser.getIdToken(true);
    } catch (_) {}
  }

  try {
    clearProfileCache?.();
  } catch (_) {}

  try {
    if (typeof refreshTierAndUI === 'function') {
      await Promise.resolve(refreshTierAndUI());
    }
  } catch (_) {}

  try {
    const { updateVerificationUI } = await import('./auth.js');
    updateVerificationUI?.(true);
  } catch (_) {
    if (typeof window.updateVerificationUI === 'function') {
      window.updateVerificationUI(true);
    }
  }
}

/**
 * Prefer dedicated container (not the Send button).
 * Supports ids used in index.html or ensurePhoneModal fallback.
 */
export function initPhoneRecaptcha(containerId = 'recaptcha-container') {
  if (isDemoMode) return null;

  const preferredIds = [
    containerId,
    'recaptcha-container',
    'phone-recaptcha-container'
  ];

  try {
    let el = null;
    let usedId = containerId;

    for (const id of preferredIds) {
      const found = document.getElementById(id);
      if (found) {
        el = found;
        usedId = id;
        break;
      }
    }

    if (!el) {
      el = document.createElement('div');
      el.id = 'recaptcha-container';
      el.className = 'flex justify-center my-2 min-h-[1px]';
      const modal =
        document.getElementById('phoneVerificationModal') ||
        document.getElementById('phone-upgrade-modal');
      if (modal) {
        const step1 =
          modal.querySelector('#phone-step-1') ||
          modal.querySelector('#phone-step-number') ||
          modal;
        step1.appendChild(el);
      } else {
        document.body.appendChild(el);
      }
      usedId = 'recaptcha-container';
    }

    if (recaptchaVerifier) {
      try { recaptchaVerifier.clear(); } catch (_) {}
      recaptchaVerifier = null;
    }
    if (window.recaptchaVerifier) {
      try { window.recaptchaVerifier.clear(); } catch (_) {}
      window.recaptchaVerifier = null;
    }

    recaptchaVerifier = new RecaptchaVerifier(auth, usedId, {
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

/** Wire buttons already in index.html (#send-otp-btn / #verify-otp-btn) once */
function wireExistingModalIfPresent() {
  if (existingModalWired) return;
  const modal = document.getElementById('phoneVerificationModal');
  if (!modal) return;
  existingModalWired = true;

  // Prefer global handlers so index.html inline listeners also work
  // (they call handleSendOTP / handleVerifyOTP if defined)
}

/**
 * Fallback modal only if index.html has no #phoneVerificationModal
 */
export function ensurePhoneModal() {
  let modal = document.getElementById('phoneVerificationModal');
  if (modal) {
    wireExistingModalIfPresent();
    return modal;
  }

  modal = document.createElement('div');
  modal.id = 'phoneVerificationModal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'phone-modal-title');
  modal.className =
    'fixed inset-0 z-[11050] hidden items-center justify-center bg-black/85 p-4 backdrop-blur-md';
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
      <div id="phone-step-1" class="space-y-3">
        <label class="block text-xs font-medium text-zinc-300" for="phone-input">Phone number</label>
        <input id="phone-input" type="tel" inputmode="tel" autocomplete="tel"
               placeholder="+2348012345678"
               class="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-white placeholder:text-zinc-600 focus:border-emerald-500 focus:outline-none" />
        <div id="recaptcha-container" class="flex min-h-[1px] justify-center"></div>
        <div id="phone-recaptcha-container" class="hidden"></div>
        <p id="phone-error" class="hidden text-sm text-red-400"></p>
        <button type="button" id="send-otp-btn"
                class="w-full rounded-xl bg-emerald-600 py-3 font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
          Send Verification Code
        </button>
      </div>
      <div id="phone-step-2" class="mt-4 hidden space-y-3">
        <p class="text-xs text-zinc-400">Code sent to <span id="phone-display" class="text-emerald-400 font-mono"></span></p>
        <label class="block text-xs font-medium text-zinc-300" for="otp-input">6-digit code</label>
        <input id="otp-input" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code"
               placeholder="123456"
               class="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-center font-mono text-lg tracking-widest text-white focus:border-emerald-500 focus:outline-none" />
        <button type="button" id="verify-otp-btn"
                class="w-full rounded-xl bg-emerald-600 py-3 font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
          Verify &amp; Unlock Citizen Circle
        </button>
        <button type="button" id="change-phone-btn" class="w-full text-sm text-zinc-400 hover:text-emerald-400">
          Change number
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

  modal.querySelector('#send-otp-btn')?.addEventListener('click', () => handleSendOTP());
  modal.querySelector('#verify-otp-btn')?.addEventListener('click', () => handleVerifyOTP());
  modal.querySelector('#resend-otp-btn')?.addEventListener('click', () => handleSendOTP());
  modal.querySelector('#change-phone-btn')?.addEventListener('click', () => {
    modal.querySelector('#phone-step-2')?.classList.add('hidden');
    modal.querySelector('#phone-step-1')?.classList.remove('hidden');
    setTimeout(() => modal.querySelector('#phone-input')?.focus(), 30);
  });
  modal.querySelector('#otp-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleVerifyOTP();
  });

  existingModalWired = true;
  return modal;
}

export function setupModalDismissListeners() {
  if (window.__phoneModalDismissBound) return;
  window.__phoneModalDismissBound = true;
  document.addEventListener('click', (e) => {
    const target = e.target;
    if (
      target.closest('.close-modal-btn') ||
      target.closest('#closePhoneVerificationBtn') ||
      target.closest('[data-dismiss="modal"]')
    ) {
      if (
        target.closest('#phoneVerificationModal') ||
        target.closest('#phone-upgrade-modal') ||
        target.closest('#closePhoneVerificationBtn')
      ) {
        e.preventDefault();
        closeAllVerificationModals();
      }
    }
  });
}

export function closeAllVerificationModals() {
  ['phoneVerificationModal', 'phone-upgrade-modal', 'verificationModal', 'phoneAuthModal'].forEach((id) => {
    const modal = document.getElementById(id);
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
    }
  });
  document.body.style.overflow = '';
  if (recaptchaVerifier || window.recaptchaVerifier) {
    try {
      recaptchaVerifier?.clear();
      window.recaptchaVerifier?.clear();
    } catch (_) {}
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

  const hasPhone = auth.currentUser.providerData?.some((p) => p.providerId === 'phone');
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
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  const step1 = modal.querySelector('#phone-step-1') || modal.querySelector('#phone-step-number');
  const step2 = modal.querySelector('#phone-step-2') || modal.querySelector('#phone-step-code');
  step2?.classList.add('hidden');
  step1?.classList.remove('hidden');

  setTimeout(() => modal.querySelector('#phone-input')?.focus(), 50);
  initPhoneRecaptcha('recaptcha-container');
}

/**
 * Used by index.html:
 *   if (typeof handleSendOTP === 'function') handleSendOTP();
 */
export async function handleSendOTP() {
  const input = document.getElementById('phone-input');
  const err = document.getElementById('phone-error');
  const raw = input?.value || '';
  const phone = normalizePhone(raw);

  if (err) {
    err.classList.add('hidden');
    err.textContent = '';
  }

  if (!phone || phone.length < 10) {
    const msg = 'Enter a valid number, e.g. +2348012345678';
    if (err) {
      err.textContent = msg;
      err.classList.remove('hidden');
    }
    showToast(msg, 'error');
    return;
  }

  if (input) input.value = phone;

  const btn = document.getElementById('send-otp-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Sending…';
  }

  try {
    const ok = await sendPhoneVerification(phone);
    if (ok) {
      document.getElementById('phone-step-1')?.classList.add('hidden');
      document.getElementById('phone-step-number')?.classList.add('hidden');
      document.getElementById('phone-step-2')?.classList.remove('hidden');
      document.getElementById('phone-step-code')?.classList.remove('hidden');
      const label = document.getElementById('phone-display');
      if (label) label.textContent = phone;
      setTimeout(() => document.getElementById('otp-input')?.focus(), 50);
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent =
        btn.textContent.includes('Send OTP') && !btn.dataset.label
          ? 'Send Verification Code'
          : (btn.dataset.label || 'Send Verification Code');
      if (!btn.dataset.label) {
        // restore common labels
        if (btn.innerHTML.includes('OTP') && btn.textContent === 'Sending…') {
          btn.textContent = 'Send Verification Code';
        } else if (btn.disabled === false && btn.textContent === 'Sending…') {
          btn.textContent = 'Send Verification Code';
        }
        btn.textContent = 'Send Verification Code';
      }
    }
  }
}

/**
 * Used by index.html:
 *   if (typeof handleVerifyOTP === 'function') handleVerifyOTP();
 */
export async function handleVerifyOTP() {
  const input = document.getElementById('otp-input');
  const code = input?.value || '';
  const btn = document.getElementById('verify-otp-btn');

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Verifying…';
  }

  try {
    await verifyPhoneCode(code);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Verify & Unlock Citizen Circle';
    }
  }
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
    console.log(
      `%c🔑 DEMO OTP for ${phone}: ${demoCode}`,
      "color: lime; font-size: 16px; font-weight: bold"
    );
    showToast("Demo OTP in console (F12)", "success");
    return true;
  }

  try {
    initPhoneRecaptcha('recaptcha-container');
    if (!recaptchaVerifier) {
      showToast("Security check not ready. Refresh and try again.", "error");
      return false;
    }

    confirmationResult = await linkWithPhoneNumber(
      auth.currentUser,
      phone,
      recaptchaVerifier
    );
    window.confirmationResult = confirmationResult;
    showToast(`OTP sent to ${phone}`, "success");
    return true;
  } catch (e) {
    console.error("SMS Send Error:", e);

    if (e.code === 'auth/provider-already-linked') {
      const hasPhone = auth.currentUser.providerData.some((p) => p.providerId === 'phone');
      if (hasPhone) {
        try {
          await triggerServerPhoneConfirmation();
        } catch (_) {}
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

    try {
      recaptchaVerifier?.clear();
    } catch (_) {}
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

// —— Globals required by index.html click handlers ——
window.handleSendOTP = handleSendOTP;
window.handleVerifyOTP = handleVerifyOTP;
window.normalizePhone = normalizePhone;
window.startPhoneVerification = startPhoneVerification;
window.sendPhoneVerification = sendPhoneVerification;
window.verifyPhoneCode = verifyPhoneCode;
window.initPhoneRecaptcha = initPhoneRecaptcha;
window.closeAllVerificationModals = closeAllVerificationModals;
window.ensurePhoneModal = ensurePhoneModal;
