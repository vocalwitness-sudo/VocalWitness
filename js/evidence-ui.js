// js/evidence-ui.js
import { toFullEvidencePack, downloadEvidencePack } from './evidence-pack.js';
import { showToast } from './utils.js';

/**
 * Renders the small non-scary badge
 */
export function renderSealedBadge(hasPack) {
  if (!hasPack) return '';
  return `
    <span class="inline-flex items-center gap-1 rounded-full bg-emerald-950/60 border border-emerald-700/50 px-2 py-0.5 text-[10px] font-medium text-emerald-400"
          title="This report is sealed with cryptographic hashes. It does not prove the event occurred.">
      🛡️ Sealed • Verifiable
    </span>
  `;
}

/**
 * Renders the Download button
 * Uses data-action so it works with the existing feed event delegation
 */
export function renderDownloadPackButton(testimonyId) {
  return `
    <button type="button"
            data-action="download-pack"
            data-id="${testimonyId}"
            class="download-evidence-pack-btn text-[11px] text-emerald-400 hover:text-emerald-300 transition">
      Download Evidence Pack
    </button>
  `;
}

/**
 * Optional global click handler.
 * Prefer handling the action inside feed.js (cleaner).
 * Keep this only if you want a fallback.
 */
export function initEvidencePackUI() {
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.download-evidence-pack-btn');
    if (!btn) return;

    // If feed.js already handled it via data-action, do nothing
    if (btn.dataset.handledByFeed) return;

    const id = btn.dataset.id || btn.dataset.testimonyId;
    if (!id) return;

    showToast('Use the feed download handler for full pack support', 'info');
  });
}
