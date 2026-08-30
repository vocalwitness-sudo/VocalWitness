/**
 * VocalWitness Upload Module (js/upload.js)
 * Handles client-side EXIF scrubbing, compression, and secure uploads to Cloudflare R2.
 */
import { scrubImageMetadata } from './imageScrubber.js';
import { compressImage } from './media-compression.js';
import { auth } from './firebase-config.js';
import { showToast } from './utils.js';
import { logAuditEvent } from './audit.js';

const R2_UPLOAD_ENDPOINT = 'https://media.vocalwitness.com/upload';
const R2_PUBLIC_BASE = 'https://media.vocalwitness.com';

/**
 * Universal pre-upload media pipeline.
 * Scrubs metadata and prepares the file according to identity mode.
 */
export async function prepareMediaForUpload(file, options = {}) {
    if (!file) throw new Error('No file provided');

    if (file.type.startsWith('image/')) {
        // Scrub EXIF/GPS based on ANONYMOUS / BOLD_WITNESS mode
        const cleanFile = await scrubImageMetadata(file, {
            maxWidth: options.maxWidth || 1920,
            maxHeight: options.maxHeight || 1080,
            outputType: 'image/webp',
            quality: 0.85,
            ...options
        });

        // Optional extra compression if still large
        let finalFile = cleanFile;
        if (cleanFile.size > 400 * 1024) {
            finalFile = await compressImage(cleanFile, {
                maxWidth: options.maxWidth || 1600,
                maxHeight: options.maxHeight || 1600,
                quality: 0.82
            });
        }

        // Flag the file object so downstream processors know it's pre-cleaned
        try {
            Object.defineProperty(finalFile, 'isCleaned', { value: true, writable: false });
        } catch (_) {}

        return finalFile;
    }

    // Audio path
    if (file.type.startsWith('audio/')) {
        return file;
    }

    throw new Error('Unsupported media type');
}

/**
 * Scrubs + compresses + uploads an image to Cloudflare R2
 */
export async function uploadSecurePhoto(file, folderPath = 'evidence', onProgress = null) {
    if (!file || !file.type.startsWith('image/')) {
        throw new Error('Invalid input: Please select a valid image file.');
    }

    try {
        // Guard: Check if the file is already scrubbed/cleaned to avoid double-processing
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
        const ext = preparedFile.type === 'image/webp' ? 'webp' : 'jpg';

        // Prevents nested /UID/UID/ duplication if folderPath already includes uid
        const keyPath = folderPath.includes(uid)
            ? `${folderPath}/${fileId}.${ext}`
            : `${folderPath}/${uid}/${fileId}.${ext}`;

        const publicUrl = await executeUpload(
            preparedFile,
            keyPath,
            preparedFile.type || 'image/webp',
            onProgress
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
    }
}

/**
 * Uploads audio evidence
 */
export async function uploadSecureAudio(audioBlob, folderPath = 'evidence', onProgress = null) {
    if (!audioBlob) throw new Error('Invalid audio file');

    showToast('🛡️ Preparing secure audio upload...', 'info');

    const mimeType = audioBlob.type || 'audio/webm';
    const ext = mimeType.includes('mp3') ? 'mp3' : mimeType.includes('wav') ? 'wav' : 'webm';

    const uid = auth.currentUser?.uid || 'anonymous';
    const fileId = crypto.randomUUID();

    // Prevents nested /UID/UID/ duplication if folderPath already includes uid
    const keyPath = folderPath.includes(uid)
        ? `${folderPath}/${fileId}.${ext}`
        : `${folderPath}/${uid}/${fileId}.${ext}`;

    return await executeUpload(audioBlob, keyPath, mimeType, onProgress);
}

/**
 * Universal upload helper
 */
export async function uploadMedia(file, folderPath = 'evidence', onProgress = null) {
    if (file.type.startsWith('image/')) {
        return await uploadSecurePhoto(file, folderPath, onProgress);
    }
    if (file.type.startsWith('audio/')) {
        return await uploadSecureAudio(file, folderPath, onProgress);
    }
    throw new Error('Unsupported media type. Only image and audio are allowed.');
}

/**
 * Low-level upload to R2
 */
function executeUpload(blob, keyPath, mimeType, onProgress) {
    return new Promise(async (resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const targetUrl = `${R2_UPLOAD_ENDPOINT}?key=${encodeURIComponent(keyPath)}`;

        xhr.open('PUT', targetUrl, true);
        xhr.setRequestHeader('Content-Type', mimeType);

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
                // Construct canonical path matching the worker target
                const canonicalUrl = `${R2_PUBLIC_BASE}/${keyPath}`;
                resolve(canonicalUrl);
            } else {
                reject(new Error(`Upload failed with status ${xhr.status}`));
            }
        };

        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.send(blob);
    });
}
