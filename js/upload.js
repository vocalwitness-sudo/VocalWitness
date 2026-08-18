/**
 * VocalWitness Upload Module (js/upload.js)
 * Handles client-side EXIF scrubbing, image compression, and direct uploads to Cloudflare R2.
 */

import { scrubImageMetadata } from './imageScrubber.js';
import { compressImage } from './media-compression.js';
import { auth } from './firebase-config.js';
import { showToast } from './utils.js';

const R2_UPLOAD_ENDPOINT = 'https://media.vocalwitness.com/upload';
const R2_PUBLIC_BASE = 'https://media.vocalwitness.com';

/**
 * Scrubs EXIF metadata, compresses (only if needed), and uploads an image to Cloudflare R2.
 * 
 * @param {File} file - Raw input image file.
 * @param {string} [folderPath='witness_evidence'] - Destination directory in R2 bucket.
 * @param {Function} [onProgress] - Optional callback for tracking progress (0-100).
 * @returns {Promise<string>} Public HTTPS URL of the stored file.
 */
export async function uploadSecurePhoto(file, folderPath = 'witness_evidence', onProgress = null) {
  if (!file || !file.type.startsWith('image/')) {
    throw new Error("Invalid input: Please select a valid image file.");
  }

  try {
    // Active Redaction Alert Toast
    showToast("🛡️ AI Privacy Filter stripping raw EXIF/Location data before saving to ledger...", "info");

    // 1. Strip EXIF & GPS metadata + resize
    const cleanBlob = await scrubImageMetadata(file, {
      maxWidth: 1920,
      maxHeight: 1080,
      outputType: 'image/webp',
      quality: 0.85
    });

    // 2. Convert Blob to File
    const cleanFile = new File([cleanBlob], file.name || 'witness_image.webp', {
      type: cleanBlob.type || 'image/webp',
      lastModified: Date.now()
    });

    // 3. Compress only if the file is still large (avoids double-compression)
    let finalBlob = cleanFile;
    if (cleanFile.size > 350 * 1024) {   // only compress if > 350 KB
      finalBlob = await compressImage(cleanFile);
    }

    // 4. Construct path key
    const uid = auth.currentUser?.uid || 'anonymous';
    const fileId = crypto.randomUUID();
    const keyPath = `${folderPath}/${uid}/${fileId}.webp`;

    // 5. Upload
    return await executeUpload(finalBlob, keyPath, finalBlob.type || 'image/webp', onProgress);

  } catch (err) {
    console.error("[Upload] Secure image processing failed:", err);
    showToast("❌ Image privacy scrubbing failed.", "error");
    throw err;
  }
}

/**
 * Uploads audio evidence to Cloudflare R2 storage.
 */
export async function uploadSecureAudio(audioBlob, folderPath = 'witness_audio', onProgress = null) {
  if (!audioBlob) {
    throw new Error("Invalid input: Please select or record a valid audio file.");
  }

  showToast("🛡️ Preparing secure audio upload...", "info");

  const mimeType = audioBlob.type || 'audio/webm';
  const ext = mimeType.includes('mp3') ? 'mp3' : mimeType.includes('wav') ? 'wav' : 'webm';
  
  const uid = auth.currentUser?.uid || 'anonymous';
  const fileId = crypto.randomUUID();
  const keyPath = `${folderPath}/${uid}/${fileId}.${ext}`;

  return await executeUpload(audioBlob, keyPath, mimeType, onProgress);
}

/**
 * Low-level XHR PUT client supporting authorization headers and upload progress monitoring.
 */
function executeUpload(blob, keyPath, mimeType, onProgress) {
  return new Promise(async (resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const targetUrl = `${R2_UPLOAD_ENDPOINT}?key=${encodeURIComponent(keyPath)}`;

    xhr.open('PUT', targetUrl, true);
    xhr.setRequestHeader('Content-Type', mimeType);

    // Attach authentication token if present
    if (auth.currentUser) {
      try {
        const token = await auth.currentUser.getIdToken();
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      } catch (tokenErr) {
        console.warn("[Upload] Could not retrieve ID token:", tokenErr);
      }
    }

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable) {
          const progress = Math.round((evt.loaded / evt.total) * 100);
          onProgress(progress);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          resolve(response.url || `${R2_PUBLIC_BASE}/${keyPath}`);
        } catch (_) {
          resolve(`${R2_PUBLIC_BASE}/${keyPath}`);
        }
      } else {
        reject(new Error(`Upload failed with status code ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error("Failed to upload media to server. Check network connection."));
    xhr.send(blob);
  });
}

/**
 * Universal upload helper routing files automatically based on MIME type.
 */
export async function uploadMedia(file, folderPath = 'witness_evidence', onProgress = null) {
  if (file.type.startsWith('image/')) {
    return await uploadSecurePhoto(file, folderPath, onProgress);
  } else if (file.type.startsWith('audio/')) {
    return await uploadSecureAudio(file, folderPath, onProgress);
  } else {
    throw new Error("Unsupported media type. Please upload an image or audio file.");
  }
}
