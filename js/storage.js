// js/storage.js
import { storage } from "./firebase-config.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js";
import { showToast } from "./utils.js";

// This is the SINGLE top-level export
export const state = {
    user: null,
    isWitnessVerified: false
};

// Storage functions
export async function uploadToStorage(file, folder) {
    // ... your storage logic
}
