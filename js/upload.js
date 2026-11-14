/**
 * VocalWitness Upload Module (js/upload.js)
 * Batch 1 – Production (Integrity Lock)
 *
 * Pure transport layer.
 * - No EXIF scrubbing
 * - No HEIC conversion
 * - No compression / normalization
 * - No hashing
 *
 * All media preparation & hashing is done exclusively by js/media-pipeline.js.
 * This file only talks to Cloudflare R2.
 */

import { showToast } from './utils.js';
import { logAuditEvent } from './audit.js';
import { auth, appCheck } from './firebase-config.js';
import { getToken } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-app-check.js';
import { assertRateLimit, RL } from './rate-limit.js';

const R2_UPLOAD_ENDPOINT = 'https://media.vocalwitness.com/upload';
const R2_PUBLIC_BASE = 'https://media.vocalwitness.com';

/**
 * Show / update / hide the upload progress bar in the composer
 */
export function setUploadProgress(percent, statusText = 'Uploading media...') {
  const box = document.getElementById('upload-progress-container');
  const bar = document.getElementById('upload-progress-bar');
  const pct = document.getElementById('upload-progress-pct');
  const status = document.getElementById('upload-status-text');

  if (!box) return;

  if (percent == null || percent < 0) {
    box.classList.add('hidden');
    if (bar) bar.style.width = '0%';
    if (pct) pct.textContent = '0%';
    return;
  }

  box.classList.remove('hidden');
  const safe = Math.max(0, Math.min(100, Math.round(percent)));
  if (bar) bar.style.width = `${safe}%`;
  if (pct) pct.textContent = `${safe}%`;
  if (status) status.textContent = statusText;
}

/**
 * Low-level upload to R2 via XHR.
 * Requires Firebase Auth. Sends App Check token when available.
 */
