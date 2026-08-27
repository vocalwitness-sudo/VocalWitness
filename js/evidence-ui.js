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
 */
export function renderDownloadPackButton(testimonyId) {
  return `
    <button type="button"
            class="download-evidence-pack-btn text-[11px] text-emerald-400 hover:text-emerald-300 underline-offset-2 hover:underline"
            data-testimony-id="${testimonyId}">
      Download Evidence Pack
    </button>
  `;
}

/**
 * Global click handler (call once on app init)
 */
export function initEvidencePackUI() {
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.download-evidence-pack-btn');
    if (!btn) return;

    const id = btn.dataset.testimonyId;
    if (!id) return;

    try {
      // You will later fetch the testimony + reconstruct the full pack.
      // For now we can show a clear message.
      showToast('Preparing evidence pack…', 'info');

      // Placeholder – we will wire the real fetch in the next step
      // once feed.js / createPost returns the data.
      showToast('Evidence pack download will be fully wired next', 'info');
    } catch (err) {
      console.error(err);
      showToast('Could not prepare evidence pack', 'error');
    }
  });
}
