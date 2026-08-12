/**
 * VocalWitness Client-Side EXIF & Metadata Scrubber
 * Converts file inputs into clean, metadata-free Files prior to Cloudflare R2 / Storage upload.
 */

/**
 * Scrubs EXIF, GPS, and device metadata from an image file.
 * 
 * @param {File|Blob} imageFile - The raw uploaded image file.
 * @param {Object} [options={}] - Configuration options.
 * @param {number} [options.maxWidth=2048] - Max width allowed (downscales larger images).
 * @param {number} [options.maxHeight=2048] - Max height allowed.
 * @param {string} [options.outputType='image/webp'] - Target format ('image/webp', 'image/jpeg').
 * @param {number} [options.quality=0.85] - Compression quality (0.0 to 1.0).
 * @returns {Promise<File>} A clean, metadata-free image File ready for upload.
 */
export async function scrubImageMetadata(imageFile, options = {}) {
    const {
        maxWidth = 2048,
        maxHeight = 2048,
        outputType = 'image/webp',
        quality = 0.85
    } = options;

    if (!imageFile || !imageFile.type || !imageFile.type.startsWith('image/')) {
        throw new Error('Invalid input: A valid image file must be provided.');
    }

    try {
        // 1. Load image into ImageBitmap
        // 'from-image' correctly bakes EXIF rotation into raw pixels so mobile photos stay upright
        let bitmap;
        try {
            bitmap = await createImageBitmap(imageFile, { imageOrientation: 'from-image' });
        } catch (_) {
            bitmap = await createImageBitmap(imageFile);
        }

        // 2. Calculate aspect-ratio scaling
        let { width, height } = bitmap;
        if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
        }

        // 3. Render onto Canvas (DOM element fallback for legacy WebKit)
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

        if (!ctx) throw new Error('Could not acquire 2D context for image scrubbing.');

        // Clear canvas buffer to eliminate potential ghost pixels
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(bitmap, 0, 0, width, height);

        // Explicitly release GPU/memory handle
        if (typeof bitmap.close === 'function') {
            bitmap.close();
        }

        // 4. Export clean Blob with type fallback (JPEG fallback for older WebKit without WebP canvas export)
        let cleanBlob;
        const exportBlob = async (type) => {
            if (canvas.convertToBlob) {
                return await canvas.convertToBlob({ type, quality });
            }
            return new Promise((resolve, reject) => {
                canvas.toBlob(
                    (b) => b ? resolve(b) : reject(new Error('Canvas blob generation failed')),
                    type,
                    quality
                );
            });
        };

        try {
            cleanBlob = await exportBlob(outputType);
        } catch (_) {
            cleanBlob = await exportBlob('image/jpeg');
        }

        // 5. Wrap as a clean File object preserving name and timestamps for storage path resolvers
        const ext = (cleanBlob.type || 'image/webp').split('/')[1] || 'webp';
        const rawName = imageFile.name ? imageFile.name.replace(/\.[^/.]+$/, '') : 'witness_photo';
        
        return new File([cleanBlob], `${rawName}_clean.${ext}`, {
            type: cleanBlob.type,
            lastModified: Date.now()
        });

    } catch (err) {
        console.error('[ImageScrubber] Metadata removal failed:', err);
        throw new Error(`Failed to scrub photo metadata: ${err.message}`);
    }
}
