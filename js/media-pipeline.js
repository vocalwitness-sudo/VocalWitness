// js/media-pipeline.js
// Unified pre-upload media pipeline for VocalWitness
// Handles image EXIF scrubbing, audio normalization, video pass-through, and SHA-256 hashing

import { scrubImageMetadata } from './imageScrubber.js';
import { normalizeAudioBlob } from './audio-normalize.js';
import { compressImage } from './media-compression.js';
import { computeSHA256 } from './utils.js';
import { showToast } from './utils.js';

/**
 * Universal media preparation pipeline.
 * Scrubs metadata, normalizes audio/images, and computes the local SHA-256 fingerprint.
 *
 * @param {File|Blob} file
 * @param {Object} [options]
 * @returns {Promise<{file: File, hash: string, size: number, mimeType: string}>}
 */
export async function prepareMediaForUpload(file, options = {}) {
    if (!file) {
        throw new Error('No media file provided');
    }

    // Infer type if file.type is blank (edge-case for some mobile pickers)
    let type = file.type || '';
    if (!type && file.name) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(ext)) type = 'image/' + ext;
        if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) type = 'audio/' + ext;
        if (['mp4', 'webm', 'mov', 'mkv'].includes(ext)) type = 'video/' + ext;
    }

    let processedBlob = file;

    // ========== IMAGE PATH ==========
    if (type.startsWith('image/')) {
        try {
            showToast('🛡️ Scrubbing image metadata...', 'info');

            // 1. Strip EXIF / GPS / device info
            processedBlob = await scrubImageMetadata(file, {
                maxWidth: options.maxWidth || 1920,
                maxHeight: options.maxHeight || 1080,
                outputType: 'image/webp',
                quality: 0.85,
                ...options
            });

            // 2. Extra compression if still large
            if (processedBlob.size > 450 * 1024) {
                processedBlob = await compressImage(processedBlob, {
                    maxWidth: options.maxWidth || 1600,
                    maxHeight: options.maxHeight || 1600,
                    quality: 0.82
                });
            }

            type = 'image/webp';
        } catch (err) {
            console.error('[MediaPipeline] Image processing failed:', err);
            showToast('Image processing failed – using original', 'warning');
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
        // Direct pass-through for video (handled by video-validator.js)
        processedBlob = file;
    } else {
        throw new Error(`Unsupported media type: ${type || 'unknown'}`);
    }

    // Ensure we have a proper File object retaining name/metadata interface
    let finalFile = processedBlob;
    if (!(finalFile instanceof File)) {
        const extMap = { 'image/webp': 'webp', 'audio/wav': 'wav', 'image/jpeg': 'jpg' };
        const ext = extMap[type] || type.split('/')[1] || 'bin';
        const baseName = (file.name || 'media').replace(/\.[^/.]+$/, '');
        finalFile = new File([processedBlob], `${baseName}_processed.${ext}`, {
            type: type,
            lastModified: Date.now()
        });
    }

    // ========== STEP 4: COMPUTE CLIENT-SIDE SHA-256 FINGERPRINT ==========
    const fileHash = await computeSHA256(finalFile);

    return {
        file: finalFile,
        hash: fileHash,
        mimeType: finalFile.type,
        size: finalFile.size
    };
}

import { uploadMedia } from './upload.js';

/**
 * Complete Pipeline: Prepares (scrubs/normalizes/hashes) and securely uploads any media file to Cloudflare R2.
 * 
 * @param {File|Blob} file - The raw file selected by the user.
 * @param {string} [folderPath='evidence'] - Destination directory in R2.
 * @param {Function} [onProgress] - Callback for real-time progress percentage (0-100).
 * @param {Object} [options] - Optional pipeline settings.
 * @returns {Promise<{publicUrl: string, hash: string}>} - Resolves with the R2 URL and SHA-256 hash.
 */
export async function processAndUploadMedia(file, folderPath = 'evidence', onProgress = null, options = {}) {
    if (!file) {
        throw new Error('No media file provided for upload pipeline.');
    }

    try {
        // 1. Run through the universal preparation pipeline
        const { file: preparedFile, hash } = await prepareMediaForUpload(file, options);

        // 2. Hand off to the secure R2 upload module
        const publicUrl = await uploadMedia(preparedFile, folderPath, onProgress);

        // Return both the URL and the hash so components can immediately log the timestamp or anchor it
        return {
            publicUrl,
            hash
        };

    } catch (error) {
        console.error('[MediaPipeline] Processing and upload sequence failed:', error);
        throw error;
    }
}
