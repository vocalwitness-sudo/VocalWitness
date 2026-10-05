// js/media-pipeline.js
// Unified pre-upload media pipeline – Mobile + HEIC hardened

import { scrubImageMetadata } from './imageScrubber.js';
import { normalizeAudioBlob } from './audio-normalize.js';
import { compressImage } from './media-compression.js';
import { computeSHA256 } from './utils.js';
import { showToast } from './utils.js';
import { uploadMedia } from './upload.js';

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
 */
export function normalizeMediaFile(file) {
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
 * Convert HEIC/HEIF → JPEG using heic2any
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

    // heic2any can return Blob or array of Blobs
    const jpegBlob = Array.isArray(result) ? result[0] : result;

    const baseName = (file.name || 'photo').replace(/\.[^/.]+$/, '');
    return new File([jpegBlob], `${baseName}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now()
    });
  } catch (err) {
    console.error('[MediaPipeline] HEIC conversion failed:', err);
    throw new Error('Could not convert HEIC photo. Please take a new photo in “Most Compatible” mode or convert it to JPEG first.');
  }
}

/**
 * Universal media preparation pipeline
 */
export async function prepareMediaForUpload(file, options = {}) {
  if (!file) throw new Error('No media file provided');

  // ===== MOBILE HARDENING =====
  file = normalizeMediaFile(file);
  let type = (file.type || '').toLowerCase();

  // Final fallback from extension
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

  let processedBlob = file;

  // ========== IMAGE PATH ==========
  if (type.startsWith('image/') || type === 'image/heic' || type === 'image/heif') {
    try {
      // Convert HEIC first
      if (type === 'image/heic' || type === 'image/heif') {
        file = await convertHeicToJpeg(file);
        type = 'image/jpeg';
      }

      showToast('🛡️ Scrubbing image metadata...', 'info');

      processedBlob = await scrubImageMetadata(file, {
        maxWidth: options.maxWidth || 1920,
        maxHeight: options.maxHeight || 1080,
        outputType: 'image/webp',
        quality: 0.85,
        ...options
      });

      if (processedBlob.size > 450 * 1024) {
        processedBlob = await compressImage(processedBlob, {
          maxWidth: options.maxWidth || 1600,
          maxHeight: options.maxHeight || 1600,
          quality: 0.82
        });
      }

      type = processedBlob.type || 'image/webp';
    } catch (err) {
      console.error('[MediaPipeline] Image processing failed:', err);
      showToast(err.message || 'Image processing failed – using original', 'warning');
      processedBlob = file;
    }
  }

  // ========== AUDIO PATH ==========
  else if (type.startsWith('audio/')) {
    try {
      showToast('🛡️ Normalizing audio...', 'info');
      const result = await normalizeAudioBlob(file, {
        forceNormalize: options.forceNormalize
      });
      processedBlob = result.blob;
      type = 'audio/wav';
    } catch (err) {
      console.error('[MediaPipeline] Audio normalization failed:', err);
      showToast('Audio processing failed – using original', 'warning');
      processedBlob = file;
    }
  }

  // ========== VIDEO PATH ==========
  else if (type.startsWith('video/')) {
    processedBlob = file;
  } else {
    throw new Error(`Unsupported media type: ${type || 'unknown'}. Please use JPEG, PNG, WebP, MP4, WebM, MOV, MP3, WAV or M4A.`);
  }

  // Ensure proper File object
  let finalFile = processedBlob;
  if (!(finalFile instanceof File)) {
    const extMap = {
      'image/webp': 'webp',
      'image/jpeg': 'jpg',
      'audio/wav': 'wav',
      'audio/mpeg': 'mp3',
      'video/mp4': 'mp4'
    };
    const ext = extMap[type] || type.split('/')[1] || 'bin';
    const baseName = (file.name || 'media').replace(/\.[^/.]+$/, '');
    finalFile = new File([processedBlob], `${baseName}_processed.${ext}`, {
      type,
      lastModified: Date.now()
    });
  }

  const fileHash = await computeSHA256(finalFile);

  return {
    file: finalFile,
    hash: fileHash,
    mimeType: finalFile.type,
    size: finalFile.size
  };
}

/**
 * Complete Pipeline → prepare + upload
 */
export async function processAndUploadMedia(file, folderPath = 'evidence', onProgress = null, options = {}) {
  if (!file) throw new Error('No media file provided for upload pipeline.');

  try {
    const { file: preparedFile, hash } = await prepareMediaForUpload(file, options);
    const publicUrl = await uploadMedia(preparedFile, folderPath, onProgress);

    return { publicUrl, hash };
  } catch (error) {
    console.error('[MediaPipeline] Processing and upload sequence failed:', error);
    throw error;
  }
}
