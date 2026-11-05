/**
 * VocalWitness Upload Module (js/upload.js)
 * Handles client-side EXIF scrubbing, compression, and secure uploads to Cloudflare R2.
 * Supports: Images, Audio, and Video.
 * Mobile-hardened: empty MIME types + HEIC conversion support
 */
import { scrubImageMetadata } from './imageScrubber.js';
import { compressImage } from './media-compression.js';
import { showToast } from './utils.js';
import { logAuditEvent } from './audit.js';
import { auth, appCheck } from './firebase-config.js';
import { getToken } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-app-check.js';
import { assertRateLimit, RL } from './rate-limit.js';

const R2_UPLOAD_ENDPOINT = 'https://media.vocalwitness.com/upload';
const R2_PUBLIC_BASE = 'https://media.vocalwitness.com';

/**
 * Dynamically load heic2any only when needed
 */
async function loadHeic2Any() {
  if (window.heic2any) return window.heic2any;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
    script.onload = () => resolve(window.heic2any);
    script.onerror = () => reject(new Error('Failed to load HEIC converter'));
    document.head.appendChild(script);
  });
}

/**
 * Normalize File objects coming from mobile pickers
 * Many mobile browsers return empty file.type or HEIC
 */
function normalizeMediaFile(file) {
  if (!file) return null;

  let type = (file.type || '').toLowerCase();

  if (!type || type === 'application/octet-stream') {
    const name = (file.name || '').toLowerCase();
    const ext = name.split('.').pop();

    if (['jpg', 'jpeg'].includes(ext)) type = 'image/jpeg';
    else if (ext === 'png') type = 'image/png';
    else if (ext === 'webp') type = 'image/webp';
    else if (ext === 'gif') type = 'image/gif';
    else if (['heic', 'heif'].includes(ext)) type = 'image/heic';
    else if (['mp3', 'mpeg'].includes(ext)) type = 'audio/mpeg';
    else if (ext === 'wav') type = 'audio/wav';
    else if (ext === 'ogg') type = 'audio/ogg';
    else if (ext === 'm4a') type = 'audio/mp4';
    else if (ext === 'webm' && name.includes('audio')) type = 'audio/webm';
    else if (['mp4', 'm4v'].includes(ext)) type = 'video/mp4';
    else if (ext === 'webm') type = 'video/webm';
    else if (['mov', 'qt'].includes(ext)) type = 'video/quicktime';
    else if (ext === 'mkv') type = 'video/x-matroska';
  }

  if (type && type !== file.type) {
    return new File([file], file.name || 'media', {
      type,
      lastModified: file.lastModified || Date.now()
    });
  }

  return file;
}

/**
 * Convert HEIC/HEIF → JPEG
 */
