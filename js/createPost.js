// js/createPost.js - Single secure testimony submission (Cloud Function only)
import { getFunctions, httpsCallable } from
  "https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js";
import { auth } from './firebase-config.js';
import { showToast } from './utils.js';
import { analyzeReportContent } from './moderation.js';
import { processAndUploadMedia } from './media-pipeline.js';
import { parsePostMetadata } from './utils/parser.js';
import { createEvidencePack } from './evidence-pack.js';

/**
 * SHA-256 of file / text (Web Crypto)
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
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function normalizeChannel(channel) {
  const allowed = [
    'citizen-talk', 'witness-voice',
    'citizen-circle', 'witness-circle',
    'citizen_talk', 'witness_voice',
  ];
  if (!allowed.includes(channel)) return 'citizen-talk';
  if (channel === 'citizen_talk') return 'citizen-talk';
  if (channel === 'witness_voice') return 'witness-voice';
  return channel;
}

/**
 * Canonical publish entry — ALWAYS goes through submitTestimonySecure.
 *
 * @param {Object} params
 * @param {string} params.content
 * @param {string} [params.channel]
 * @param {File|Blob|null} [params.mediaFile] - single file (legacy)
 * @param {File|Blob|null} [params.imageFile]
 * @param {File|Blob|null} [params.videoFile]
 * @param {File|Blob|null} [params.audioFile]
 * @param {boolean} [params.isAnonymous]
 * @param {Function} [params.onProgress]
 * @param {string} [params.postingStyle] - 'citizen' | 'field-note'
 * @param {string|null} [params.fieldNoteRole]
 * @param {string|null} [params.fieldNoteOrg]
 * @returns {Promise<string>} document id
 */
export async function submitTestimony({
  content = '',
  channel = 'citizen-talk',
  mediaFile = null,
  imageFile = null,
  videoFile = null,
  audioFile = null,
  isAnonymous = false,
  onProgress = null,
  postingStyle = 'citizen',
  fieldNoteRole = null,
  fieldNoteOrg = null,
}) {
  const user = auth.currentUser;
  if (!user) {
    showToast("Please log in to submit a testimony.", "error");
    throw new Error("Unauthorized submission attempt.");
  }

  // Resolve media (legacy single file → typed slots)
  if (mediaFile && !imageFile && !videoFile && !audioFile) {
    const mime = (mediaFile.type || '').toLowerCase();
    if (mime.startsWith('image/')) imageFile = mediaFile;
    else if (mime.startsWith('video/')) videoFile = mediaFile;
    else if (mime.startsWith('audio/')) audioFile = mediaFile;
    else imageFile = mediaFile;
  }

  const hasMedia = !!(imageFile || videoFile || audioFile);
  if (!content.trim() && !hasMedia) {
    showToast("Testimony must contain text or evidence media.", "error");
    throw new Error("Empty testimony payload.");
  }

  channel = normalizeChannel(channel);

  // AI pre-check (non-fatal if service down)
  let moderationResult = {
    flagged: false,
    category: 'general',
    status: 'approved',
    flags: [],
  };
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
          flags: aiCheck.flags || [],
        };
      }
    } catch (err) {
      if (err.message?.includes("blocked by AI moderation")) throw err;
      console.warn("AI moderation check failed or skipped:", err);
    }
  }

  showToast("Processing cryptographic seal...", "info");

  const folder =
    channel === 'witness-voice' || channel === 'witness-circle'
      ? 'witness-vault'
      : 'evidence';

  let imageUrl = null, videoUrl = null, audioUrl = null;
  let imageHash = null, videoHash = null, audioHash = null;

  const reportProgress = (p) => {
    if (typeof onProgress === 'function') onProgress(p);
  };

  if (imageFile) {
    showToast("🛡️ Sealing image...", "info");
    const up = await processAndUploadMedia(imageFile, folder, reportProgress);
    imageUrl = typeof up === 'string' ? up : up?.publicUrl;
    imageHash = typeof up === 'object' ? up?.hash : await computeSHA256(imageFile);
    if (!imageUrl || !imageHash) throw new Error("Image upload or hash failed.");
  }
  if (videoFile) {
    showToast("🛡️ Sealing video...", "info");
    const up = await processAndUploadMedia(videoFile, folder, reportProgress);
    videoUrl = typeof up === 'string' ? up : up?.publicUrl;
    videoHash = typeof up === 'object' ? up?.hash : await computeSHA256(videoFile);
    if (!videoUrl || !videoHash) throw new Error("Video upload or hash failed.");
  }
  if (audioFile) {
    showToast("🛡️ Sealing audio...", "info");
    const up = await processAndUploadMedia(audioFile, folder, reportProgress);
    audioUrl = typeof up === 'string' ? up : up?.publicUrl;
    audioHash = typeof up === 'object' ? up?.hash : await computeSHA256(audioFile);
    if (!audioUrl || !audioHash) throw new Error("Audio upload or hash failed.");
  }

  const bodyHash = content.trim()
    ? await computeSHA256(content.trim())
    : null;

  const forensicHash =
    imageHash || videoHash || audioHash || bodyHash || null;

  const { hashtags, mentions, cleanedContent } = parsePostMetadata(content);

  let firestorePack = null;
  let packCoreHash = null;
  try {
    const packResult = await createEvidencePack({
      content: cleanedContent || '',
      bodyHash: bodyHash || forensicHash,
      media: {
        imageUrl,
        imageHash,
        videoUrl,
        videoHash,
        audioUrl,
        audioHash,
      },
      identity: {
        mode: isAnonymous ? 'ANONYMOUS' : 'IDENTIFIED',
        // Server still binds authorId to auth.uid; UI anonymity is display-only
        authorId: user.uid,
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

  showToast("Sealing on server...", "info");

  const functions = getFunctions();
  const submitSecure = httpsCallable(functions, "submitTestimonySecure");

  const result = await submitSecure({
    content: cleanedContent || '',
    channel,
    isAnonymous: !!isAnonymous,
    authorDisplayName: isAnonymous ? null : (user.displayName || null),
    forensicHash,
    imageUrl,
    videoUrl,
    audioUrl,
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
