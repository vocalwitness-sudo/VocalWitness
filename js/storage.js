// js/storage.js
import { storage } from "./firebase-config.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { showToast } from "./utils.js";

export async function uploadToStorage(file, folder) {
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
        showToast("❌ File too large. Max 10MB.", "error");
        throw new Error("File exceeds size limit");
    }

    try {
        const timestamp = Date.now();
        const fileName = `${folder}/${timestamp}_${file.name || 'blob'}`;
        const storageRef = ref(storage, fileName);
        const snapshot = await uploadBytes(storageRef, file);
        return await getDownloadURL(snapshot.ref);
    } catch (error) {
        console.error("Storage Error:", error);
        showToast("❌ Media upload failed.", "error");
        throw error;
    }
}
