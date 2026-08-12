// js/storage.js - Advanced Reactive Global State & R2 Media Handling
import { getTier, calculateTrustScore } from './utils.js';
import { db, auth } from './firebase-config.js';   // Correct relative path

// Configuration for Cloudflare R2 proxy worker / custom domain endpoint
const R2_PUBLIC_BASE_URL = "https://media.vocalwitness.com";
const R2_UPLOAD_ENDPOINT = "https://media.vocalwitness.com/upload";

// Active Global Reactive State
export const state = {
    user: null,
    isWitnessVerified: false,
    tier: 'citizen',
    tierInfo: null,
    language: 'en',
    trustScore: 50,
    postCount: 0,
    isOnline: true
};

// Reactive Update Helper
export function updateState(newData) {
    Object.assign(state, newData);
    
    // Broadcast change to all modules
    window.dispatchEvent(new CustomEvent('state-changed', {
        detail: { state }
    }));
}

// Main User Update Function (called from auth.js)
export function updateUser(user) {
    if (!user) {
        updateState({
            user: null,
            isWitnessVerified: false,
            tier: 'citizen',
            tierInfo: null,
            trustScore: 50
        });
        return;
    }

    const trustScore = user.trustCircle || calculateTrustScore(user);
    const tierInfo = getTier(trustScore);

    updateState({
        user: user,
        isWitnessVerified: user.role === 'witness' || user.role === 'trusted_witness' || !!user.isPhoneVerified,
        tier: tierInfo.name.toLowerCase(),
        tierInfo: tierInfo,
        trustScore: trustScore,
        language: user.preferredLanguage || 'en'
    });

    console.log(`👤 User updated → ${tierInfo.name} Tier (${trustScore} trust)`);
}

// Increment post count after successful post
export function incrementPostCount() {
    state.postCount = (state.postCount || 0) + 1;
    updateState({ postCount: state.postCount });
}

// Update trust score (called after verification, votes, etc.)
export function updateTrustScore(newScore) {
    updateState({
        trustScore: Math.max(0, Math.min(100, newScore))
    });
}

// Persist state to localStorage (optional backup)
export function saveStateToLocal() {
    try {
        localStorage.setItem('vocalwitness_state', JSON.stringify({
            language: state.language,
            postCount: state.postCount
        }));
    } catch (e) {
        console.warn("Failed to save state locally");
    }
}

export function loadStateFromLocal() {
    try {
        const saved = localStorage.getItem('vocalwitness_state');
        if (saved) {
            const data = JSON.parse(saved);
            updateState({
                language: data.language || 'en',
                postCount: data.postCount || 0
            });
        }
    } catch (e) {
        console.warn("Failed to load saved state");
    }
}

// Listen for online/offline status
export function initNetworkListener() {
    window.addEventListener('online', () => updateState({ isOnline: true }));
    window.addEventListener('offline', () => updateState({ isOnline: false }));
}

// Initialize storage module
export function initStorage() {
    loadStateFromLocal();
    initNetworkListener();
    console.log("📦 Global State Initialized");
}

/**
 * Uploads media blobs (images/audio) to Cloudflare R2 storage bucket.
 * 
 * @param {Blob|File} fileBlob - Clean, scrubbed, compressed media file payload.
 * @param {string} fileName - Original file name for extension extraction.
 * @param {string} folder - Destination subfolder (e.g. 'posts', 'avatars', 'testimonies').
 * @returns {Promise<string>} The canonical HTTPS Cloudflare R2 public CDN URL.
 */
export async function uploadToR2(fileBlob, fileName = "media.webp", folder = "posts") {
    if (!auth.currentUser) {
        throw new Error("Authentication required for media uploads.");
    }

    const token = await auth.currentUser.getIdToken();
    const fileExt = fileName.split('.').pop() || 'webp';
    const timestamp = Date.now();
    const uniqueKey = `${folder}/${auth.currentUser.uid}_${timestamp}.${fileExt}`;

    const response = await fetch(`${R2_UPLOAD_ENDPOINT}/${uniqueKey}`, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': fileBlob.type || 'application/octet-stream'
        },
        body: fileBlob
    });

    if (!response.ok) {
        const errText = await response.text().catch(() => 'Upload failed');
        throw new Error(`Cloudflare R2 Upload Failed [${response.status}]: ${errText}`);
    }

    // Return direct, secure CDN URL matching Firestore Security Rules pattern
    return `${R2_PUBLIC_BASE_URL}/${uniqueKey}`;
}

/**
 * Helper to request media removal from Cloudflare R2.
 * 
 * @param {string} mediaUrl - Canonical media URL to remove.
 * @returns {Promise<boolean>}
 */
export async function deleteFromR2(mediaUrl) {
    if (!auth.currentUser || !mediaUrl) return false;

    try {
        const token = await auth.currentUser.getIdToken();
        const objectKey = mediaUrl.replace(`${R2_PUBLIC_BASE_URL}/`, '');

        const response = await fetch(`${R2_UPLOAD_ENDPOINT}/${objectKey}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        return response.ok;
    } catch (err) {
        console.warn("Failed to delete media from R2:", err);
        return false;
    }
}
