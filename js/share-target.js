// js/share-target.js — Inbound PWA Share Target + thin re-exports for outbound share
import { showToast } from './utils.js';
import {
  buildShareUrl,
  shareTestimony,
  resolveLedgerHash,
} from './evidence-pack.js';

const SHARE_CACHE = 'vocalwitness-v12'; // keep in sync with sw.js CACHE_NAME

/**
 * Handles incoming PWA Share Target payloads from mobile galleries.
 */
export async function handleSharedContent() {
  const params = new URLSearchParams(window.location.search);

  if (!params.has('share')) return;

  const sharedTitle = params.get('title') || '';
  const sharedText = params.get('text') || '';
  const sharedUrl = params.get('url') || '';

  console.log('📥 Incoming shared payload detected from mobile OS');

  if (window.history && window.history.replaceState) {
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);
  }

  try {
    const cache = await caches.open(SHARE_CACHE);
    const matchedRequest = await cache.match('/shared-media-payload');

    if (matchedRequest) {
      const blob = await matchedRequest.blob();
      await cache.delete('/shared-media-payload');

      window.dispatchEvent(
        new CustomEvent('vocalWitness:sharedMediaReady', {
          detail: {
            text: [sharedTitle, sharedText, sharedUrl]
              .filter(Boolean)
              .join(' - '),
            mediaBlob: blob,
          },
        })
      );

      showToast('📸 Shared media loaded into composer!', 'success');
      return;
    }
  } catch (err) {
    console.warn('Could not retrieve shared media blob:', err);
  }

  if (sharedText || sharedUrl) {
    window.dispatchEvent(
      new CustomEvent('vocalWitness:sharedMediaReady', {
        detail: {
          text: [sharedTitle, sharedText, sharedUrl]
            .filter(Boolean)
            .join(' - '),
          mediaBlob: null,
        },
      })
    );
    showToast('📝 Shared text loaded into composer!', 'success');
  }
}

/**
 * Outbound: share a sealed testimony (always includes ledger hash when present).
 */
export async function shareSealedTestimony(testimony) {
  const result = await shareTestimony(testimony);
  if (result.ok && result.method === 'clipboard') {
    showToast('Link copied (includes ledger hash).', 'success');
  } else if (result.ok && result.method === 'native') {
    showToast('Share sheet opened.', 'success');
  } else if (!result.ok && result.method !== 'cancelled') {
    showToast('Could not share link.', 'error');
  }
  return result;
}

export { buildShareUrl, shareTestimony, resolveLedgerHash };
