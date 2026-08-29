/**
 * js/evidence-ui.js
 * UI utilities & components for Evidence Pack rendering & interaction delegation.
 */

import {
  toFullEvidencePack,
  downloadEvidencePack,
  shareTestimony,
  exportForNewsroom,
  buildShareUrl,
} from './evidence-pack.js';
import { showToast } from './utils.js';

/**
 * Renders the small non-scary badge for sealed posts.
 * @param {boolean|object} hasPack Or testimony object containing evidence metadata
 * @returns {string} HTML string
 */
export function renderSealedBadge(hasPack) {
  if (!hasPack) return '';
  return `
    <span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-950/60 border border-emerald-700/50 px-2.5 py-0.5 text-[10px] font-medium text-emerald-400 shadow-sm"
          title="This report is sealed with cryptographic hashes. It verifies integrity, not factual truth.">
      <span class="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
      🛡️ Sealed • Verifiable
    </span>
  `;
}

/**
 * Renders the download button for a sealed evidence pack.
 * Used by feed.js: ${hasPack ? renderDownloadPackButton(id) : ''}
 * @param {string} testimonyId
 * @returns {string} HTML string
 */
export function renderDownloadPackButton(testimonyId) {
  if (!testimonyId) return '';
  return `
    <button type="button"
            data-action="download-pack"
            data-id="${testimonyId}"
            class="download-evidence-pack-btn inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 transition text-xs font-medium">
      📥 Download Pack
    </button>
  `;
}

/**
 * Renders the primary action toolbar for Evidence & Newsroom export.
 * @param {string} testimonyId
 * @returns {string} HTML string
 */
export function renderEvidenceToolbar(testimonyId) {
  if (!testimonyId) return '';
  return `
    <div class="evidence-toolbar flex flex-wrap items-center gap-3 pt-2 text-[11px] border-t border-slate-800/60 mt-3">
      <button type="button"
              data-action="download-pack"
              data-id="${testimonyId}"
              class="download-evidence-pack-btn inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 transition font-medium">
        📥 Download Evidence Pack
      </button>
      <span class="text-slate-600">•</span>
      <button type="button"
              data-action="share-testimony"
              data-id="${testimonyId}"
              class="inline-flex items-center gap-1 text-slate-400 hover:text-slate-200 transition">
        🔗 Share Verifiable Link
      </button>
      <span class="text-slate-600">•</span>
      <button type="button"
              data-action="export-newsroom"
              data-id="${testimonyId}"
              class="inline-flex items-center gap-1 text-slate-400 hover:text-slate-200 transition">
        📰 Export for Newsroom
      </button>
    </div>
  `;
}

/**
 * Handles all evidence-related UI actions delegated from feed elements.
 * @param {Event} e The click event object
 * @param {object} post The full testimony dataset associated with the target
 * @returns {Promise<boolean>} True if action was handled, false otherwise
 */
export async function handleEvidenceAction(e, post) {
  const btn = e.target.closest('[data-action]');
  if (!btn || !post) return false;

  const action = btn.dataset.action;

  try {
    switch (action) {
      case 'download-pack': {
        btn.classList.add('opacity-50', 'pointer-events-none');
        showToast('Generating Cryptographic Evidence Pack...', 'info');

        const fullPack = await toFullEvidencePack(post);
        downloadEvidencePack(fullPack, `evidence-pack-${post.id || 'report'}.json`);

        showToast('✅ Evidence Pack downloaded', 'success');
        return true;
      }

      case 'share-testimony': {
        await shareTestimony(post);
        return true;
      }

      case 'export-newsroom': {
        exportForNewsroom(post, {
          disputes: post.disputes || [],
          auditSnippet: post.auditSnippet || null,
        });
        showToast('✅ Newsroom packet exported', 'success');
        return true;
      }

      case 'copy-share-url': {
        const url = buildShareUrl(post);
        await navigator.clipboard.writeText(url);
        showToast('📋 Verifiable link copied to clipboard', 'success');
        return true;
      }

      default:
        return false;
    }
  } catch (error) {
    console.error(`Error processing evidence action [${action}]:`, error);
    showToast('Failed to process evidence request.', 'error');
    return false;
  } finally {
    btn.classList.remove('opacity-50', 'pointer-events-none');
  }
}

/**
 * Global fallback click handler for standalone usage.
 */
export function initEvidencePackUI() {
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.download-evidence-pack-btn');
    if (!btn || btn.dataset.handledByFeed) return;

    const id = btn.dataset.id || btn.dataset.testimonyId;
    if (!id) return;

    showToast('Fetching full pack context...', 'info');
  });
}
