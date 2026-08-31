// js/createPost.js - Testimony Submission Engine with Client-Side Hashing & AI Moderation
import { 
    collection, 
    addDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { 
    ref, 
    uploadBytes, 
    getDownloadURL 
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js";

import { db, storage, auth } from './firebase-config.js';
import { showToast } from './utils.js';
import { getUserTier } from './tier.js';
import { analyzeReportContent } from './composer.js';

/**
 * Computes a SHA-256 hash of a file or text buffer using native Web Crypto API.
 * @param {Blob|File|ArrayBuffer} data 
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
 * Uploads media file to Firebase Storage under user or evidence path
 * @param {File|Blob} file 
 * @param {string} pathPrefix 
 * @returns {Promise<string>} Download URL
 */
async function uploadEvidenceMedia(file, pathPrefix = 'evidence') {
    const uid = auth.currentUser ? auth.currentUser.uid : 'anon';
    const timestamp = Date.now();
    const filename = `${pathPrefix}_${uid}_${timestamp}`;
    const storageRef = ref(storage, `${pathPrefix}/${filename}`);

    const snapshot = await uploadBytes(storageRef, file);
    return await getDownloadURL(snapshot.ref);
}

/**
 * Handles the complete testimony submission workflow.
 * @param {Object} params
 * @param {string} params.content - Text content of the testimony
 * @param {string} params.channel - 'citizen-talk' | 'witness-voice'
 * @param {File|Blob|null} params.mediaFile - Attached image or recorded audio blob
 * @param {boolean} params.isAnonymous - Whether user hides public identity
 * @param {boolean} params.isZkVerified - Optional ZK proof indicator
 * @returns {Promise<string>} Created Firestore document ID
 */
export async function submitTestimony({
    content = '',
    channel = 'citizen-talk',
    mediaFile = null,
    isAnonymous = false,
    isZkVerified = false
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
                // If content triggers severe flags or policy violations
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
            // Re-throw if explicitly blocked above, otherwise warn and allow pipeline to continue
            if (err.message.includes("blocked by AI moderation")) {
                throw err;
            }
            console.warn("AI moderation check failed or skipped:", err);
        }
    }

    showToast("Processing cryptographic seal...", "info");

    let forensicHash = null;
    let mediaUrl = null;
    let mediaType = null;

    // 1. Process Media & Forensic Hashing
    if (mediaFile) {
        forensicHash = await computeSHA256(mediaFile);
        mediaType = mediaFile.type.startsWith('audio/') ? 'audio' : 'image';
        
        showToast("Uploading evidence artifact...", "info");
        mediaUrl = await uploadEvidenceMedia(mediaFile, mediaType);
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

    // 3. Assemble Firestore Payload (Enriched with Moderation Data)
    const payload = {
        content: content.trim(),
        channel: channel,
        feedVisibility: moderationResult.status === 'pending_review' ? 'review_queue' : channel,
        authorId: user ? user.uid : null,
        author: isAnonymous ? "Anonymous Witness" : (user?.displayName || "Citizen Witness"),
        authorTier: authorTier,
        reputation: reputation,
        isAnonymous: isAnonymous,
        forensicHash: forensicHash,
        zkVerified: isZkVerified,
        imageUrl: mediaType === 'image' ? mediaUrl : null,
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
