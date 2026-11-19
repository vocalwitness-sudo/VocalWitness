/**
 * VocalWitness Upload Module (js/upload.js)
 * Batch 2 – Maximum Resilience (Old phones + flaky networks)
 *
 * Pure transport layer only.
 * All media preparation & hashing remains the responsibility of media-pipeline.js.
 *
 * Goals:
 * - Survive unstable mobile connections
 * - Survive old Android devices
 * - Never lose a sealed report because of a temporary network blip
 */

import { showToast } from './utils.js';
import { logAuditEvent } from './audit.js';
import { auth, appCheck } from './firebase-config.js';
import { getToken } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-app-check.js';
import { assertRateLimit, RL } from './rate-limit.js';

const R2_UPLOAD_ENDPOINT = 'https://media.vocalwitness.com/upload';
const R2_PUBLIC_BASE = 'https://media.vocalwitness.com';

/**
 * Show / update / hide the upload progress bar
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
 * Low-level resilient upload with automatic retries
 * This is the heart of the reliability upgrade
 */
async function executeUpload(blob, keyPath, mimeType, onProgress, maxRetries = 3) {
  if (!auth.currentUser) {
    throw new Error('Sign in required to upload media.');
  }

  const targetUrl = `${R2_UPLOAD_ENDPOINT}?key=${encodeURIComponent(keyPath)}`;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Force refresh the ID token on every attempt (very important on long-lived sessions)
      const idToken = await auth.currentUser.getIdToken(true);

      const publicUrl = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.open('PUT', targetUrl, true);
        xhr.timeout = 120000; // 2 minutes – critical for slow African mobile networks
        xhr.setRequestHeader('Content-Type', mimeType || 'application/octet-stream');
        xhr.setRequestHeader('Authorization', `Bearer ${idToken}`);

        // App Check (best-effort, never blocks the upload)
        if (appCheck) {
          getToken(appCheck, false)
            .then(({ token }) => {
              if (token) {
                xhr.setRequestHeader('X-Firebase-AppCheck', token);
              }
            })
            .catch(() => {
              // Silently ignore – we already have auth
            });
        }

        // Progress
        if (xhr.upload && typeof onProgress === 'function') {
          xhr.upload.onprogress = (evt) => {
            if (evt.lengthComputable) {
              const percent = Math.round((evt.loaded / evt.total) * 100);
              onProgress(percent);
            }
          };
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(`${R2_PUBLIC_BASE}/${keyPath}`);
          } else if (xhr.status === 401 || xhr.status === 403) {
            reject(new Error('Upload denied (auth or security check). Please refresh the page and try again.'));
          } else {
            reject(new Error(`Upload failed (server returned ${xhr.status}). Please retry.`));
          }
        };

        xhr.onerror = () => {
          reject(new Error('Network error during upload. Connection dropped.'));
        };

        xhr.ontimeout = () => {
          reject(new Error('Upload timed out. The network is too slow right now.'));
        };

        xhr.onabort = () => {
          reject(new Error('Upload was cancelled.'));
        };

        xhr.send(blob);
      });

      // Success – return immediately
      return publicUrl;

    } catch (err) {
      lastError = err;
      console.warn(`[Upload] Attempt ${attempt}/${maxRetries} failed:`, err.message);

      if (attempt < maxRetries) {
        // Exponential backoff: 1.8s → 3.6s → 7.2s
        const delay = Math.round(1800 * Math.pow(2, attempt - 1));
        
        showToast(
          `Upload interrupted. Retrying in ${Math.round(delay / 1000)}s… (${attempt}/${maxRetries})`,
          'info'
        );

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // All attempts failed
  throw lastError || new Error('Network error during upload. Please check your connection and try again.');
}

/**
 * Core public upload function used by media-pipeline.js
 * Accepts already-processed File/Blob
 */
export async function uploadMedia(file, folderPath = 'evidence', onProgress = null) {
  if (!file) throw new Error('No file provided for upload.');

  assertRateLimit('upload', RL.upload);

  const uid = auth.currentUser?.uid || 'anonymous';
  const fileId = crypto.randomUUID();

  // Safe extension detection
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
    setUploadProgress(0, 'Preparing upload…');

    const publicUrl = await executeUpload(
      file,
      keyPath,
      mime,
      (percent) => {
        if (typeof onProgress === 'function') onProgress(percent);
        setUploadProgress(percent, 'Uploading…');
      }
    );

    // Optional audit
    try {
      await logAuditEvent?.('MEDIA_UPLOADED', {
        type: mime.split('/')[0] || 'file',
        path: keyPath,
        size: file.size
      });
    } catch (_) {}

    return publicUrl;

  } catch (err) {
    console.error('[Upload] Final failure:', err);
    showToast(err.message || 'Upload failed. Please try again.', 'error');
    throw err;
  } finally {
    setUploadProgress(null);
  }
}

/**
 * Upload non-media documents (PDF, TXT, ZIP, DOC, DOCX)
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

// Legacy compatibility wrappers
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
