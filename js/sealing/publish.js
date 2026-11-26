// js/sealing/publish.js
// Single secure publish entry. Behavior must match previous main.js implementation.
// Do not change seal / hash / Cloud Function path here.

import { db, auth } from '../firebase-config.js';
import { showToast } from '../utils.js';
import { openAuthModal } from '../auth.js';
import * as mediaModule from '../media.js';
import { getAudioForPublish } from '../media.js';
import { submitTestimony } from '../createPost.js';
import {
  downloadEvidencePack,
  shareTestimony,
  buildShareUrl,
} from '../evidence-pack.js';
import { initFeed } from '../feed.js';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';

/**
 * Canonical UI → seal entry point.
 * Always ends in submitTestimony → submitTestimonySecure.
 */
export async function publishTestimony() {
  if (window.__isPublishing) {
    console.warn('[publish] Already publishing – ignored');
    return;
  }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    showToast('Please sign in to publish.', 'error');
    if (typeof openAuthModal === 'function') openAuthModal();
    return;
  }

  const titleInput = document.getElementById('testimonyTitle');
  const textarea = document.getElementById('mainInput');
  const content = textarea ? textarea.value.trim() : '';

  const postingStyle =
    (typeof window.currentPostingStyle !== 'undefined' && window.currentPostingStyle) ||
    'citizen';
  const fieldNoteRole =
    document.getElementById('field-note-role')?.value.trim() ||
    window.selectedRole ||
    null;
  const fieldNoteOrg =
    document.getElementById('field-note-org')?.value.trim() || null;

  const isAnonymous = !!(
    document.getElementById('post-anonymously')?.checked ||
    document.getElementById('isAnonymous')?.checked
  );

  const hasMediaEarly =
    (typeof mediaModule?.hasPendingMedia === 'function' && mediaModule.hasPendingMedia()) ||
    (typeof mediaModule?.hasAnyMedia === 'function' && mediaModule.hasAnyMedia()) ||
    (typeof getAudioForPublish === 'function' && !!getAudioForPublish());

  if (!content && !hasMediaEarly) {
    showToast('Write something or add media before publishing', 'error');
    return;
  }
  if (content && content.length < 15 && !hasMediaEarly) {
    showToast('Write at least 15 characters, or add a photo / voice / video', 'error');
    return;
  }
  if (!content && hasMediaEarly) {
    showToast('Please add a short text description with your media', 'error');
    return;
  }

  // Channel
  const targetFeedEl = document.getElementById('targetFeedSelect');
  let channel =
    targetFeedEl?.value === 'witness-voice' ||
    targetFeedEl?.value === 'witness_voice'
      ? 'witness-voice'
      : 'citizen-talk';

  // Witness Voice gate (client hint; server enforces too)
  if (channel === 'witness-voice') {
    try {
      const userRef = doc(db, 'users', currentUser.uid);
      const userSnap = await getDoc(userRef);
      const ud = userSnap.exists() ? userSnap.data() : {};
      const isWitness = ud.tier === 'witness_circle' || ud.zkVerified === true;
      if (!isWitness) {
        showToast(
          'Witness Voice needs Witness Circle. Publishing to Citizen Talk instead.',
          'warning'
        );
        channel = 'citizen-talk';
      }
    } catch (_) {
      channel = 'citizen-talk';
    }
  }

  const postBtn = document.getElementById('postButton') || document.getElementById('postBtn');
  const originalBtnHTML = postBtn ? postBtn.innerHTML : '';

  window.__isPublishing = true;
  if (postBtn) {
    postBtn.disabled = true;
    postBtn.classList.add('opacity-75', 'cursor-not-allowed', 'scale-[0.98]');
    postBtn.innerHTML = `
      <span class="inline-block w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin mr-2 align-middle"></span>
      <span class="align-middle">Sealing & Publishing...</span>
    `;
  }

  try {
    // Resolve active media once
    const pending =
      typeof mediaModule?.getActiveMedia === 'function'
        ? mediaModule.getActiveMedia()
        : {
            image: mediaModule?.selectedImageFile || null,
            video: mediaModule?.selectedVideoFile || null,
            audio:
              typeof getAudioForPublish === 'function'
                ? getAudioForPublish()?.blob
                : null,
          };

    const imageFile = pending.image || null;
    const videoFile = pending.video || null;
    let audioFile = pending.audio || null;
    if (audioFile && !(audioFile instanceof File) && audioFile instanceof Blob) {
      audioFile = new File([audioFile], 'live-voice.webm', {
        type: audioFile.type || 'audio/webm',
        lastModified: Date.now(),
      });
    }

    // Offline → queue minimal text draft (media should be published online)
    if (!navigator.onLine) {
      const { saveDraftOffline } = await import('../db.js');
      await saveDraftOffline({
        content,
        channel,
        isAnonymous,
        postingStyle,
        fieldNoteRole,
        fieldNoteOrg,
        hasMediaPending: !!(imageFile || videoFile || audioFile),
      });
      showToast(
        imageFile || videoFile || audioFile
          ? 'Offline: text draft saved. Reconnect to seal media + publish.'
          : 'Saved offline. Will publish when you are back online.',
        'info'
      );
      return;
    }

    const result = await submitTestimony({
      content,
      channel,
      imageFile,
      videoFile,
      audioFile,
      isAnonymous,
      postingStyle: postingStyle === 'field-note' ? 'field-note' : 'citizen',
      fieldNoteRole: postingStyle === 'field-note' ? fieldNoteRole : null,
      fieldNoteOrg: postingStyle === 'field-note' ? fieldNoteOrg : null,
      onProgress: (p) => {
        if (postBtn && typeof p === 'number') {
          postBtn.innerHTML = `
            <span class="inline-block w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin mr-2"></span>
            Uploading… ${Math.round(p)}%
          `;
        }
      },
    });

    const id =
      typeof result === 'string'
        ? result
        : (result && result.id) || null;

    if (!id || typeof id !== 'string') {
      throw new Error('Secure submit returned no document id.');
    }

    console.log('[publish] SUCCESS via submitTestimonySecure →', id, '| channel:', channel);

    window.dispatchEvent(
      new CustomEvent('vocalWitness:posted', {
        detail: {
          id,
          channel,
          fullPack: result?.fullPack || null,
          packCoreHash: result?.packCoreHash || null,
          forensicHash: result?.forensicHash || null,
        },
      })
    );

    try {
      const userRef = doc(db, 'users', currentUser.uid);
      await setDoc(userRef, { lastTestimonyAt: serverTimestamp() }, { merge: true });
    } catch (_) {}

    if (typeof window.loadEvidenceLedger === 'function') window.loadEvidenceLedger();
    if (typeof window.loadForensicLedger === 'function') window.loadForensicLedger();

    const successEl = document.getElementById('publish-success');
    const downloadPackBtn = document.getElementById('download-pack-after-publish');
    const shareAfterBtn = document.getElementById('share-after-publish');
    const viewSquareBtn = document.getElementById('view-in-square-btn');

    const sharePayload = {
      id,
      testimonyId: id,
      packCoreHash: result?.packCoreHash || null,
      forensicHash: result?.forensicHash || result?.packCoreHash || null,
      channel,
      targetFeed: channel,
    };

    if (successEl) {
      successEl.classList.remove('hidden');
      if (postBtn) postBtn.classList.add('hidden');

      if (downloadPackBtn) {
        downloadPackBtn.onclick = async () => {
          try {
            downloadPackBtn.disabled = true;
            downloadPackBtn.innerHTML = 'Preparing…';
            if (result?.fullPack) {
              downloadEvidencePack(result.fullPack, id);
              showToast('Evidence Pack downloaded', 'success');
            } else if (typeof handleDownloadEvidencePack === 'function') {
              await handleDownloadEvidencePack(id);
            } else {
              showToast('Open the post to download the Evidence Pack', 'info');
            }
          } catch (err) {
            console.error('[publish] Pack download failed:', err);
            showToast('Could not prepare Evidence Pack', 'error');
          } finally {
            downloadPackBtn.disabled = false;
            downloadPackBtn.innerHTML = '📥 Download Evidence Pack';
          }
        };
      }

      if (shareAfterBtn) {
        shareAfterBtn.onclick = async () => {
          try {
            shareAfterBtn.disabled = true;
            const r = await shareTestimony(sharePayload);
            if (r?.ok) {
              showToast(
                r.method === 'native' ? 'Shared' : 'Verifiable link copied',
                'success'
              );
            } else if (r?.method !== 'cancelled') {
              const url = buildShareUrl(sharePayload);
              try {
                await navigator.clipboard.writeText(url);
                showToast('Verifiable link copied', 'success');
              } catch (_) {
                showToast(url, 'info');
              }
            }
          } catch (err) {
            console.error('[publish] Share failed:', err);
            showToast('Could not share', 'error');
          } finally {
            shareAfterBtn.disabled = false;
          }
        };
      }

      if (viewSquareBtn) {
        viewSquareBtn.onclick = () => {
          if (typeof window.switchTab === 'function') window.switchTab('square');
          (
            document.getElementById('testimonies-feed') ||
            document.getElementById('feed-container')
          )?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
      }

      setTimeout(() => {
        successEl.classList.add('hidden');
        if (postBtn) postBtn.classList.remove('hidden');
        if (titleInput) titleInput.value = '';
        if (textarea) textarea.value = '';
        if (typeof mediaModule?.resetMediaState === 'function') mediaModule.resetMediaState();
        window.dispatchEvent(new CustomEvent('media-changed'));
      }, 45000);
    } else {
      if (titleInput) titleInput.value = '';
      if (textarea) textarea.value = '';
      if (typeof mediaModule?.resetMediaState === 'function') mediaModule.resetMediaState();
    }

    if (typeof initFeed === 'function') {
      initFeed(db, channel === 'witness-voice' ? 'witness-voice' : 'citizen-talk');
    }
  } catch (err) {
    console.error('[publish] failed', err);
    const msg = err?.message || String(err);
    showToast(msg || 'Publish failed.', 'error');
  } finally {
    window.__isPublishing = false;
    if (postBtn) {
      postBtn.disabled = false;
      postBtn.classList.remove('opacity-75', 'cursor-not-allowed', 'scale-[0.98]');
      postBtn.innerHTML = originalBtnHTML || postBtn.innerHTML;
    }
  }
}
