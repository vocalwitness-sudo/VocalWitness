// js/imageScrubber.js - VocalWitness Client-Side EXIF & Metadata Scrubber
import { AppState } from './app-state.js';
import { logAuditEvent } from './audit.js';

/**
 * Scrubs EXIF, GPS, and device metadata from an image file based on active identity mode.
 *
 * @param {File|Blob} imageFile - The raw uploaded image file.
 * @param {Object} [options={}] - Configuration options.
 * @param {number} [options.maxWidth=2048] - Max width allowed (downscales larger images).
 * @param {number} [options.maxHeight=2048] - Max height allowed.
 * @param {string} [options.outputType='image/webp'] - Target format ('image/webp', 'image/jpeg').
 * @param {number} [options.quality=0.85] - Compression quality (0.0 to 1.0).
 * @param {boolean} [options.forceScrub] - Manual override to force or bypass scrubbing regardless of state.
 * @returns {Promise<File>} A clean, metadata-free image File or intact raw File.
 */
export async function scrubImageMetadata(imageFile, options = {}) {
    const {
        maxWidth = 2048,
        maxHeight = 2048,
        outputType = 'image/webp',
        quality = 0.85,
        forceScrub
    } = options;

    if (!imageFile || !(imageFile instanceof Blob) || !imageFile.type?.startsWith('image/')) {
        throw new Error('Invalid input: A valid image File or Blob must be provided.');
    }

   // Batch 1 policy: always scrub by default.
// Only skip if caller explicitly sets forceScrub = false.
const shouldScrub = forceScrub !== false;

if (!shouldScrub) {
    await logAuditEvent?.("MEDIA_METADATA_PRESERVED", {
        filename: imageFile.name || 'unnamed',
        reason: 'forceScrub=false',
        size: imageFile.size
    });
    return imageFile;
}

    try {
        // 2. Load image into ImageBitmap
        // 'from-image' bakes EXIF orientation into pixels so mobile photos stay upright
        let bitmap;
        try {
            bitmap = await createImageBitmap(imageFile, { imageOrientation: 'from-image' });
        } catch {
            bitmap = await createImageBitmap(imageFile);
        }

        // 3. Calculate aspect-ratio preserving scale
        let { width, height } = bitmap;
        if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
        }

        // 4. Render onto Canvas (prefer OffscreenCanvas)
        let canvas, ctx;
        if (typeof OffscreenCanvas !== 'undefined') {
            canvas = new OffscreenCanvas(width, height);
            ctx = canvas.getContext('2d');
        } else {
            canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            ctx = canvas.getContext('2d');
        }

        if (!ctx) {
            throw new Error('Could not acquire 2D rendering context.');
        }

        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(bitmap, 0, 0, width, height);

        // Release GPU resources as early as possible
        if (typeof bitmap.close === 'function') {
            bitmap.close();
        }

        // 5. Export clean Blob
        const exportBlob = async (type) => {
            if (canvas.convertToBlob) {
                return await canvas.convertToBlob({ type, quality });
            }
            return new Promise((resolve, reject) => {
                canvas.toBlob(
                    (blob) => blob ? resolve(blob) : reject(new Error('toBlob failed')),
                    type,
                    quality
                );
            });
        };

        let cleanBlob;
        try {
            cleanBlob = await exportBlob(outputType);
        } catch {
            // Fallback for older browsers that don't support WebP export
            cleanBlob = await exportBlob('image/jpeg');
        }

        // 6. Create clean File object
        const ext = (cleanBlob.type || 'image/webp').split('/')[1] || 'webp';
        const baseName = imageFile.name
            ? imageFile.name.replace(/\.[^/.]+$/, '')
            : 'witness_photo';

        const cleanFile = new File([cleanBlob], `${baseName}_clean.${ext}`, {
            type: cleanBlob.type,
            lastModified: Date.now()
        });

        // 7. Audit
        await logAuditEvent("MEDIA_METADATA_SCRUBBED", {
            filename: imageFile.name || 'unnamed',
            mode: activeMode,
            originalSize: imageFile.size,
            cleanSize: cleanFile.size,
            outputType: cleanBlob.type
        });

        return cleanFile;

    } catch (err) {
        console.error('[ImageScrubber] Metadata removal failed:', err);
        throw new Error(`Failed to scrub photo metadata: ${err.message}`);
    }
}
