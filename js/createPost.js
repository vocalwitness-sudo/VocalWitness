// js/createPost.js - Single secure testimony submission (Cloud Function only)
// Unified seal path: one hash function + processed-media hash only

import { getFunctions, httpsCallable } from
  "https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js";
import { auth } from './firebase-config.js';
import { showToast, computeSHA256 } from './utils.js';
import { analyzeReportContent } from './moderation.js';
import { processAndUploadMedia } from './media-pipeline.js';
import { parsePostMetadata } from './utils/parser.js';
import { createEvidencePack } from './evidence-pack.js';

async function isPhoneCircleUser() {
  const user = auth.currentUser;
  if (!user) return false;
  try {
    const token = await user.getIdTokenResult();
    const t = token.claims || {};
    if (t.phone_verified === true) return true;
    if (t.tier === 'citizen_circle' || t.tier === 'witness_circle') return true;
  } catch (_) {}
  // fallback: provider
  return user.providerData?.some((p) => p.providerId === 'phone') === true;
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
 * Hash is always of the processed bytes that were actually uploaded.
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

  // ===== SOFT PHONE VERIFICATION GATE =====
  const phoneOk = await isPhoneCircleUser();
  if (!phoneOk && !window.__vwSkipPhoneNudge) {
    const goVerify = window.confirm(
      'Verify your phone to unlock Citizen Circle (anti-spam + Circle badge on the Square).\n\nOK = verify now\nCancel = publish without Circle'
    );
    if (goVerify) {
      try {
        const { startPhoneVerification } = await import('./phoneVerification.js');
        startPhoneVerification();
      } catch (_) {
        if (typeof window.startPhoneVerification === 'function') {
          window.startPhoneVerification();
        }
      }
      throw new Error('Complete phone verification, then publish again.');
    }
    // Allow publishing without Circle for this session if canceled
    window.__vwSkipPhoneNudge = true;
  }

  // Resolve legacy single file → typed slots
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

  // ===== UNIFIED MEDIA SEAL =====
  if (imageFile) {
    showToast("🛡️ Sealing image...", "info");
    const up = await processAndUploadMedia(imageFile, folder, reportProgress);
    imageUrl = up?.publicUrl;
    imageHash = up?.hash;
    if (!imageUrl || !imageHash) {
      throw new Error("Image upload or hash failed. Seal aborted.");
    }
  }

  if (videoFile) {
    showToast("🛡️ Sealing video...", "info");
    const up = await processAndUploadMedia(videoFile, folder, reportProgress);
    videoUrl = up?.publicUrl;
    videoHash = up?.hash;
    if (!videoUrl || !videoHash) {
      throw new Error("Video upload or hash failed. Seal aborted.");
    }
  }

  if (audioFile) {
    showToast("🛡️ Sealing audio...", "info");
    const up = await processAndUploadMedia(audioFile, folder, reportProgress);
    audioUrl = up?.publicUrl;
    audioHash = up?.hash;
    if (!audioUrl || !audioHash) {
      throw new Error("Audio upload or hash failed. Seal aborted.");
    }
  }

  const bodyHash = content.trim()
    ? await computeSHA256(content.trim())
    : null;

  if (content.trim() && !bodyHash) {
    throw new Error("Body hash failed. Seal aborted.");
  }

  const forensicHash = imageHash || videoHash || audioHash || bodyHash || null;

  const { hashtags, mentions, cleanedContent } = parsePostMetadata(content);

  // ===== EVIDENCE PACK (required for integrity) =====
  let firestorePack = null;
  let packCoreHash = null;
  let fullPack = null;

  try {
    const packResult = await createEvidencePack({
      content: cleanedContent || '',
      bodyHash: bodyHash || null,
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
        authorId: user.uid,
        displayName: isAnonymous ? null : (user.displayName || null),
      },
      channel,
      forensicHash,
      testimonyId: null,
    });
    firestorePack = packResult.firestorePack;
    packCoreHash = packResult.packCoreHash;
    fullPack = packResult.fullPack;
  } catch (packErr) {
    console.error("Evidence pack generation failed:", packErr);
    showToast("Could not build Evidence Pack. Please try again.", "error");
    throw new Error("Evidence Pack required for sealed testimony.");
  }

  showToast("Sealing on server...", "info");

  const functions = getFunctions();
  const submitSecure = httpsCallable(functions, "submitTestimonySecure");

  // Determine phone verification status to pass to server
  const token = await user.getIdTokenResult().catch(() => ({ claims: {} }));
  const claims = token.claims || {};
  const authorPhoneVerified = phoneOk;

  const result = await submitSecure({
    content: cleanedContent || '',
    channel,
    isAnonymous: !!isAnonymous,
    authorDisplayName: isAnonymous ? null : (user.displayName || null),
    authorPhoneVerified,
    forensicHash,
    imageUrl,
    videoUrl,
    audioUrl,
    imageHash,
    videoHash,
    audioHash,
    bodyHash,
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

  // Attach real ID to the full pack for download
  if (fullPack) {
    fullPack.packId = id;
    fullPack.verifyUrl =
      fullPack.verifyUrl ||
      `https://vocalwitness.com/verify.html?id=${id}&h=${packCoreHash || forensicHash || ''}`;
  }

  if (moderationResult.status === 'pending_review') {
    showToast("⚠️ Testimony submitted (server sealed – pending review).", "warning");
  } else {
    showToast("🛡️ Testimony cryptographically sealed and published!", "success");
  }

  return {
    id,
    fullPack,
    packCoreHash,
    forensicHash,
    channel,
  };
}
