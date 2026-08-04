/**
 * VocalWitness Upload Module (js/upload.js)
 * Handles client-side EXIF scrubbing and secure image uploads to Firebase Storage.
 */

import { scrubImageMetadata } from './imageScrubber.js';
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

/**
 * Scrubs and uploads a witness photo or profile image to Firebase Storage.
 * 
 * @param {File} file - The raw image file selected from an HTML <input type="file">.
 * @param {string} [folderPath='witness_evidence'] - Target folder in Storage ('avatars', 'witness_evidence', etc.).
 * @param {Function} [onProgress] - Optional callback for tracking upload percentage: (progress) => {}
 * @returns {Promise<string>} The safe public download URL of the uploaded image.
 */
export async function uploadSecurePhoto(file, folderPath = 'witness_evidence', onProgress = null) {
    if (!file || !file.type.startsWith('image/')) {
        throw new Error("Invalid input: Please select a valid image file.");
    }

    try {
        // 1. Strip EXIF/GPS metadata on client side before network transit
        const cleanBlob = await scrubImageMetadata(file, {
            maxWidth: 1920,
            maxHeight: 1080,
            outputType: 'image/webp', // WebP strips legacy EXIF and saves bandwidth
            quality: 0.85
        });

        // 2. Initialize Storage reference using a UUID (prevents original filename leaks)
        const storage = getStorage();
        const fileId = crypto.randomUUID();
        const storageRef = ref(storage, `${folderPath}/${fileId}.webp`);

        // 3. Define basic MIME metadata
        const metadata = {
            contentType: 'image/webp',
            cacheControl: 'public, max-age=31536000'
        };

        // 4. Execute upload task
        const uploadTask = uploadBytesResumable(storageRef, cleanBlob, metadata);

        return new Promise((resolve, reject) => {
            uploadTask.on(
                'state_changed',
                (snapshot) => {
                    if (onProgress && snapshot.totalBytes > 0) {
                        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                        onProgress(Math.round(progress));
                    }
                },
                (error) => {
                    console.error("[Upload] Storage upload error:", error);
                    reject(new Error("Failed to upload image to storage."));
                },
                async () => {
                    try {
                        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                        resolve(downloadURL);
                    } catch (urlErr) {
                        reject(urlErr);
                    }
                }
            );
        });

    } catch (err) {
        console.error("[Upload] Secure processing failed:", err);
        throw err;
    }
}
