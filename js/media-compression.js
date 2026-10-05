// js/media-compression.js
// Mobile-hardened version

/**
 * Compresses an image file before upload while respecting aspect ratio.
 * @param {File} file - The original image file
 * @param {Object|number} optionsOrMaxWidth
 * @param {number} [quality]
 * @returns {Promise<File>}
 */
export async function compressImage(file, optionsOrMaxWidth = 1200, quality = 0.80) {
    // Support both old signature (maxWidth, quality) and new options object
    let maxWidth = 1200;
    let maxHeight = 1600;
    let q = 0.80;

    if (typeof optionsOrMaxWidth === 'object' && optionsOrMaxWidth !== null) {
        maxWidth = optionsOrMaxWidth.maxWidth || 1600;
        maxHeight = optionsOrMaxWidth.maxHeight || 1600;
        q = optionsOrMaxWidth.quality || 0.82;
    } else {
        maxWidth = optionsOrMaxWidth || 1200;
        q = quality || 0.80;
    }

    if (!file) return file;

    // ===== MOBILE HARDENING =====
    const type = (file.type || '').toLowerCase();
    const isImage =
        type.startsWith('image/') ||
        type === '' ||
        type === 'application/octet-stream' ||
        /\.(jpe?g|png|webp|gif)$/i.test(file.name || '');

    if (!isImage) {
        return file;
    }

    // Skip compression if the image is already tiny (< 150 KB)
    if (file.size < 150 * 1024) {
        return file;
    }

    return new Promise((resolve, reject) => {
        if ('createImageBitmap' in window) {
            createImageBitmap(file)
                .then((bitmap) => {
                    processBitmap(bitmap, file.name, maxWidth, maxHeight, q)
                        .then(resolve)
                        .catch(reject);
                })
                .catch(() => {
                    fallbackCompress(file, maxWidth, maxHeight, q).then(resolve).catch(reject);
                });
        } else {
            fallbackCompress(file, maxWidth, maxHeight, q).then(resolve).catch(reject);
        }
    });
}

function processBitmap(bitmap, fileName, maxWidth, maxHeight, quality) {
    let width = bitmap.width;
    let height = bitmap.height;

    if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, width, height);

    if (typeof bitmap.close === 'function') {
        bitmap.close();
    }

    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (!blob) {
                    reject(new Error('Canvas compression failed'));
                    return;
                }
                const cleanName = (fileName || 'image').replace(/\.[^/.]+$/, "") + ".jpg";
                const compressedFile = new File([blob], cleanName, {
                    type: 'image/jpeg',
                    lastModified: Date.now()
                });
                resolve(compressedFile);
            },
            'image/jpeg',
            quality
        );
    });
}

function fallbackCompress(file, maxWidth, maxHeight, quality) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;

            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width > maxWidth || height > maxHeight) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob(
                    (blob) => {
                        if (!blob) {
                            reject(new Error('Canvas toBlob failed'));
                            return;
                        }

                        const cleanName = (file.name || 'image').replace(/\.[^/.]+$/, "") + ".jpg";
                        const compressedFile = new File([blob], cleanName, {
                            type: 'image/jpeg',
                            lastModified: Date.now()
                        });

                        resolve(compressedFile);
                    },
                    'image/jpeg',
                    quality
                );
            };

            img.onerror = () => reject(new Error('Failed to load image'));
        };

        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}
