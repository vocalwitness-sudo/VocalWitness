/**
 * VocalWitness Client-Side EXIF & Metadata Scrubber
 * Converts file inputs into clean, metadata-free Blobs prior to Firebase Storage upload.
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
 * @returns {Promise<Blob>} A clean, metadata-free image Blob ready for Firebase Storage.
 */
export async function scrubImageMetadata(imageFile, options = {}) {
    const {
        maxWidth = 2048,
        maxHeight = 2048,
        outputType = 'image/webp',
        quality = 0.85
    } = options;

    if (!imageFile || !imageFile.type.startsWith('image/')) {
        throw new Error('Invalid input: A valid image file must be provided.');
    }

    try {
        // 1. Load image into ImageBitmap
        // imageOrientation: 'none' applies EXIF orientation directly into raw pixels
        let bitmap;
        try {
            bitmap = await createImageBitmap(imageFile, { imageOrientation: 'none' });
        } catch {
            // Fallback for browsers with strict imageOrientation support
            bitmap = await createImageBitmap(imageFile);
        }

        // 2. Calculate aspect-ratio scaling
        let { width, height } = bitmap;
        if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
        }

        // 3. Render onto Canvas (OffscreenCanvas preferred for worker/thread support)
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

        // Clear canvas buffer to prevent memory leakage or residual pixels
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(bitmap, 0, 0, width, height);

        // Clean up bitmap memory immediately
        bitmap.close();

        // 4. Export clean Blob (Native canvas export generates pristine headers without EXIF)
        let cleanBlob;
        if (canvas.convertToBlob) {
            cleanBlob = await canvas.convertToBlob({ type: outputType, quality });
        } else {
            cleanBlob = await new Promise((resolve, reject) => {
                canvas.toBlob(
                    (blob) => blob ? resolve(blob) : reject(new Error('Canvas blob generation failed')),
                    outputType,
                    quality
                );
            });
        }

        return cleanBlob;

    } catch (err) {
        console.error('[ImageScrubber] Metadata removal failed:', err);
        throw new Error(`Failed to scrub photo metadata: ${err.message}`);
    }
}
