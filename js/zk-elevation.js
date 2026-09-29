// js/zk-elevation.js
import { elevateWithZKProof } from './zk-client.js';
import { showToast } from './utils.js';
import { auth } from './firebase-config.js'; // Ensure path matches your project

export async function startZKVerification() {
  if (!auth.currentUser) {
    showToast('Sign in to start Higher Trust verification.', 'info');
    if (typeof window.showAuthModal === 'function') window.showAuthModal();
    return;
  }

  const btn = document.getElementById('btnStartZkVerify');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Working…';
    btn.classList.add('opacity-60', 'cursor-wait');
  }

  try {
    showToast('Registering membership commitment…', 'info');
    const result = await elevateWithZKProof({ silent: false });

    if (!result || result.isFallback) {
      throw new Error('Server did not return a valid SNARK proof.');
    }

    showToast('⚖️ Higher Trust verified. Your tier will update shortly.', 'success');

    if (typeof window.renderProfileUI === 'function' && window.currentUserData) {
      window.currentUserData.zkVerified = true;
      window.currentUserData.lastZkProofType = result.proofType || 'SNARK_GROTH16_SERVER';
      window.currentUserData.lastZkIsFallback = false;
      window.renderProfileUI(window.currentUserData);
    } else {
      setTimeout(() => location.reload(), 1200);
    }
  } catch (err) {
    console.error('[ZK elevation]', err);
    showToast(err.message || 'Verification failed. Try again.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Start Verification';
      btn.classList.remove('opacity-60', 'cursor-wait');
    }
  }
}

// Expose globally just in case an inline onclick exists somewhere in legacy HTML
window.startZKVerification = startZKVerification;

// Automatically bind via addEventListener when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btnStartZkVerify');
  if (btn) {
    btn.addEventListener('click', () => {
      startZKVerification();
    });
  }
});
