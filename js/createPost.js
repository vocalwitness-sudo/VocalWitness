// js/createPost.js - Testimony Submission Engine with Client-Side Hashing & AI Moderation
import { 
    collection, 
    addDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

import { db, auth } from './firebase-config.js';
import { showToast } from './utils.js';
import { getUserTier } from './tier.js';
import { analyzeReportContent } from './composer.js';
import { processAndUploadMedia } from './media-pipeline.js';

/**
 * Computes a SHA-256 hash of a file or text buffer using native Web Crypto API.
 * @param {Blob|File|ArrayBuffer|string} data 
 * @returns {Promise<string>} Hexadecimal SHA-256 hash
 */
export async function computeSHA256(data) {
    let buffer;
    if (data instanceof ArrayBuffer) {
        buffer = data;
    } else if (data instanceof Blob || data instanceof File) {
        buffer = await data.arrayBuffer();
    } else if (typeof data === 'string') {
        buffer = new TextEncoder().encode(data);
    } else {
        throw new Error("Invalid data format for cryptographic hashing.");
    }

    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Handles the complete testimony submission workflow utilizing the unified media pipeline.
 * @param {Object} params
 * @param {string} params.content - Text content of the testimony
 * @param {string} params.channel - 'citizen-talk' | 'witness-voice'
 * @param {File|Blob|null} params.mediaFile - Attached image, video, or recorded audio file
 * @param {boolean} params.isAnonymous - Whether user hides public identity
 * @param {boolean} params.isZkVerified - Optional ZK proof indicator
 * @param {Function} [params.onProgress] - Optional progress callback (0-100)
 * @returns {Promise<string>} Created Firestore document ID
 */
export async function submitTestimony({
    content = '',
    channel = 'citizen-talk',
    mediaFile = null,
    isAnonymous = false,
    isZkVerified = false,
    onProgress = null
}) {
    const user = auth.currentUser;
    if (!user && !isAnonymous) {
        showToast("Please log in or select Anonymous Mode to submit.", "error");
        throw new Error("Unauthorized submission attempt.");
    }

    if (!content.trim() && !mediaFile) {
        showToast("Testimony must contain text content or evidence media.", "error");
        throw new Error("Empty testimony payload.");
    }

    // -------------------------------------------------------------
    // AI Content Moderation Pre-Flight Check
    // -------------------------------------------------------------
    let moderationResult = { flagged: false, category: 'general', status: 'approved', flags: [] };
    
    if (content.trim().length > 0 && typeof analyzeReportContent === 'function') {
        try {
            const aiCheck = await analyzeReportContent(content.trim());
            if (aiCheck) {
                if (aiCheck.isBlocked || aiCheck.flagged) {
                    showToast("Submission contains content that violates community standards.", "error");
                    throw new Error("Submission blocked by AI moderation rules.");
                }

                moderationResult = {
                    flagged: aiCheck.flagged || false,
                    category: aiCheck.category || 'general',
                    status: aiCheck.requiresReview ? 'pending_review' : 'approved',
                    flags: aiCheck.flags || []
                };
            }
        } catch (err) {
            if (err.message && err.message.includes("blocked by AI moderation")) {
                throw err;
            }
            console.warn("AI moderation check failed or skipped:", err);
        }
    }

    showToast("Processing cryptographic seal...", "info");

    let forensicHash = null;
    let mediaUrl = null;
    let mediaType = null; // 'image', 'video', or 'audio'

    // 1. Process Media via Unified Pipeline (Scrubbing/Normalization + R2 Upload)
    if (mediaFile) {
        // Determine primary media type bucket
        const mime = mediaFile.type || '';
        if (mime.startsWith('image/')) mediaType = 'image';
        else if (mime.startsWith('video/')) mediaType = 'video';
        else if (mime.startsWith('audio/')) mediaType = 'audio';
        else mediaType = 'evidence';

        // Compute hash of original file for cryptographic verification integrity
        forensicHash = await computeSHA256(mediaFile);

        showToast("🛡️ Preparing and uploading media artifact...", "info");

        // Route through unified pipeline: scrubs EXIF/normalizes audio, then uploads to Cloudflare R2
        const folderDestination = channel === 'witness-voice' ? 'witness-vault' : 'evidence';
        mediaUrl = await processAndUploadMedia(mediaFile, folderDestination, onProgress);

    } else if (content.length > 0) {
        // Compute text integrity hash if no media is attached
        forensicHash = await computeSHA256(content);
    }

    // 2. Resolve User Tier & Reputation
    let authorTier = 'citizen';
    let reputation = 0;

    if (user) {
        try {
            const tierData = await getUserTier(user.uid);
            authorTier = tierData.tier || 'citizen';
            reputation = tierData.reputation || 0;
        } catch (err) {
            console.warn("Could not fetch tier, defaulting to citizen:", err);
        }
    }

    // 3. Assemble Firestore Payload
    const payload = {
        content: content.trim(),
        channel: channel,
        feedVisibility: moderationResult.status === 'pending_review' ? 'review_queue' : channel,
        authorId: isAnonymous ? null : (user ? user.uid : null),
        author: isAnonymous ? "Anonymous Witness" : (user?.displayName || "Citizen Witness"),
        authorTier: authorTier,
        reputation: reputation,
        isAnonymous: isAnonymous,
        forensicHash: forensicHash,
        zkVerified: isZkVerified,
        imageUrl: mediaType === 'image' ? mediaUrl : null,
        videoUrl: mediaType === 'video' ? mediaUrl : null,
        audioUrl: mediaType === 'audio' ? mediaUrl : null,
        reactions: { respect: 0, truth: 0, concern: 0, impact: 0 },
        commentsCount: 0,
        isPinned: false,
        isDeleted: false,

        // Moderation fields
        moderationStatus: moderationResult.status,
        moderationFlags: moderationResult.flags,
        aiCategory: moderationResult.category,

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    };

    // 4. Commit to Firestore
    const docRef = await addDoc(collection(db, "testimonies"), payload);
    
    if (moderationResult.status === 'pending_review') {
        showToast("⚠️ Testimony submitted and queued for community review.", "warning");
    } else {
        showToast("🛡️ Testimony cryptographically sealed and published!", "success");
    }

    return docRef.id;
}
