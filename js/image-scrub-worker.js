// js/image-scrub-worker.js
// Off-main-thread image resize + metadata scrub (OffscreenCanvas)
// Receives a transferable ImageBitmap + options, returns a clean Blob

self.onmessage = async function (e) {
  const { bitmap, maxWidth, maxHeight, outputType, quality } = e.data || {};

  try {
    if (!bitmap) throw new Error('No ImageBitmap received');

    let width = bitmap.width;
    let height = bitmap.height;

    if (width > maxWidth || height > maxHeight) {
      const ratio = Math.min(maxWidth / width, maxHeight / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('OffscreenCanvas 2d context unavailable');

    ctx.drawImage(bitmap, 0, 0, width, height);

    // Close the transferred bitmap as soon as possible
    if (typeof bitmap.close === 'function') {
      bitmap.close();
    }

    let blob;
    try {
      blob = await canvas.convertToBlob({
        type: outputType || 'image/webp',
        quality: quality ?? 0.85
      });
    } catch (_) {
      // Fallback to JPEG if webp fails in this browser
      blob = await canvas.convertToBlob({
        type: 'image/jpeg',
        quality: quality ?? 0.85
      });
    }

    if (!blob) throw new Error('convertToBlob returned empty');

    const buffer = await blob.arrayBuffer();
    self.postMessage(
      {
        ok: true,
        buffer,
        type: blob.type,
        size: blob.size
      },
      [buffer]
    );
  } catch (err) {
    self.postMessage({
      ok: false,
      error: err?.message || String(err)
    });
  }
};
