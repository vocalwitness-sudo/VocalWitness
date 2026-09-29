// js/zk-elevation.js
import { elevateWithZKProof } from './zk-client.js';
import { showToast } from './utils.js';
import { auth } from './firebase-config.js';
import { clearProfileCache, refreshTierAndUI } from './tier.js';

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

    showToast('⚖️ Higher Trust verified! Updating profile...', 'success');

    // 1. Clear local profile/tier caches so stale data isn't re-read
    if (typeof window.clearProfileCache === 'function') {
      window.clearProfileCache();
    }

    // 2. Refresh the tier and user interface dynamically
    if (typeof window.refreshTierAndUI === 'function') {
      await window.refreshTierAndUI();
    } else if (typeof window.renderProfileUI === 'function' && window.currentUserData) {
      window.currentUserData.zkVerified = true;
      window.currentUserData.tier = 'witness_circle'; // Update tier locally
      window.renderProfileUI(window.currentUserData);
    } else {
      // Fallback soft reload if UI hooks aren't globally available
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

// Expose globally for legacy inline onclick handlers
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
