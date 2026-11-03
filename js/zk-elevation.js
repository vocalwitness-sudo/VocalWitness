// js/zk-elevation.js
import { elevateWithZKProof } from './zk-client.js';
import { showToast } from './utils.js';
import { auth } from './firebase-config.js';
import { clearProfileCache, refreshTierAndUI } from './tier.js';

let isElevating = false;

export async function startZKVerification() {
  if (isElevating) return;

  if (!auth.currentUser) {
    showToast('Sign in to start Higher Trust verification.', 'info');
    if (typeof window.showAuthModal === 'function') window.showAuthModal();
    return;
  }

  const btn = document.getElementById('btnStartZkVerify');
  const originalText = btn ? btn.textContent : 'Start Verification';

  isElevating = true;

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Working…';
    btn.classList.add('opacity-60', 'cursor-wait');
  }

  try {
    showToast('Starting Higher Trust verification…', 'info');

    const result = await elevateWithZKProof({ silent: false });

    if (!result) {
      throw new Error('Server did not return a valid result.');
    }

    const isReal = result.proofType === 'SNARK_GROTH16' && !result.isFallback;
    showToast(
      isReal
        ? '🛡️ Real zero-knowledge proof verified! You are now in Witness Circle.'
        : '🛡️ Higher Trust verified! You are now in Witness Circle.',
      'success'
    );

    // Clear caches
    if (typeof window.clearProfileCache === 'function') {
      window.clearProfileCache();
    }
    if (typeof clearProfileCache === 'function') {
      clearProfileCache();
    }

    // Refresh UI
    if (typeof window.refreshTierAndUI === 'function') {
      await window.refreshTierAndUI();
    } else if (typeof refreshTierAndUI === 'function') {
      await refreshTierAndUI();
    } else if (typeof window.renderProfileUI === 'function' && window.currentUserData) {
      window.currentUserData.zkVerified = true;
      window.currentUserData.tier = 'witness_circle';
      window.renderProfileUI(window.currentUserData);
    } else {
      setTimeout(() => location.reload(), 1400);
    }

    // Optional: update the button itself to show success state
    if (btn) {
      btn.textContent = '✓ Verified';
      btn.classList.remove('opacity-60', 'cursor-wait');
      btn.classList.add('bg-emerald-600/30', 'text-emerald-300', 'border-emerald-500');
    }
  } catch (err) {
    console.error('[ZK elevation]', err);
    showToast(err.message || 'Verification failed. Try again.', 'error');

    if (btn) {
      btn.disabled = false;
      btn.textContent = originalText;
      btn.classList.remove('opacity-60', 'cursor-wait');
    }
  } finally {
    isElevating = false;
  }
}

// Expose globally
window.startZKVerification = startZKVerification;

// Auto-bind
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btnStartZkVerify');
  if (btn && !btn.dataset.zkWired) {
    btn.dataset.zkWired = 'true';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      startZKVerification();
    });
  }
});
