// js/media-pipeline.js
// Unified pre-upload media pipeline for VocalWitness
// Handles image EXIF scrubbing + audio normalization based on identity mode

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

    const type = file.type || '';

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

    // Unsupported type
    throw new Error(`Unsupported media type: ${type || 'unknown'}`);
}
