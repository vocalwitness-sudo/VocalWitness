export async function scrubImageMetadata(imageFile, options = {}) {
    const {
        maxWidth = 2048,
        maxHeight = 2048,
        outputType = 'image/webp',
        quality = 0.85,
        forceScrub
    } = options;

    if (!imageFile || !(imageFile instanceof Blob)) {
        throw new Error('Invalid input: A valid image File or Blob must be provided.');
    }

    // ===== MOBILE HARDENING =====
    const type = (imageFile.type || '').toLowerCase();
    const isProbablyImage =
        type.startsWith('image/') ||
        type === '' ||
        type === 'application/octet-stream' ||
        /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(imageFile.name || '');

    if (!isProbablyImage) {
        throw new Error('Invalid input: A valid image File or Blob must be provided.');
    }

   const identity = typeof getActiveIdentityConfig === 'function'
    ? getActiveIdentityConfig()
    : { mode: 'ANONYMOUS', scrubMetadata: true };

    const shouldScrub = forceScrub !== false && (forceScrub === true || identity.scrubMetadata !== false);

    if (!shouldScrub) {
        await logAuditEvent?.("MEDIA_METADATA_PRESERVED", {
            filename: imageFile.name || 'unnamed',
            reason: 'forceScrub=false or identity allows preserve',
            mode: identity.mode || 'unknown',
            size: imageFile.size
        });
        return imageFile;
    }

    // ========== TRY WORKER FIRST ==========
    try {
        const usedWorker = await scrubWithWorker(imageFile, {
            maxWidth,
            maxHeight,
            outputType,
            quality
        });
        if (usedWorker) {
            await logAuditEvent?.("MEDIA_METADATA_SCRUBBED", {
                filename: imageFile.name || 'unnamed',
               mode: identity.mode || 'scrub',
                originalSize: imageFile.size,
                cleanSize: usedWorker.size,
                outputType: usedWorker.type,
                via: 'worker'
            });
            return usedWorker;
        }
    } catch (workerErr) {
        console.warn('[ImageScrubber] Worker path failed, falling back:', workerErr?.message || workerErr);
    }

    // ========== ORIGINAL MAIN-THREAD FALLBACK (exact previous behaviour) ==========
    try {
        let bitmap;
        try {
            bitmap = await createImageBitmap(imageFile, { imageOrientation: 'from-image' });
        } catch {
            bitmap = await createImageBitmap(imageFile);
        }

        let { width, height } = bitmap;
        if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
        }

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

        if (!ctx) throw new Error('Could not acquire 2D rendering context.');

        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(bitmap, 0, 0, width, height);

        if (typeof bitmap.close === 'function') bitmap.close();

        const exportBlob = async (t) => {
            if (canvas.convertToBlob) {
                return await canvas.convertToBlob({ type: t, quality });
            }
            return new Promise((resolve, reject) => {
                canvas.toBlob(
                    (blob) => blob ? resolve(blob) : reject(new Error('toBlob failed')),
                    t,
                    quality
                );
            });
        };

        let cleanBlob;
        try {
            cleanBlob = await exportBlob(outputType);
        } catch {
            cleanBlob = await exportBlob('image/jpeg');
        }

        const ext = (cleanBlob.type || 'image/webp').split('/')[1] || 'webp';
        const baseName = imageFile.name
            ? imageFile.name.replace(/\.[^/.]+$/, '')
            : 'witness_photo';

        const cleanFile = new File([cleanBlob], `${baseName}_clean.${ext}`, {
            type: cleanBlob.type,
            lastModified: Date.now()
        });

        await logAuditEvent?.("MEDIA_METADATA_SCRUBBED", {
            filename: imageFile.name || 'unnamed',
            mode: identity.mode || state?.profileMode || 'scrub',
            originalSize: imageFile.size,
            cleanSize: cleanFile.size,
            outputType: cleanBlob.type,
            via: 'main'
        });

        return cleanFile;

    } catch (err) {
        console.error('[ImageScrubber] Metadata removal failed:', err);
        throw new Error(`Failed to scrub photo metadata: ${err.message}`);
    }
}

/**
 * Try to scrub using a Web Worker (transferable ImageBitmap).
 * Returns a clean File on success, or null / throws → caller falls back.
 */
async function scrubWithWorker(imageFile, opts) {
    // Feature detection
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
        return null;
    }

    let bitmap;
    try {
        bitmap = await createImageBitmap(imageFile, { imageOrientation: 'from-image' });
    } catch {
        bitmap = await createImageBitmap(imageFile);
    }

    return new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            resolve(value);
        };

        try {
            const worker = new Worker(new URL('./image-scrub-worker.js', import.meta.url), { type: 'module' });

            const timeout = setTimeout(() => {
                worker.terminate();
                if (typeof bitmap.close === 'function') bitmap.close();
                finish(null);
            }, 12000);

            worker.onmessage = (e) => {
                clearTimeout(timeout);
                worker.terminate();

                if (!e.data?.ok || !e.data.buffer) {
                    finish(null);
                    return;
                }

                const blob = new Blob([e.data.buffer], { type: e.data.type || 'image/webp' });
                const ext = (blob.type || 'image/webp').split('/')[1] || 'webp';
                const baseName = imageFile.name
                    ? imageFile.name.replace(/\.[^/.]+$/, '')
                    : 'witness_photo';

                const cleanFile = new File([blob], `${baseName}_clean.${ext}`, {
                    type: blob.type,
                    lastModified: Date.now()
                });
                finish(cleanFile);
            };

            worker.onerror = () => {
                clearTimeout(timeout);
                worker.terminate();
                if (typeof bitmap.close === 'function') bitmap.close();
                finish(null);
            };

            // Transfer the ImageBitmap (zero-copy)
            worker.postMessage(
                {
                    bitmap,
                    maxWidth: opts.maxWidth,
                    maxHeight: opts.maxHeight,
                    outputType: opts.outputType || 'image/webp',
                    quality: opts.quality ?? 0.85
                },
                [bitmap]
            );
        } catch (_) {
            if (typeof bitmap?.close === 'function') bitmap.close();
            finish(null);
        }
    });
}
