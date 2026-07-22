// js/media-compression.js

/**
 * Compresses an image file before upload while respecting aspect ratio.
 * @param {File} file - The original image file
 * @param {number} maxWidth - Maximum width in pixels (default 1200)
 * @param {number} quality - JPEG quality between 0 and 1 (default 0.80)
 * @returns {Promise<File>} - Returns a new compressed File object
 */
export async function compressImage(file, maxWidth = 1200, quality = 0.80) {
    if (!file || !file.type.startsWith('image/')) {
        return file; // Return original if not an image
    }

    // Skip compression if the image is already tiny (< 150 KB)
    if (file.size < 150 * 1024) {
        return file;
    }

    return new Promise((resolve, reject) => {
        // Use createImageBitmap when available for better memory handling & speed
        if ('createImageBitmap' in window) {
            createImageBitmap(file)
                .then((bitmap) => {
                    const compressed = processBitmap(bitmap, file.name, maxWidth, quality);
                    resolve(compressed);
                })
                .catch(() => {
                    // Fallback to Image/FileReader if createImageBitmap fails
                    fallbackCompress(file, maxWidth, quality).then(resolve).catch(reject);
                });
        } else {
            fallbackCompress(file, maxWidth, quality).then(resolve).catch(reject);
        }
    });
}

function processBitmap(bitmap, fileName, maxWidth, quality) {
    let width = bitmap.width;
    let height = bitmap.height;

    if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, width, height);

    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (!blob) {
                    reject(new Error('Canvas compression failed'));
                    return;
                }
                // Rename extension to .jpg
                const cleanName = fileName.replace(/\.[^/.]+$/, "") + ".jpg";
                
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

function fallbackCompress(file, maxWidth, quality) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;

            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
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

                        const cleanName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
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
