// js/door-ui.js - UI Controls for Door Privacy & Broadcast Mechanics
import { state, updateAppState } from './app-state.js';
import { setDoorPrivacyMode, PRIVACY_MODES, canInteractWithUser } from './door-system.js';
import { generateZKProofAsync } from './zk-client.js';

/**
 * Render or update the privacy shield toggle in the top navigation bar or settings drawer
 */
export function renderDoorPrivacyToggle(containerId = 'door-shield-container') {
  const container = document.getElementById(containerId);
  if (!container) return;

  const currentMode = state.profileMode || PRIVACY_MODES.OPEN;
  const isZkVerified = state.isZkReady || state.userTier === 'witness_circle';

  container.innerHTML = `
    <div class="flex items-center gap-2 p-2 bg-zinc-900 border border-zinc-800 rounded-xl">
      <div class="flex flex-col">
        <span class="text-xs font-semibold text-zinc-300">Interaction Door</span>
        <span class="text-[10px] text-zinc-500">${getModeLabel(currentMode)}</span>
      </div>
      
      <select id="door-privacy-select" 
        class="ml-auto bg-zinc-800 text-xs text-zinc-200 border border-zinc-700 rounded-lg px-2 py-1 focus:outline-none focus:border-amber-500 transition cursor-pointer">
        <option value="${PRIVACY_MODES.OPEN}" ${currentMode === PRIVACY_MODES.OPEN ? 'selected' : ''}>
          🔓 Open Door (All Users)
        </option>
        <option value="${PRIVACY_MODES.ZK_ONLY}" ${!isZkVerified ? 'disabled' : ''} ${currentMode === PRIVACY_MODES.ZK_ONLY ? 'selected' : ''}>
          🛡️ ZK-Only Shield ${!isZkVerified ? '(Locked)' : ''}
        </option>
        <option value="${PRIVACY_MODES.CLOSED}" ${currentMode === PRIVACY_MODES.CLOSED ? 'selected' : ''}>
          🔒 Closed Door (Ghost Mode)
        </option>
      </select>
    </div>
  `;

  const select = container.querySelector('#door-privacy-select');
  select?.addEventListener('change', async (e) => {
    const selectedMode = e.target.value;
    try {
      await setDoorPrivacyMode(selectedMode);
      updateAppState({ profileMode: selectedMode });
      showNotification(`Door shield updated to: ${getModeLabel(selectedMode)}`, 'success');
    } catch (err) {
      showNotification(err.message || 'Failed to update privacy shield', 'error');
      select.value = currentMode;
    }
  });
}

/**
 * Enforces Broadcast UI overlay on post cards in Witness Voice & Citizen Talk feeds
 */
export function applyPostDoorDecorations(postCardElement, post, currentUser) {
  if (!postCardElement || !post) return;

  const authorPrivacy = post.authorDoorPrivacy || PRIVACY_MODES.OPEN;
  const canInteract = canInteractWithUser({ doorPrivacyMode: authorPrivacy, uid: post.authorId }, currentUser);

  // 1. Add "Witness Broadcast" badge if post author has ZK_ONLY active
  if (authorPrivacy === PRIVACY_MODES.ZK_ONLY) {
    const headerDiv = postCardElement.querySelector('.post-header') || postCardElement.firstElementChild;
    if (headerDiv && !headerDiv.querySelector('.broadcast-badge')) {
      const badge = document.createElement('span');
      badge.className = 'broadcast-badge inline-flex items-center gap-1 text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full ml-2';
      badge.innerHTML = `🛡️ <span>Witness Broadcast</span>`;
      headerDiv.appendChild(badge);
    }
  }

  // 2. Lock text replies for non-eligible users while keeping reaction buttons active
  if (!canInteract) {
    const replyInput = postCardElement.querySelector('.reply-input-area');
    const commentBtn = postCardElement.querySelector('.comment-trigger-btn');

    if (replyInput) {
      replyInput.innerHTML = `
        <div class="w-full p-2 bg-zinc-900/80 border border-zinc-800 rounded-lg text-center cursor-pointer" id="bridge-pass-trigger">
          <span class="text-xs text-zinc-400">
            🔒 Replies restricted to verified members. 
            <span class="text-amber-400 underline font-medium">Get Bridge Pass</span>
          </span>
        </div>
      `;

      replyInput.querySelector('#bridge-pass-trigger')?.addEventListener('click', () => {
        renderBridgePassModal();
      });
    }

    if (commentBtn) {
      commentBtn.classList.add('opacity-50', 'cursor-not-allowed');
      commentBtn.title = "Replies restricted by author's privacy shield";
    }
  }
}

