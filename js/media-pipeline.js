// js/media-pipeline.js
// Unified pre-upload media pipeline for VocalWitness
// Handles image EXIF scrubbing, audio normalization, video pass-through, and SHA-256 hashing
// Mobile-hardened: empty MIME type + HEIC support

import { scrubImageMetadata } from './imageScrubber.js';
import { normalizeAudioBlob } from './audio-normalize.js';
import { compressImage } from './media-compression.js';
import { computeSHA256 } from './utils.js';
import { showToast } from './utils.js';
import { uploadMedia } from './upload.js';

/**
 * Normalize File objects coming from mobile pickers.
 * Many mobile browsers (especially iOS) return empty file.type or HEIC.
 */
export function normalizeMediaFile(file) {
    if (!file) return null;

    let type = (file.type || '').toLowerCase();

    // Infer from extension when type is missing or generic
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
        else if (ext === 'webm') type = 'audio/webm';
        else if (['mp4', 'm4v'].includes(ext)) type = 'video/mp4';
        else if (ext === 'webm') type = 'video/webm';
        else if (['mov', 'qt'].includes(ext)) type = 'video/quicktime';
        else if (ext === 'mkv') type = 'video/x-matroska';
    }

    // Force a proper File object with corrected type
    if (type && type !== file.type) {
        return new File([file], file.name || 'media', {
            type,
            lastModified: file.lastModified || Date.now()
        });
    }

    return file;
}

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

    // ===== MOBILE HARDENING =====
    file = normalizeMediaFile(file);

    let type = file.type || '';

    // Final fallback if still empty
    if (!type && file.name) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif'].includes(ext)) type = 'image/' + (ext === 'jpg' ? 'jpeg' : ext);
        if (['mp3', 'wav', 'ogg', 'm4a', 'webm'].includes(ext)) type = 'audio/' + ext;
        if (['mp4', 'webm', 'mov', 'mkv'].includes(ext)) type = 'video/' + ext;
    }

    let processedBlob = file;

    // ========== IMAGE PATH ==========
    if (type.startsWith('image/') || type === 'image/heic' || type === 'image/heif') {
        try {
            // HEIC is not supported by most browsers for canvas → give clear feedback
            if (type === 'image/heic' || type === 'image/heif') {
                showToast('HEIC photos from iPhone are not supported yet. Please convert to JPEG or take a new photo in "Most Compatible" mode.', 'warning');
                throw new Error('HEIC format is not supported in browser. Convert to JPEG first.');
            }

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
        // Direct pass-through for video (handled by video-validator.js)
        processedBlob = file;
    } else {
        throw new Error(`Unsupported media type: ${type || 'unknown'}. Please use JPEG, PNG, WebP, MP4, WebM, MOV, MP3, WAV or M4A.`);
    }

    // Ensure we have a proper File object retaining name/metadata interface
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

/**
 * Complete Pipeline: Prepares (scrubs/normalizes/hashes) and securely uploads any media file to Cloudflare R2.
 * 
 * @param {File|Blob} file - The raw file selected by the user.
 * @param {string} [folderPath='evidence'] - Destination directory in R2.
 * @param {Function} [onProgress] - Callback for real-time progress percentage (0-100).
 * @param {Object} [options] - Optional pipeline settings.
 * @returns {Promise<{publicUrl: string, hash: string}>}
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

        return {
            publicUrl,
            hash
        };

    } catch (error) {
        console.error('[MediaPipeline] Processing and upload sequence failed:', error);
        throw error;
    }
}
