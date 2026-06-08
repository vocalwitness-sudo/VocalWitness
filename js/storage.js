/**
 * VocalWitness Storage Module
 * Manages secure, forensic-ready media uploads to Firebase Storage
 */
import { storage } from "./firebase-config.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { showToast } from "./utils.js";

/**
 * Uploads a file with size validation and returns the download URL
 * @param {Blob|File} file - The media to upload
 * @param {string} folder - The target folder (e.g., 'posts/images' or 'posts/audio')
 */
export async function uploadToStorage(file, folder) {
    // Rule: 10MB Limit
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
        showToast("❌ File too large. Maximum size is 10MB.", "error");
        throw new Error("File exceeds size limit");
    }

    try {
        const timestamp = Date.now();
        // Structured path for forensic traceability
        const fileName = `${folder}/${timestamp}_${file.name || 'blob'}`;
        const storageRef = ref(storage, fileName);
        
        // Upload
        const snapshot = await uploadBytes(storageRef, file);
        
        // Return public URL
        return await getDownloadURL(snapshot.ref);
    } catch (error) {
        console.error("Storage Error:", error);
        showToast("❌ Media upload failed.", "error");
        throw error;
    }
}