/**
 * Modal prompting unverified users to upgrade when trying to interact with a closed Witness door
 */
export function renderBridgePassModal() {
  let modal = document.getElementById('bridge-pass-modal');
  if (modal) modal.remove();

  modal = document.createElement('div');
  modal.id = 'bridge-pass-modal';
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4';
  
  modal.innerHTML = `
    <div class="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-2xl flex flex-col items-center text-center">
      <div class="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-2xl mb-3">
        🛡️
      </div>
      <h3 class="text-base font-bold text-zinc-100 mb-1">Witness Door Locked</h3>
      <p class="text-xs text-zinc-400 mb-4 leading-relaxed">
        This Witness member restricted replies to verified accounts to prevent spam and target harassment on Witness Voice.
      </p>

      <div class="w-full bg-zinc-800/60 rounded-xl p-3 border border-zinc-700/50 mb-4 text-left flex flex-col gap-2">
        <div class="flex items-center gap-2 text-xs text-zinc-300">
          <span class="text-emerald-400">✓</span> Reactions & upvotes are active
        </div>
        <div class="flex items-center gap-2 text-xs text-zinc-300">
          <span class="text-amber-400">🔒</span> Text replies require Phone or ZK Verification
        </div>
      </div>

      <div class="flex w-full gap-2">
        <button id="close-bridge-modal" class="w-1/2 py-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200 bg-zinc-800 rounded-xl border border-zinc-700 transition">
          Dismiss
        </button>
        <button id="start-verification-btn" class="w-1/2 py-2 text-xs font-semibold text-black bg-amber-500 hover:bg-amber-400 rounded-xl transition flex items-center justify-center gap-1">
          <span id="btn-text">Verify Account</span>
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector('#close-bridge-modal')?.addEventListener('click', () => modal.remove());
  
  const verifyBtn = modal.querySelector('#start-verification-btn');
  verifyBtn?.addEventListener('click', async () => {
    const btnText = modal.querySelector('#btn-text');
    if (btnText) btnText.textContent = "Generating ZK...";
    verifyBtn.disabled = true;

    try {
      // Trigger client ZK verification sequence
      const mockInputs = { timestamp: Date.now(), uid: state.currentUser?.uid || 'anon' };
      const proofResult = await generateZKProofAsync(mockInputs);

      if (proofResult) {
        updateAppState({ isZkReady: true, userTier: 'witness_circle' });
        showNotification("ZK Proof verified successfully!", "success");
        modal.remove();
        // Refresh privacy UI state
        renderDoorPrivacyToggle();
      }
    } catch (err) {
      showNotification("ZK Verification failed. Redirecting to settings...", "error");
      modal.remove();
      window.dispatchEvent(new CustomEvent('nav:navigate', { detail: { target: 'verification' } }));
    }
  });
}

function getModeLabel(mode) {
  switch (mode) {
    case PRIVACY_MODES.ZK_ONLY: return 'ZK Shield (Verified Only)';
    case PRIVACY_MODES.CLOSED: return 'Closed Door (Ghost)';
    default: return 'Open Door (Public)';
  }
}

function showNotification(msg, type = 'info') {
  console.log(`[${type.toUpperCase()}] ${msg}`);
}
