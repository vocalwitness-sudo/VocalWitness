/**
 * VocalWitness Upload Module (js/upload.js)
 * Handles client-side EXIF scrubbing and direct uploads to Cloudflare R2 Storage.
 */

import { scrubImageMetadata } from './imageScrubber.js';
import { auth } from './firebase-config.js';

const R2_UPLOAD_ENDPOINT = 'https://media.vocalwitness.com/upload';

/**
 * Scrubs and uploads a photo or profile image to Cloudflare R2 via Worker.
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
    const cleanBlob = await scrubImageMetadata(file, {
      maxWidth: 1920,
      maxHeight: 1080,
      outputType: 'image/webp',
      quality: 0.85
    });

    const uid = auth.currentUser?.uid || 'anonymous';
    const fileId = crypto.randomUUID();
    const keyPath = `${folderPath}/${uid}/${fileId}.webp`;

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', `${R2_UPLOAD_ENDPOINT}?key=${encodeURIComponent(keyPath)}`, true);
      xhr.setRequestHeader('Content-Type', 'image/webp');

      if (auth.currentUser) {
        auth.currentUser.getIdToken().then(token => {
          xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          xhr.send(cleanBlob);
        }).catch(reject);
      } else {
        xhr.send(cleanBlob);
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
            resolve(response.url || `https://media.vocalwitness.com/${keyPath}`);
          } catch (_) {
            resolve(`https://media.vocalwitness.com/${keyPath}`);
          }
        } else {
          reject(new Error(`Upload failed with status code ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error("Failed to upload image to media bucket."));
    });

  } catch (err) {
    console.error("[Upload] Secure processing failed:", err);
    throw err;
  }
}
