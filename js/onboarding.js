/**
 * VocalWitness Legal, Onboarding & Frictionless Anonymous Submission
 * Batch 4: strong anonymous post (tier can count privately), safer recovery key,
 * onboarding that teaches panic / offline / data saver.
 */

import { auth } from './firebase-config.js';
import { showToast } from './utils.js';
import { makePublicNullifier, PANIC_STORAGE_KEYS } from './security.js';

const EPHEMERAL_KEY_STORAGE = 'vw_ephemeral_identity';
const ANONYMOUS_SESSION_KEY = 'vw_anonymous_session_id';

/* ==========================================================================
   0. CLIENT-SIDE PII GUARD & SYSTEM PROMPTS
   ========================================================================== */

export function sanitizeUserPII(text) {
  if (!text || typeof text !== 'string') return '';

  let cleanText = text;

  cleanText = cleanText.replace(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    '[REDACTED PII]'
  );

  cleanText = cleanText.replace(
    /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g,
    '[REDACTED PII]'
  );

  cleanText = cleanText.replace(
    /\b\d{1,5}\s+(?:[A-Za-z0-9#.]+\s+){1,4}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct)\b/gi,
    '[REDACTED PII]'
  );
  cleanText = cleanText.replace(
    /[-+]?\d{1,2}\.\d{4,},\s*[-+]?\d{1,3}\.\d{4,}/g,
    '[REDACTED PII]'
  );

  return cleanText;
}

/* ==========================================================================
   1. ANONYMOUS & ZERO-REGISTRATION HELPERS
   ========================================================================== */

export function getOrCreateAnonymousIdentity() {
  try {
    let identity = localStorage.getItem(EPHEMERAL_KEY_STORAGE);
    if (identity) {
      return JSON.parse(identity);
    }

    const array = new Uint8Array(32);
    window.crypto.getRandomValues(array);
    const secretHex = Array.from(array, (byte) =>
      byte.toString(16).padStart(2, '0')
    ).join('');

    const newIdentity = {
      sessionId: `anon_${Date.now()}_${secretHex.substring(0, 8)}`,
      secretKey: secretHex,
      createdAt: new Date().toISOString(),
      submissionCount: 0,
    };

    localStorage.setItem(EPHEMERAL_KEY_STORAGE, JSON.stringify(newIdentity));
    sessionStorage.setItem(ANONYMOUS_SESSION_KEY, newIdentity.sessionId);

    console.log(
      `🛡️ [Anonymous Onboarding] Ephemeral session ready: ${newIdentity.sessionId}`
    );
    return newIdentity;
  } catch (err) {
    console.error('Failed to generate ephemeral identity:', err);
    return {
      sessionId: `anon_fallback_${Date.now()}`,
      secretKey: 'fallback',
      submissionCount: 0,
    };
  }
}

export function renderAnonymousBadge(parentContainer, options = {}) {
  if (!parentContainer) return;

  const user = auth.currentUser;
  const identity = getOrCreateAnonymousIdentity();
  const forceAnon = Boolean(options.forceAnonymous);

  const isAnonSurface = !user || forceAnon;
  const badgeText = isAnonSurface
    ? 'Anonymous Submission'
    : 'Authenticated Witness';
  const subText = !user
    ? 'Protected by ephemeral session. No account required.'
    : forceAnon
      ? 'Signed in — post will hide your public identity. Tier still counts privately.'
      : `Signed in as ${user.email || user.uid.substring(0, 8)}`;

  parentContainer.innerHTML = `
    <div class="flex items-center justify-between p-3.5 mb-4 bg-zinc-950/80 border ${
      isAnonSurface ? 'border-emerald-800/60' : 'border-zinc-800'
    } rounded-2xl">
      <div class="flex items-center gap-3">
        <div class="p-2 bg-emerald-950/80 border border-emerald-700/50 rounded-xl text-emerald-400 text-sm">
          ${isAnonSurface ? '🛡️' : '🔒'}
        </div>
        <div>
          <div class="text-xs font-semibold text-white flex items-center gap-2">
            <span>${badgeText}</span>
            ${
              isAnonSurface
                ? '<span class="text-[10px] bg-emerald-900/60 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-700 font-mono">ANONYMOUS</span>'
                : ''
            }
          </div>
          <p class="text-[11px] text-zinc-400">${subText}</p>
        </div>
      </div>
      ${
        !user
          ? `<button type="button" id="vw-claim-anon-btn" class="text-[11px] bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 px-3 py-1.5 rounded-xl transition">
               Save Key
             </button>`
          : ''
      }
    </div>
  `;

  const claimBtn = parentContainer.querySelector('#vw-claim-anon-btn');
  if (claimBtn) {
    claimBtn.addEventListener('click', () => claimAnonymousAccount());
  }
}

/**
 * Prepare public + private payload for a submission.
 * @param {object} formData
 * @param {{ anonymous?: boolean }} options  — anonymous:true works even when signed in
 */
export async function prepareAnonymousSubmission(formData = {}, options = {}) {
  const identity = getOrCreateAnonymousIdentity();
  const user = auth.currentUser;
  const wantAnonymous = options.anonymous === true || !user;

  identity.submissionCount = (identity.submissionCount || 0) + 1;
  localStorage.setItem(EPHEMERAL_KEY_STORAGE, JSON.stringify(identity));

  const postSalt = `${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
  const secretForNullifier = user?.uid || identity.secretKey;
  const publicNullifier = await makePublicNullifier(
    secretForNullifier,
    postSalt
  );

  // PUBLIC record — never put stable sessionId or uid when anonymous
  const publicPayload = {
    ...formData,
    isAnonymous: wantAnonymous,
    authorId: wantAnonymous ? null : user.uid,
    publicNullifier: wantAnonymous ? publicNullifier : null,
    timestamp: new Date().toISOString(),
  };

  // PRIVATE side-channel for tier / recovery (composer or Cloud Function only)
  const privateContribution = {
    testimonyClientId: postSalt,
    uid: user ? user.uid : null,
    ephemeralSessionId: !user ? identity.sessionId : null,
    nullifierNonce: identity.submissionCount,
    countsTowardTier: true,
    isAnonymous: wantAnonymous,
  };

  return {
    public: publicPayload,
    private: privateContribution,
    // backward-compatible flat shape for older callers
    ...publicPayload,
    _private: privateContribution,
  };
}

/**
 * Modal to copy ephemeral recovery key (DOM-built; no string-injected secrets).
 */
export function claimAnonymousAccount() {
  const identity = getOrCreateAnonymousIdentity();
  const keyString = `${identity.sessionId}:${identity.secretKey}`;

  const existing = document.getElementById('anon-key-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'anon-key-modal';
  overlay.className =
    'fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-[120]';

  overlay.innerHTML = `
    <div class="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 max-w-md w-full space-y-4">
      <div class="flex items-center justify-between pb-3 border-b border-zinc-800">
        <h3 class="text-base font-bold text-white flex items-center gap-2">
          <span>🔑</span> Ephemeral Recovery Key
        </h3>
        <button type="button" data-close class="text-zinc-400 hover:text-white text-lg" aria-label="Close">&times;</button>
      </div>
      <p class="text-xs text-zinc-400">
        Save this key if you want to track anonymous testimonies later. Do not share it.
        Panic / Quick Exit will erase it from this device.
      </p>
      <div id="anon-key-display" class="p-3 bg-zinc-950 border border-zinc-800 rounded-xl font-mono text-xs text-emerald-400 break-all select-all"></div>
      <div class="flex justify-end gap-2 pt-2">
        <button type="button" data-copy class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition">
          Copy to Clipboard
        </button>
      </div>
    </div>
  `;

  overlay.querySelector('#anon-key-display').textContent = keyString;

  overlay.querySelector('[data-close]').addEventListener('click', () => {
    overlay.remove();
  });

  overlay.querySelector('[data-copy]').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(keyString);
      if (typeof showToast === 'function') {
        showToast('Recovery key copied!', 'success');
      } else if (typeof window.showToast === 'function') {
        window.showToast('Recovery key copied!', 'success');
      }
    } catch (_) {
      // fallback select
    }
    overlay.remove();
  });

  document.body.appendChild(overlay);
}

/* ==========================================================================
   2. LEGAL NOTICE & WELCOME ONBOARDING
   ========================================================================== */

export function showLegalNotice() {
  if (localStorage.getItem('hasSeenLegal')) return;

  const modal = document.createElement('div');
  modal.id = 'legal-modal';
  modal.className =
    'fixed inset-0 bg-black/90 flex items-center justify-center z-[100]';
  modal.innerHTML = `
    <div class="bg-zinc-900 border border-red-600/50 rounded-3xl max-w-lg mx-4 p-8 text-center">
      <div class="text-5xl mb-6">⚖️</div>
      <h2 class="text-3xl font-bold text-white mb-4">Important Legal Notice</h2>
      <p class="text-red-400 font-medium mb-6">
        VocalWitness functions strictly as an un-manipulated decentralized distribution medium.
      </p>
      <p class="text-zinc-400 text-sm leading-relaxed mb-8">
        This platform does not verify the truthfulness of testimonies.
        Users are solely responsible for what they publish.
        Always act responsibly and ethically.
      </p>
      <button id="accept-legal"
              class="w-full bg-green-600 hover:bg-green-500 transition py-4 rounded-2xl text-white font-semibold text-lg">
        I Understand and Agree
      </button>
    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById('accept-legal').addEventListener('click', () => {
    localStorage.setItem('hasSeenLegal', 'true');
    modal.remove();
    setTimeout(showWelcomeOnboarding, 600);
  });
}

function showWelcomeOnboarding() {
  if (localStorage.getItem('onboardingComplete')) return;

  const modal = document.createElement('div');
  modal.id = 'onboarding-modal';
  modal.className =
    'fixed inset-0 bg-black/90 flex items-center justify-center z-[100]';
  modal.innerHTML = `
    <div class="bg-zinc-900 rounded-3xl max-w-md mx-4 p-8 text-center max-h-[90vh] overflow-auto">
      <h2 class="text-3xl font-bold text-white mb-2">Welcome, Witness! 👋</h2>
      <p class="text-zinc-400 mb-6">Safety-first reporting on VocalWitness</p>

      <div class="space-y-5 text-left">
        <div class="flex gap-4">
          <div class="text-2xl">🛡️</div>
          <div>
            <strong class="text-white">Post Anonymously</strong>
            <p class="text-sm text-zinc-400">Hide your public identity. If signed in, your trust tier still grows privately.</p>
          </div>
        </div>
        <div class="flex gap-4">
          <div class="text-2xl">🚨</div>
          <div>
            <strong class="text-white">Quick Exit</strong>
            <p class="text-sm text-zinc-400">Clears this device only. The sealed public ledger is never deleted.</p>
          </div>
        </div>
        <div class="flex gap-4">
          <div class="text-2xl">📴</div>
          <div>
            <strong class="text-white">Offline → Sync</strong>
            <p class="text-sm text-zinc-400">Capture when offline; reports queue and publish when you are back online.</p>
          </div>
        </div>
        <div class="flex gap-4">
          <div class="text-2xl">⚡</div>
          <div>
            <strong class="text-white">Data Saver</strong>
            <p class="text-sm text-zinc-400">Ultra-compressed voice + text-first by default to save bandwidth.</p>
          </div>
        </div>
      </div>

      <button id="start-journey"
              class="mt-8 w-full bg-green-600 hover:bg-green-500 py-4 rounded-2xl text-white font-semibold">
        I'm Ready — Let's Begin
      </button>
    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById('start-journey').addEventListener('click', () => {
    localStorage.setItem('onboardingComplete', 'true');
    modal.remove();
  });
}

export function initOnboarding() {
  getOrCreateAnonymousIdentity();
  showLegalNotice();
}

export function initHelpButton() {
  const btn = document.getElementById('help-button');
  if (!btn) return;
  btn.addEventListener('click', showQuickGuide);
}

function showQuickGuide() {
  const guide = document.createElement('div');
  guide.className =
    'fixed inset-0 bg-black/90 flex items-center justify-center z-[110]';
  guide.innerHTML = `
    <div class="bg-zinc-900 rounded-3xl max-w-lg p-8 max-h-[90vh] overflow-auto border border-zinc-800">
      <h2 class="text-3xl font-bold mb-6 text-center text-white">How to Use VocalWitness</h2>

      <div class="space-y-4 text-sm text-zinc-300 mb-6">
        <div class="p-3 bg-zinc-950 rounded-xl border border-zinc-800">
          <h4 class="font-bold text-emerald-400 mb-1">1. Anonymous posting</h4>
          <p class="text-xs text-zinc-400">Publish with no public identity. Signed-in users can still toggle anonymous; tier credit stays private.</p>
        </div>
        <div class="p-3 bg-zinc-950 rounded-xl border border-zinc-800">
          <h4 class="font-bold text-emerald-400 mb-1">2. Media metadata scrubbing</h4>
          <p class="text-xs text-zinc-400">Photos are processed client-side to strip EXIF (GPS, device) before upload.</p>
        </div>
        <div class="p-3 bg-zinc-950 rounded-xl border border-zinc-800">
          <h4 class="font-bold text-emerald-400 mb-1">3. Quick Exit</h4>
          <p class="text-xs text-zinc-400">Erases local keys, drafts, and offline queue on this device only. Ledger stays sealed.</p>
        </div>
        <div class="p-3 bg-zinc-950 rounded-xl border border-zinc-800">
          <h4 class="font-bold text-emerald-400 mb-1">4. Offline &amp; Data Saver</h4>
          <p class="text-xs text-zinc-400">Queue reports offline. Data Saver uses ultra-compressed voice and text-first mode.</p>
        </div>
      </div>

      <div class="p-4 bg-zinc-950 rounded-2xl border border-emerald-900/60 space-y-3 mb-6">
        <div class="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
          <span>🤖</span> Ask Platform Security Assistant
        </div>
        <div id="qa-response-area" class="text-xs text-zinc-300 min-h-[40px] max-h-[120px] overflow-y-auto bg-zinc-900/80 p-2.5 rounded-xl border border-zinc-800 hidden"></div>
        <div class="flex gap-2">
          <input type="text" id="qa-user-input" placeholder="Ask about ZK proofs, hashing, or ledgers..." class="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500" />
          <button type="button" id="qa-send-btn" class="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3 py-2 rounded-xl font-medium transition">
            Ask
          </button>
        </div>
      </div>

      <button type="button" data-close-guide
              class="w-full py-4 bg-green-600 hover:bg-green-500 font-semibold text-white rounded-2xl transition">
        Got it, Thanks!
      </button>
    </div>
  `;
  document.body.appendChild(guide);

  guide.querySelector('[data-close-guide]').addEventListener('click', () => {
    guide.remove();
  });

  const sendBtn = guide.querySelector('#qa-send-btn');
  const userInput = guide.querySelector('#qa-user-input');
  const responseArea = guide.querySelector('#qa-response-area');

  if (sendBtn && userInput && responseArea) {
    sendBtn.addEventListener('click', async () => {
      const rawQuery = userInput.value.trim();
      if (!rawQuery) return;

      const sanitizedQuery = sanitizeUserPII(rawQuery);
      userInput.value = '';
      responseArea.classList.remove('hidden');
      responseArea.innerHTML = `<span class="text-zinc-500 italic">Processing with Privacy Guard...</span>`;

      try {
        const answer = await processPlatformQAQuery(sanitizedQuery);
        responseArea.innerHTML = answer;
      } catch (err) {
        responseArea.innerHTML = `<span class="text-red-400">Failed to query assistant. Please try again.</span>`;
      }
    });
  }
}

async function processPlatformQAQuery(sanitizedQuery) {
  const q = sanitizedQuery.toLowerCase();

  if (q.includes('zk') || q.includes('zero-knowledge') || q.includes('proof')) {
    return '<strong>Zero-Knowledge (ZK) Proofs:</strong> VocalWitness uses SNARK Groth16 proofs generated in a browser Web Worker. Validity is proven without exposing wallet or private credentials.';
  }
  if (q.includes('hash') || q.includes('metadata') || q.includes('exif')) {
    return '<strong>Media Scrubbing &amp; Hashing:</strong> Images go through an HTML5 Canvas locally to strip EXIF/GPS. A SHA-256 digest anchors the asset.';
  }
  if (q.includes('ledger') ||