async function executeUpload(blob, keyPath, mimeType, onProgress) {
  if (!auth.currentUser) {
    throw new Error('Sign in required to upload media.');
  }

  const xhr = new XMLHttpRequest();
  const targetUrl = `${R2_UPLOAD_ENDPOINT}?key=${encodeURIComponent(keyPath)}`;

  xhr.open('PUT', targetUrl, true);
  xhr.setRequestHeader('Content-Type', mimeType || 'application/octet-stream');

  try {
    const idToken = await auth.currentUser.getIdToken();
    xhr.setRequestHeader('Authorization', `Bearer ${idToken}`);
  } catch (err) {
    throw new Error('Could not get auth token for upload.');
  }

  try {
    if (appCheck) {
      const { token } = await getToken(appCheck, false);
      if (token) {
        xhr.setRequestHeader('X-Firebase-AppCheck', token);
      }
    }
  } catch (err) {
    console.warn('[Upload] App Check token unavailable:', err?.message || err);
  }

  return new Promise((resolve, reject) => {
    if (xhr.upload && typeof onProgress === 'function') {
      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable) {
          onProgress(Math.round((evt.loaded / evt.total) * 100));
        }
      };
    }

    xhr.onload = () => {
  if (xhr.status >= 200 && xhr.status < 300) {
    if (typeof onProgress === 'function') onProgress(100);
    resolve(`${R2_PUBLIC_BASE}/${keyPath}`);
  } else if (xhr.status === 401 || xhr.status === 403) {
    reject(new Error('Upload denied (auth or App Check). Refresh and try again.'));
  } else {
    reject(new Error(`Upload failed (HTTP ${xhr.status}). Please retry.`));
  }
};
xhr.onerror = () => reject(new Error('Network error during upload. Check connection and retry.'));
xhr.ontimeout = () => reject(new Error('Upload timed out. Please retry.'));
    
/**
 * Core transport helper used by media-pipeline.js
 * Accepts an already-processed File/Blob and uploads it.
 * Does NOT scrub, normalize, or hash.
 */
export async function uploadMedia(file, folderPath = 'evidence', onProgress = null) {
  if (!file) throw new Error('No file provided for upload.');

  assertRateLimit('upload', RL.upload);

  const uid = auth.currentUser?.uid || 'anonymous';
  const fileId = crypto.randomUUID();

  // Determine safe extension
  const mime = (file.type || 'application/octet-stream').toLowerCase();
  let ext = 'bin';

  if (mime.includes('webp')) ext = 'webp';
  else if (mime.includes('jpeg') || mime.includes('jpg')) ext = 'jpg';
  else if (mime.includes('png')) ext = 'png';
  else if (mime.includes('gif')) ext = 'gif';
  else if (mime.includes('wav')) ext = 'wav';
  else if (mime.includes('mpeg') || mime.includes('mp3')) ext = 'mp3';
  else if (mime.includes('mp4') && mime.startsWith('audio')) ext = 'm4a';
  else if (mime.includes('webm') && mime.startsWith('audio')) ext = 'webm';
  else if (mime.includes('webm')) ext = 'webm';
  else if (mime.includes('quicktime') || mime.includes('mov')) ext = 'mov';
  else if (mime.includes('mp4')) ext = 'mp4';
  else if (mime.includes('pdf')) ext = 'pdf';
  else if (file.name) {
    const match = file.name.toLowerCase().match(/\.([a-z0-9]+)$/);
    if (match) ext = match[1];
  }

  const keyPath = folderPath.includes(uid)
    ? `${folderPath}/${fileId}.${ext}`
    : `${folderPath}/${uid}/${fileId}.${ext}`;

  try {
    setUploadProgress(0, 'Uploading…');
    const publicUrl = await executeUpload(
      file,
      keyPath,
      mime,
      (percent) => {
        if (typeof onProgress === 'function') onProgress(percent);
        setUploadProgress(percent, 'Uploading…');
      }
    );

    await logAuditEvent?.('MEDIA_UPLOADED', {
      type: mime.split('/')[0] || 'file',
      path: keyPath,
      size: file.size
    });

    return publicUrl;
  } catch (err) {
    console.error('[Upload] Transport failed:', err);
    showToast(err.message || 'Upload failed', 'error');
    throw err;
  } finally {
    setUploadProgress(null);
  }
}

/**
 * Upload non-media documents (PDF, TXT, ZIP, DOC, DOCX)
 * Used by Group Evidence Locker. No processing.
 */
export async function uploadRawFile(file, folderPath = 'evidence', onProgress = null) {
  if (!file) throw new Error('No file provided for upload.');

  assertRateLimit('upload', RL.upload);

  const MAX_RAW_BYTES = 80 * 1024 * 1024;
  if (file.size > MAX_RAW_BYTES) {
    throw new Error('File too large (max 80 MB).');
  }

  const ALLOWED =
    /^(application\/(pdf|zip|x-zip-compressed|msword|vnd\.openxmlformats-officedocument\.wordprocessingml\.document|octet-stream)|text\/plain)$/i;
  const ALLOWED_EXT = /\.(pdf|txt|zip|doc|docx)$/i;

  const mime = (file.type || '').toLowerCase();
  const name = file.name || 'document';

  if (!ALLOWED.test(mime) && !ALLOWED_EXT.test(name)) {
    throw new Error('Document type not allowed. Use PDF, TXT, ZIP, DOC, or DOCX.');
  }

  return uploadMedia(file, folderPath, onProgress);
}

// Legacy thin wrappers (kept for compatibility with older callers)
// They simply forward to the canonical pipeline via uploadMedia.
// Prefer calling processAndUploadMedia() from media-pipeline.js instead.

export async function uploadSecurePhoto(file, folderPath = 'evidence', onProgress = null) {
  return uploadMedia(file, folderPath, onProgress);
}

export async function uploadSecureAudio(audioBlob, folderPath = 'evidence', onProgress = null) {
  const file = audioBlob instanceof File
    ? audioBlob
    : new File([audioBlob], 'audio.webm', { type: audioBlob.type || 'audio/webm' });
  return uploadMedia(file, folderPath, onProgress);
}

export async function uploadSecureVideo(videoFile, folderPath = 'evidence', onProgress = null) {
  return uploadMedia(videoFile, folderPath, onProgress);
}