async function convertHeicToJpeg(file) {
  try {
    showToast('Converting iPhone photo (HEIC)…', 'info');
    const heic2any = await loadHeic2Any();

    const result = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.88
    });

    const jpegBlob = Array.isArray(result) ? result[0] : result;
    const baseName = (file.name || 'photo').replace(/\.[^/.]+$/, '');

    return new File([jpegBlob], `${baseName}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now()
    });
  } catch (err) {
    console.error('[Upload] HEIC conversion failed:', err);
    throw new Error('Could not convert HEIC photo. Please take a new photo in “Most Compatible” mode or convert it to JPEG first.');
  }
}

/**
 * Universal pre-upload media pipeline.
 * Scrubs metadata and prepares the file according to identity mode.
 * Mobile + HEIC hardened.
 */
export async function prepareMediaForUpload(file, options = {}) {
  if (!file) throw new Error('No file provided');

  // ===== MOBILE HARDENING =====
  file = normalizeMediaFile(file);
  let type = (file.type || '').toLowerCase();

  // Final extension fallback
  if (!type && file.name) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif'].includes(ext)) {
      type = 'image/' + (ext === 'jpg' ? 'jpeg' : ext);
    } else if (['mp3', 'wav', 'ogg', 'm4a', 'webm'].includes(ext)) {
      type = 'audio/' + ext;
    } else if (['mp4', 'webm', 'mov', 'mkv'].includes(ext)) {
      type = 'video/' + ext;
    }
  }

  // ========== IMAGE PATH ==========
  if (type.startsWith('image/') || type === 'image/heic' || type === 'image/heif') {
    try {
      // Convert HEIC first
      if (type === 'image/heic' || type === 'image/heif') {
        file = await convertHeicToJpeg(file);
        type = 'image/jpeg';
      }

      // Scrub EXIF/GPS
      const cleanFile = await scrubImageMetadata(file, {
        maxWidth: options.maxWidth || 1920,
        maxHeight: options.maxHeight || 1080,
        outputType: 'image/webp',
        quality: 0.85,
        ...options
      });

      // Extra compression if still large
      let finalFile = cleanFile;
      if (cleanFile.size > 400 * 1024) {
        finalFile = await compressImage(cleanFile, {
          maxWidth: options.maxWidth || 1600,
          maxHeight: options.maxHeight || 1600,
          quality: 0.82
        });
      }

      // Flag so downstream knows it's pre-cleaned
      try {
        Object.defineProperty(finalFile, 'isCleaned', { value: true, writable: false });
      } catch (_) {}

      return finalFile;
    } catch (err) {
      console.error('[Upload] Image preparation failed:', err);
      showToast(err.message || 'Image processing failed', 'warning');
      throw err;
    }
  }

  // ========== AUDIO PATH ==========
  if (type.startsWith('audio/')) {
    return file;
  }

  // ========== VIDEO PATH ==========
  if (type.startsWith('video/')) {
    const maxVideoSize = 250 * 1024 * 1024; // 250 MB
    if (file.size > maxVideoSize) {
      throw new Error('Video file size exceeds the 250MB limit.');
    }
    return file;
  }

  throw new Error('Unsupported media type. Only image, audio, and video files are supported.');
}

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
 * Scrubs + compresses + uploads an image to Cloudflare R2
 */
export async function uploadSecurePhoto(file, folderPath = 'evidence', onProgress = null) {
  if (!file) {
    throw new Error('Invalid input: Please select a valid image file.');
  }

  // Enforce rate limit before proceeding
  assertRateLimit('upload', RL.upload);

  // Normalize early
  file = normalizeMediaFile(file);

  const isAlreadyClean = Boolean(file.isCleaned) || Boolean(file.name && file.name.includes('_clean'));

  if (!isAlreadyClean) {
    showToast('🛡️ Stripping EXIF & location data...', 'info');
  }

  const preparedFile = isAlreadyClean
    ? file
    : await prepareMediaForUpload(file, {
        maxWidth: 1920,
        maxHeight: 1080
      });

  const uid = auth.currentUser?.uid || 'anonymous';
  const fileId = crypto.randomUUID();

  const mimeSubtype = preparedFile.type ? preparedFile.type.split('/')[1] : 'jpeg';
  const ext = mimeSubtype === 'png' ? 'png' : mimeSubtype === 'webp' ? 'webp' : 'jpg';

  const keyPath = folderPath.includes(uid)
    ? `${folderPath}/${fileId}.${ext}`
    : `${folderPath}/${uid}/${fileId}.${ext}`;

  try {
    setUploadProgress(0, 'Uploading photo...');
    const publicUrl = await executeUpload(
      preparedFile,
      keyPath,
      preparedFile.type || 'image/webp',
      (percent) => {
        if (typeof onProgress === 'function') onProgress(percent);
        setUploadProgress(percent, 'Uploading photo...');
      }
    );

    await logAuditEvent?.('MEDIA_UPLOADED', {
      type: 'image',
      path: keyPath,
      size: preparedFile.size
    });

    return publicUrl;
  } catch (err) {
    console.error('[Upload] Secure image processing failed:', err);
    showToast('❌ Image privacy processing failed', 'error');
    throw err;
  } finally {
    setUploadProgress(null);
  }
}

/**
 * Uploads audio evidence to Cloudflare R2
 */
export async function uploadSecureAudio(audioBlob, folderPath = 'evidence', onProgress = null) {
  if (!audioBlob) throw new Error('Invalid audio file');

  assertRateLimit('upload', RL.upload);

  // Normalize
  const file = normalizeMediaFile(audioBlob instanceof File ? audioBlob : new File([audioBlob], 'audio.webm', { type: audioBlob.type || 'audio/webm' }));

  showToast('🛡️ Preparing secure audio upload...', 'info');

  const mimeType = file.type || 'audio/webm';
  const ext = mimeType.includes('mp3') || mimeType.includes('mpeg') ? 'mp3'
            : mimeType.includes('wav') ? 'wav'
            : mimeType.includes('m4a') || mimeType.includes('mp4') ? 'm4a'
            : 'webm';

  const uid = auth.currentUser?.uid || 'anonymous';
  const fileId = crypto.randomUUID();

  const keyPath = folderPath.includes(uid)
    ? `${folderPath}/${fileId}.${ext}`
    : `${folderPath}/${uid}/${fileId}.${ext}`;

  try {
    setUploadProgress(0, 'Uploading audio...');
    const publicUrl = await executeUpload(
      file,
      keyPath,
      mimeType,
      (percent) => {
        if (typeof onProgress === 'function') onProgress(percent);
        setUploadProgress(percent, 'Uploading audio...');
      }
    );

    await logAuditEvent?.('MEDIA_UPLOADED', {
      type: 'audio',
      path: keyPath,
      size: file.size
    });

    return publicUrl;
  } catch (err) {
    console.error('[Upload] Secure audio processing failed:', err);
    showToast('❌ Audio upload failed', 'error');
    throw err;
  } finally {
    setUploadProgress(null);
  }
}


/**
 * Upload non-media files (PDF, DOC, TXT, ZIP, etc.) to R2 without image/audio transforms.
 * Used by Group Evidence Locker for documents.
 * Max 80 MB. No EXIF scrub (not applicable).
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

  showToast('🛡️ Preparing secure document upload...', 'info');

  const uid = auth.currentUser?.uid || 'anonymous';
  const fileId = crypto.randomUUID();

  // Preserve a safe extension
  const extMatch = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  const ext = extMatch ? extMatch[1] : 'bin';
  const safeExt = ['pdf', 'txt', 'zip', 'doc', 'docx'].includes(ext) ? ext : 'bin';

  const keyPath = folderPath.includes(uid)
    ? `${folderPath}/${fileId}.${safeExt}`
    : `${folderPath}/${uid}/${fileId}.${safeExt}`;

  const contentType =
    mime && mime !== 'application/octet-stream'
      ? mime
      : safeExt === 'pdf'
        ? 'application/pdf'
        : safeExt === 'txt'
          ? 'text/plain'
          : safeExt === 'zip'
            ? 'application/zip'
            : safeExt === 'doc'
              ? 'application/msword'
              : safeExt === 'docx'
                ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                : 'application/octet-stream';

  try {
    setUploadProgress(0, 'Uploading document...');
    const publicUrl = await executeUpload(
      file,
      keyPath,
      contentType,
      (percent) => {
        if (typeof onProgress === 'function') onProgress(percent);
        setUploadProgress(percent, 'Uploading document...');
      }
    );

    await logAuditEvent?.('MEDIA_UPLOADED', {
      type: 'document',
      path: keyPath,
      size: file.size
    });

    return publicUrl;
  } catch (err) {
    console.error('[Upload] Raw file upload failed:', err);
    showToast('❌ Document upload failed', 'error');
    throw err;
  } finally {
    setUploadProgress(null);
  }
}

/**
 * Uploads video evidence to Cloudflare R2
 */
export async function uploadSecureVideo(videoFile, folderPath = 'evidence', onProgress = null) {
  if (!videoFile) {
    throw new Error('Invalid input: Please select a valid video file.');
  }

  assertRateLimit('upload', RL.upload);

  // Normalize
  videoFile = normalizeMediaFile(videoFile);

  if (!videoFile.type.startsWith('video/') && !/\.(mp4|webm|mov|mkv|m4v)$/i.test(videoFile.name || '')) {
    throw new Error('Invalid input: Please select a valid video file.');
  }

  showToast('🛡️ Preparing secure video upload...', 'info');

  const mimeType = videoFile.type || 'video/mp4';
  const ext = mimeType.includes('webm') ? 'webm'
            : mimeType.includes('quicktime') || mimeType.includes('mov') ? 'mov'
            : 'mp4';

  const uid = auth.currentUser?.uid || 'anonymous';
  const fileId = crypto.randomUUID();

  const keyPath = folderPath.includes(uid)
    ? `${folderPath}/${fileId}.${ext}`
    : `${folderPath}/${uid}/${fileId}.${ext}`;

  try {
    setUploadProgress(0, 'Uploading video...');
    const publicUrl = await executeUpload(
      videoFile,
      keyPath,
      mimeType,
      (percent) => {
        if (typeof onProgress === 'function') onProgress(percent);
        setUploadProgress(percent, 'Uploading video...');
      }
    );

    await logAuditEvent?.('MEDIA_UPLOADED', {
      type: 'video',
      path: keyPath,
      size: videoFile.size
    });

    return publicUrl;
  } catch (err) {
    console.error('[Upload] Secure video processing failed:', err);
    showToast('❌ Video upload failed', 'error');
    throw err;
  } finally {
    setUploadProgress(null);
  }
}

/**
 * Universal upload helper — images, audio, video, and allowed documents.
 */
export async function uploadMedia(file, folderPath = 'evidence', onProgress = null) {
  if (!file) throw new Error('No file provided for upload.');

  // Normalize first (helps mobile empty MIME types)
  file = normalizeMediaFile(file);
  const type = (file.type || '').toLowerCase();
  const name = file.name || '';

  if (
    type.startsWith('image/') ||
    type === 'image/heic' ||
    type === 'image/heif' ||
    /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(name)
  ) {
    return await uploadSecurePhoto(file, folderPath, onProgress);
  }

  if (type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|webm)$/i.test(name)) {
    return await uploadSecureAudio(file, folderPath, onProgress);
  }

  if (type.startsWith('video/') || /\.(mp4|webm|mov|mkv|m4v)$/i.test(name)) {
    return await uploadSecureVideo(file, folderPath, onProgress);
  }

  // Documents for Evidence Locker / sealed packs
  if (
    type.startsWith('application/') ||
    type === 'text/plain' ||
    /\.(pdf|txt|zip|doc|docx)$/i.test(name)
  ) {
    return await uploadRawFile(file, folderPath, onProgress);
  }

  throw new Error(
    'Unsupported file type. Allowed: image, audio, video, PDF, TXT, ZIP, DOC, DOCX.'
  );
}


/**
 * Low-level upload to R2 via XHR.
 * Requires Firebase Auth + App Check tokens when available.
 */
function executeUpload(blob, keyPath, mimeType, onProgress) {
  return new Promise(async (resolve, reject) => {
    if (!auth.currentUser) {
      reject(new Error('Sign in required to upload media.'));
      return;
    }

    const xhr = new XMLHttpRequest();
    const targetUrl = `${R2_UPLOAD_ENDPOINT}?key=${encodeURIComponent(keyPath)}`;

    xhr.open('PUT', targetUrl, true);
    xhr.setRequestHeader('Content-Type', mimeType || 'application/octet-stream');

    try {
      const idToken = await auth.currentUser.getIdToken();
      xhr.setRequestHeader('Authorization', `Bearer ${idToken}`);
    } catch (err) {
      reject(new Error('Could not get auth token for upload.'));
      return;
    }

    // App Check — required in production; worker should reject if missing
    try {
      if (appCheck) {
        const { token } = await getToken(appCheck, /* forceRefresh */ false);
        if (token) {
          xhr.setRequestHeader('X-Firebase-AppCheck', token);
        }
      }
    } catch (err) {
      console.warn('[Upload] App Check token unavailable:', err?.message || err);
    }

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
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(blob);
  });
}
