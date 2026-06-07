// storage.js
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

const storage = getStorage();

/**
 * Uploads a file and returns the download URL
 * @param {Blob|File} file - The media to upload
 * @param {string} folder - The target folder (e.g., 'images' or 'audio')
 */
export async function uploadToStorage(file, folder) {
    const timestamp = Date.now();
    const fileName = `${folder}/${timestamp}_${file.name || 'blob'}`;
    const storageRef = ref(storage, fileName);
    
    // Upload the file
    await uploadBytes(storageRef, file);
    
    // Get and return the URL
    return await getDownloadURL(storageRef);
}
