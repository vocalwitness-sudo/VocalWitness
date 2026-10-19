// js/createPost.js - Testimony Submission Engine with Client-Side Hashing & AI Moderation
import { getFunctions, httpsCallable } from
  "https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js";
import { db, auth } from './firebase-config.js';
import { showToast } from './utils.js';
import { analyzeReportContent } from './moderation.js';
import { processAndUploadMedia } from './media-pipeline.js';
import { parsePostMetadata } from './utils/parser.js';
import { state } from './app-state.js';
import { createEvidencePack } from './evidence-pack.js';

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
 * @param {boolean} params.isAnonymous - Whether user hides public identity (UI only)
 * @param {boolean} params.isZkVerified - Optional ZK proof indicator
 * @param {Function} [params.onProgress] - Optional progress callback (0-100)
 * @param {string} [params.postingStyle] - 'citizen' | 'field-note'
 * @param {string|null} [params.fieldNoteRole] - Role / title for Field Notes
 * @param {string|null} [params.fieldNoteOrg] - Organisation for Field Notes
 * @returns {Promise<string>} Created Firestore document ID
 */
export async function submitTestimony({
    content = '',
    channel = 'citizen-talk',
    mediaFile = null,
    isAnonymous = false,
    isZkVerified = false,
    onProgress = null,
    // ===== Field Note fields =====
    postingStyle = 'citizen',
    fieldNoteRole = null,
    fieldNoteOrg = null,
}) {
    const user = auth.currentUser;

    // Must be authenticated – rules require authorId == request.auth.uid
    if (!user) {
        showToast("Please log in to submit a testimony.", "error");
        throw new Error("Unauthorized submission attempt.");
    }

    if (!content.trim() && !mediaFile) {
        showToast("Testimony must contain text content or evidence media.", "error");
        throw new Error("Empty testimony payload.");
    }

    // Normalize channel to one of the values allowed by the rules
    const allowedChannels = [
        'citizen-talk', 'witness-voice',
        'citizen-circle', 'witness-circle',
        'citizen_talk', 'witness_voice'
    ];
    if (!allowedChannels.includes(channel)) {
        channel = 'citizen-talk';
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
        const mime = mediaFile.type || '';
        if (mime.startsWith('image/')) mediaType = 'image';
        else if (mime.startsWith('video/')) mediaType = 'video';
        else if (mime.startsWith('audio/')) mediaType = 'audio';
        else mediaType = 'evidence';

        showToast("🛡️ Preparing and uploading media artifact...", "info");

        const folderDestination = (channel === 'witness-voice' || channel === 'witness-circle') ? 'witness-vault' : 'evidence';
        
        const uploaded = await processAndUploadMedia(mediaFile, folderDestination, onProgress);

        mediaUrl = typeof uploaded === 'string' ? uploaded : (uploaded?.publicUrl || null);
        forensicHash = typeof uploaded === 'object' && uploaded?.hash ? uploaded.hash : await computeSHA256(mediaFile);

        if (!mediaUrl || !forensicHash) {
            throw new Error("Media upload or hash sealing failed.");
        }
    } else if (content.trim().length > 0) {
        forensicHash = await computeSHA256(content.trim());
    }

    // 3. Parse hashtags and mentions
    const { hashtags, mentions, cleanedContent } = parsePostMetadata(content);

    // 3.5 Evidence pack
    let firestorePack = null;
    let packCoreHash = null;
    try {
        const packResult = await createEvidencePack({
            content: cleanedContent || '',
            bodyHash: forensicHash,
            media: {
                imageUrl: mediaType === 'image' ? mediaUrl : null,
                imageHash: mediaType === 'image' ? forensicHash : null,
                videoUrl: mediaType === 'video' ? mediaUrl : null,
                videoHash: mediaType === 'video' ? forensicHash : null,
                audioUrl: mediaType === 'audio' ? mediaUrl : null,
                audioHash: mediaType === 'audio' ? forensicHash : null,
            },
            identity: {
                mode: isAnonymous ? 'ANONYMOUS' : 'IDENTIFIED',
                authorId: isAnonymous ? null : user.uid,
                displayName: isAnonymous ? null : (user.displayName || null),
            },
            channel,
            forensicHash,
            testimonyId: null,
        });
        firestorePack = packResult.firestorePack;
        packCoreHash = packResult.packCoreHash;
    } catch (packErr) {
        console.warn("Evidence pack generation issue, proceeding without pack:", packErr);
    }

    // 4–5. Secure server write (Admin SDK sets tier / moderation / counters)
    showToast("Sealing on server...", "info");

    const functions = getFunctions();
    const submitSecure = httpsCallable(functions, "submitTestimonySecure");

    const result = await submitSecure({
        content: cleanedContent || '',
        channel,
        isAnonymous: !!isAnonymous,
        authorDisplayName: isAnonymous ? null : (user.displayName || null),
        forensicHash,
        imageUrl: mediaType === 'image' ? mediaUrl : null,
        videoUrl: mediaType === 'video' ? mediaUrl : null,
        audioUrl: mediaType === 'audio' ? mediaUrl : null,
        hashtags: hashtags || [],
        mentions: mentions || [],
        postingStyle: postingStyle === 'field-note' ? 'field-note' : 'citizen',
        fieldNoteRole: postingStyle === 'field-note' ? (fieldNoteRole || null) : null,
        fieldNoteOrg: postingStyle === 'field-note' ? (fieldNoteOrg || null) : null,
        evidencePack: firestorePack,
        packCoreHash,
    });

    const id = result?.data?.id;
    if (!id) {
        throw new Error("Secure submit returned no document id.");
    }

    if (moderationResult.status === 'pending_review') {
        showToast("⚠️ Testimony submitted (server sealed).", "warning");
    } else {
        showToast("🛡️ Testimony cryptographically sealed and published!", "success");
    }

    return id;
}
