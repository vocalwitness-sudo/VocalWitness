/**
 * VocalWitness Upload Module (js/upload.js)
 * Handles client-side EXIF scrubbing, compression, and secure uploads to Cloudflare R2.
 * Supports: Images, Audio, and Video.
 * Mobile-hardened: empty MIME types + HEIC conversion support
 */
import { scrubImageMetadata } from './imageScrubber.js';
import { compressImage } from './media-compression.js';
import { auth } from './firebase-config.js';
import { showToast } from './utils.js';
import { logAuditEvent } from './audit.js';

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
 * Uploads video evidence to Cloudflare R2
 */
export async function uploadSecureVideo(videoFile, folderPath = 'evidence', onProgress = null) {
  if (!videoFile) {
    throw new Error('Invalid input: Please select a valid video file.');
  }

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
 * Universal upload helper routing images, audio, and videos properly
 */
export async function uploadMedia(file, folderPath = 'evidence', onProgress = null) {
  if (!file) throw new Error('No file provided for upload.');

  // Normalize first
  file = normalizeMediaFile(file);
  const type = (file.type || '').toLowerCase();

  if (type.startsWith('image/') || type === 'image/heic' || type === 'image/heif' ||
      /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name || '')) {
    return await uploadSecurePhoto(file, folderPath, onProgress);
  }

  if (type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|webm)$/i.test(file.name || '')) {
    return await uploadSecureAudio(file, folderPath, onProgress);
  }

  if (type.startsWith('video/') || /\.(mp4|webm|mov|mkv|m4v)$/i.test(file.name || '')) {
    return await uploadSecureVideo(file, folderPath, onProgress);
  }

  throw new Error('Unsupported media type. Only image, audio, and video files are allowed.');
}

/**
 * Low-level upload to R2 via XHR with progress tracking and authorization headers
 */
function executeUpload(blob, keyPath, mimeType, onProgress) {
  return new Promise(async (resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const targetUrl = `${R2_UPLOAD_ENDPOINT}?key=${encodeURIComponent(keyPath)}`;

    xhr.open('PUT', targetUrl, true);
    xhr.setRequestHeader('Content-Type', mimeType || 'application/octet-stream');

    if (auth.currentUser) {
      try {
        const token = await auth.currentUser.getIdToken();
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      } catch (err) {
        console.warn('[Upload] Could not get ID token:', err);
      }
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
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(blob);
  });
}
