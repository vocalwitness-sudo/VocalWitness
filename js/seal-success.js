// js/seal-success.js
// Beautiful, non-blocking “Sealed ✓” celebration – safe for mobile

let activeOverlay = null;

/**
 * Show a short, satisfying seal success animation.
 * @param {Object} [opts]
 * @param {string} [opts.title="Sealed"]
 * @param {string} [opts.subtitle="Evidence is now part of the public record"]
 * @param {number} [opts.duration=2200]
 */
export function showSealSuccess(opts = {}) {
  const {
    title = 'Sealed',
    subtitle = 'Evidence is now part of the public record',
    duration = 2200
  } = opts;

  // Remove previous if still showing
  if (activeOverlay) {
    activeOverlay.remove();
    activeOverlay = null;
  }

  const overlay = document.createElement('div');
  overlay.id = 'vw-seal-success';
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');
  overlay.innerHTML = `
    <div class="vw-seal-card">
      <div class="vw-seal-ring">
        <div class="vw-seal-check">✓</div>
      </div>
      <div class="vw-seal-title">${escapeHtml(title)}</div>
      <div class="vw-seal-sub">${escapeHtml(subtitle)}</div>
    </div>
  `;

  // Styles (scoped, no global pollution)
  const style = document.createElement('style');
  style.textContent = `
    #vw-seal-success {
      position: fixed;
      inset: 0;
      z-index: 10050;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.55);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      animation: vwSealFadeIn 0.25s ease-out;
      pointer-events: none;
    }
    .vw-seal-card {
      text-align: center;
      padding: 28px 32px;
      border-radius: 24px;
      background: linear-gradient(160deg, #0f172a 0%, #111827 100%);
      border: 1px solid rgba(16, 185, 129, 0.35);
      box-shadow: 0 0 0 1px rgba(16, 185, 129, 0.1), 0 20px 50px rgba(0, 0, 0, 0.5), 0 0 40px rgba(16, 185, 129, 0.15);
      transform: scale(0.85);
      animation: vwSealPop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
    }
    .vw-seal-ring {
      width: 72px;
      height: 72px;
      margin: 0 auto 16px;
      border-radius: 50%;
      background: rgba(16, 185, 129, 0.12);
      border: 2px solid #10b981;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 0 24px rgba(16, 185, 129, 0.4);
      animation: vwSealPulse 1.2s ease-in-out infinite;
    }
    .vw-seal-check {
      font-size: 36px;
      font-weight: 800;
      color: #34d399;
      line-height: 1;
      animation: vwSealCheckIn 0.4s 0.15s cubic-bezier(0.34, 1.56, 0.64, 1) both;
    }
    .vw-seal-title {
      font-size: 1.35rem;
      font-weight: 800;
      color: #f8fafc;
      letter-spacing: -0.02em;
    }
    .vw-seal-sub {
      margin-top: 6px;
      font-size: 0.8rem;
      color: #94a3b8;
      max-width: 220px;
      margin-left: auto;
      margin-right: auto;
      line-height: 1.4;
    }
    @keyframes vwSealFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes vwSealPop {
      to { transform: scale(1); }
    }
    @keyframes vwSealCheckIn {
      from { transform: scale(0); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }
    @keyframes vwSealPulse {
      0%, 100% { box-shadow: 0 0 20px rgba(16, 185, 129, 0.35); }
      50% { box-shadow: 0 0 36px rgba(16, 185, 129, 0.55); }
    }
    @keyframes vwSealFadeOut {
      to { opacity: 0; }
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(overlay);
  activeOverlay = overlay;

  // Auto dismiss
  setTimeout(() => {
    overlay.style.animation = 'vwSealFadeOut 0.3s ease-in forwards';
    setTimeout(() => {
      overlay.remove();
      style.remove();
      if (activeOverlay === overlay) activeOverlay = null;
    }, 320);
  }, duration);
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Global convenience
if (typeof window !== 'undefined') {
  window.showSealSuccess = showSealSuccess;
}
