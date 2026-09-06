// js/media-pipeline.js
// Unified pre-upload media pipeline for VocalWitness
// Handles image EXIF scrubbing, audio normalization, and video pass-through

import { scrubImageMetadata } from './imageScrubber.js';
import { normalizeAudioBlob } from './audio-normalize.js';
import { compressImage } from './media-compression.js';
import { showToast } from './utils.js';

/**
 * Universal media preparation pipeline.
 * Applies privacy-preserving processing based on current identity mode.
 *
 * @param {File|Blob} file
 * @param {Object} [options]
 * @returns {Promise<File|Blob>} Cleaned / normalized media ready for upload
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

    // ========== IMAGE PATH ==========
    if (type.startsWith('image/')) {
        try {
            showToast('🛡️ Scrubbing image metadata...', 'info');

            // 1. Strip EXIF / GPS / device info (respects ANONYMOUS vs BOLD_WITNESS)
            let processed = await scrubImageMetadata(file, {
                maxWidth: options.maxWidth || 1920,
                maxHeight: options.maxHeight || 1080,
                outputType: 'image/webp',
                quality: 0.85,
                ...options
            });

            // 2. Extra compression if still large
            if (processed.size > 450 * 1024) {
                processed = await compressImage(processed, {
                    maxWidth: options.maxWidth || 1600,
                    maxHeight: options.maxHeight || 1600,
                    quality: 0.82
                });
            }

            // Ensure we return a File object retaining name/metadata interface
            if (processed instanceof Blob && !(processed instanceof File)) {
                const baseName = (file.name || 'image').replace(/\.[^/.]+$/, '');
                return new File([processed], `${baseName}_scrubbed.webp`, {
                    type: 'image/webp',
                    lastModified: Date.now()
                });
            }

            return processed;

        } catch (err) {
            console.error('[MediaPipeline] Image processing failed:', err);
            showToast('Image processing failed – using original', 'warning');
            return file;
        }
    }

    // ========== AUDIO PATH ==========
    if (type.startsWith('audio/')) {
        try {
            showToast('🛡️ Normalizing audio...', 'info');

            const result = await normalizeAudioBlob(file, {
                forceNormalize: options.forceNormalize
            });

            // Return as a proper File so downstream code stays happy
            const normalizedFile = new File(
                [result.blob],
                (file.name || 'recording').replace(/\.[^/.]+$/, '') + '_normalized.wav',
                {
                    type: 'audio/wav',
                    lastModified: Date.now()
                }
            );

            return normalizedFile;

        } catch (err) {
            console.error('[MediaPipeline] Audio normalization failed:', err);
            showToast('Audio processing failed – using original', 'warning');
            return file;
        }
    }

    // ========== VIDEO PATH (Pass-through for video-validator) ==========
    if (type.startsWith('video/')) {
        // Videos are validated via video-validator.js during selection.
        // Direct pass-through avoids breaking video payload pipelines.
        return file;
    }

    // Fallback for unsupported media types
    throw new Error(`Unsupported media type: ${type || 'unknown'}`);
}

import { uploadMedia } from './upload.js';

/**
 * Complete Pipeline: Prepares (scrubs/normalizes) and securely uploads any media file to Cloudflare R2.
 * 
 * @param {File|Blob} file - The raw file selected by the user.
 * @param {string} [folderPath='evidence'] - Destination directory in R2.
 * @param {Function} [onProgress] - Callback for real-time progress percentage (0-100).
 * @param {Object} [options] - Optional pipeline settings.
 * @returns {Promise<string>} - Resolves with the public Cloudflare R2 canonical URL.
 */
export async function processAndUploadMedia(file, folderPath = 'evidence', onProgress = null, options = {}) {
    if (!file) {
        throw new Error('No media file provided for upload pipeline.');
    }

    try {
        // 1. Run through the universal preparation pipeline (EXIF scrubbing, audio normalization, pass-through)
        const preparedFile = await prepareMediaForUpload(file, options);

        // 2. Hand off to the secure R2 upload module
        const publicUrl = await uploadMedia(preparedFile, folderPath, onProgress);

        return publicUrl;

    } catch (error) {
        console.error('[MediaPipeline] Processing and upload sequence failed:', error);
        throw error;
    }
}
