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
import { showSupportWitnessModal } from './support-witness.js';
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
 * @param {string} [authorId=''] Optional author/witness ID
 * @returns {string} HTML string
 */
export function renderEvidenceToolbar(testimonyId, authorId = '') {
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
      <span class="text-slate-600">•</span>
      <button type="button"
              data-action="support-witness"
              data-author-id="${authorId}"
              class="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 transition font-medium">
        ⭐ Support Witness
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

      case 'support-witness': {
        const authorId = btn.dataset.authorId || post.uid || post.authorId;
        const authorName = post.authorName || post.displayName || 'Witness';

        if (!authorId) {
          showToast('Unable to identify witness for support.', 'error');
          return true;
        }

        showSupportWitnessModal(authorId, authorName);
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
 * Used when a download button is clicked outside the main feed handler.
 */
export function initEvidencePackUI() {
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.download-evidence-pack-btn, [data-action="download-pack"]');
    if (!btn || btn.dataset.handledByFeed) return;

    const id = btn.dataset.id || btn.dataset.testimonyId;
    if (!id) return;

    e.preventDefault();
    e.stopPropagation();

    try {
      btn.classList.add('opacity-50', 'pointer-events-none');
      showToast('Fetching full pack context...', 'info');

      // Try to find the post data from the nearest card
      const card = btn.closest('[data-post-id], .post-card, .testimony-card, article');
      let post = null;

      if (card && card.__postData) {
        // Some feeds attach the full object directly
        post = card.__postData;
      } else if (window.__testimoniesCache && window.__testimoniesCache[id]) {
        // Fallback to global cache if available
        post = window.__testimoniesCache[id];
      }

      if (!post) {
        showToast('Could not locate full report data. Please try again from the feed.', 'error');
        return;
      }

      // Re-use the main evidence action handler
      await handleEvidenceAction(
        { target: btn, preventDefault() {}, stopPropagation() {} },
        post
      );

    } catch (err) {
      console.error('[evidence-ui] Fallback download failed:', err);
      showToast('Failed to generate Evidence Pack.', 'error');
    } finally {
      btn.classList.remove('opacity-50', 'pointer-events-none');
    }
  });
}
