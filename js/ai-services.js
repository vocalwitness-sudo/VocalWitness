// js/ai-services.js
// VocalWitness AI Advisory Layer
// Principle: AI assists humans. It never decides truth, never auto-deletes,
// and never alters sealed reports.

import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js";
import { app } from "./firebase-config.js";
import { logAuditEvent } from './audit.js';

const functions = getFunctions(app, "us-central1");

/* ==========================================================================
   0. AI PRINCIPLES & USER-FACING DISCLAIMERS
   ========================================================================== */

export const AI_PRINCIPLES = {
  role: "advisory-only",
  neverAutoDeletes: true,
  neverAltersSealedRecords: true,
  dataMinimization: true,
  humanFinalAuthority: true,
  transparencyRequired: true
};

export const AI_USER_NOTICE = {
  short: "AI is helping humans review content. It does not decide truth and never changes sealed reports.",
  full: `VocalWitness uses limited AI tools to help with translation, transcription, and risk signals for synthetic media. 
These tools are advisory only. They do not decide what is true, do not automatically hide or delete sealed reports, 
and are designed with privacy and data minimization in mind. Final judgment always stays with people.`
};

/**
 * Call this before any AI action that touches user content.
 * Shows a clear reminder to the user.
 */
export function remindUserOfAIRestrictions(context = "general") {
  console.info("[AI Notice]", AI_USER_NOTICE.short);
  // Optional: showToast?.(AI_USER_NOTICE.short, "info");
  return AI_USER_NOTICE;
}

/* ==========================================================================
   1. EXISTING CLOUD FUNCTION CALLABLES
   ========================================================================== */

/**
 * AI Post Content Moderation
 */
export async function moderatePost(title = "", text = "") {
  remindUserOfAIRestrictions("moderation");
  try {
    const moderateFn = httpsCallable(functions, "moderatePostContent");
    const result = await moderateFn({ title, text });
    return result.data;
  } catch (error) {
    console.error("AI Moderation Error:", error);
    throw error;
  }
}

/**
 * On-Demand Feed Translation
 */
export async function translateTestimony(text, targetLanguage) {
  remindUserOfAIRestrictions("translation");
  try {
    const translateFn = httpsCallable(functions, "translateTestimony");
    const result = await translateFn({ text, targetLanguage });
    return result.data.translatedText;
  } catch (error) {
    console.error("AI Translation Error:", error);
    throw error;
  }
}

/**
 * Audio-to-Text Witness Transcriptions
 */
export async function transcribeAudioWitness(audioBase64, mimeType = "audio/wav") {
  remindUserOfAIRestrictions("transcription");
  try {
    const transcribeFn = httpsCallable(functions, "transcribeAudioWitness");
    const result = await transcribeFn({ audioBase64, mimeType });
    return result.data.transcription;
  } catch (error) {
    console.error("AI Transcription Error:", error);
    throw error;
  }
}

/**
 * Compact Report Summarization (optional helper)
 */
export async function summarizeReport(text) {
  remindUserOfAIRestrictions("summarization");
  try {
    const summarizeFn = httpsCallable(functions, "summarizeReport");
    const result = await summarizeFn({ text });
    return result.data.summary;
  } catch (error) {
    console.error("AI Summarization Error:", error);
    throw error;
  }
}

/* ==========================================================================
   2. CLIENT-SIDE SYNTHETIC SCORING (Lightweight Advisory)
   ========================================================================== */

export const SYNTHETIC_THRESHOLDS = {
  ADVISORY_LABEL_ONLY: 45,
  STEWARD_REVIEW_TRIGGER: 75
};

/**
 * Calculates a synthetic likelihood score from metadata (client-side).
 * Non-destructive advisory check only.
 */
export function calculateSyntheticScoreFromMetadata(metadata = {}) {
  let score = 10; // baseline for organic uploads

  const {
    editorDetected = false,
    detectedSignatures = [],
    provenance = "unverified"
  } = metadata;

  if (provenance === "c2pa_sealed") {
    score -= 25;
  }

  if (editorDetected) {
    score += 30;
  }

  const aiEngineKeywords = [
    "Sora", "Runway", "Pika", "Kling", "Midjourney",
    "Stable Diffusion", "DALL·E", "Gen-3", "Luma", "Haiper"
  ];

  const matchesAIGenerator = detectedSignatures.some(sig =>
    aiEngineKeywords.some(kw => String(sig).toLowerCase().includes(kw.toLowerCase()))
  );

  if (matchesAIGenerator) {
    score += 55;
  }

  const finalScore = Math.min(100, Math.max(0, score));
  const requiresReview = finalScore >= SYNTHETIC_THRESHOLDS.STEWARD_REVIEW_TRIGGER;

  let advisory = "LOW_SYNTHETIC_PROBABILITY";
  if (requiresReview) {
    advisory = "HIGH_SYNTHETIC_PROBABILITY";
  } else if (finalScore >= SYNTHETIC_THRESHOLDS.ADVISORY_LABEL_ONLY) {
    advisory = "MODERATE_SYNTHETIC_PROBABILITY";
  }

  return {
    score: finalScore,
    advisory,
    requiresReview
  };
}

/**
 * Evaluates metadata and logs high-risk cases for steward review.
 */
export async function evaluateClientSyntheticAdvisory(testimonyId, videoMetadata) {
  const result = calculateSyntheticScoreFromMetadata(videoMetadata);

  if (result.requiresReview && testimonyId) {
    await logAuditEvent({
      testimonyId,
      eventType: "CLIENT_HIGH_SYNTHETIC_FLAG",
      syntheticScore: result.score,
      actionTaken: "pending_steward_review",
      details: {
        signatures: videoMetadata.detectedSignatures || [],
        provenance: videoMetadata.provenance || "unverified",
        note: "Advisory only – no automatic action taken"
      }
    });
  }

  return result;
}

/* ==========================================================================
   3. NEW HIGH-VALUE AI CAPABILITIES
   ========================================================================== */

/**
 * Stronger on-demand synthetic / deepfake detection
 */
export async function detectSyntheticMedia({
  mediaUrl,
  mediaHash,
  mimeType,
  title = "",
  content = ""
}) {
  remindUserOfAIRestrictions("synthetic-detection");
  try {
    const detectFn = httpsCallable(functions, "detectSyntheticMedia");
    const result = await detectFn({ mediaUrl, mediaHash, mimeType, title, content });
    return result.data;
  } catch (error) {
    console.error("detectSyntheticMedia error:", error);
    throw error;
  }
}

/**
 * Consistency check: text vs transcript vs image caption
 */
export async function checkContentConsistency({
  text,
  transcript = "",
  imageCaption = ""
}) {
  remindUserOfAIRestrictions("consistency-check");
  try {
    const checkFn = httpsCallable(functions, "checkContentConsistency");
    const result = await checkFn({ text, transcript, imageCaption });
    return result.data;
  } catch (error) {
    console.error("checkContentConsistency error:", error);
    throw error;
  }
}

/**
 * Suggest related / corroborating reports (advisory helper)
 */
export async function suggestCorroborations({
  testimonyId,
  text = "",
  timestamp = null
}) {
  remindUserOfAIRestrictions("corroboration");
  try {
    const suggestFn = httpsCallable(functions, "suggestCorroborations");
    const result = await suggestFn({ testimonyId, text, timestamp });
    return result.data;
  } catch (error) {
    console.error("suggestCorroborations error:", error);
    throw error;
  }
}

/**
 * Toxicity scoring for comments & replies only
 */
export async function scoreToxicity(text) {
  remindUserOfAIRestrictions("toxicity");
  try {
    const toxicityFn = httpsCallable(functions, "scoreToxicity");
    const result = await toxicityFn({ text });
    return result.data;
  } catch (error) {
    console.error("scoreToxicity error:", error);
    throw error;
  }
}

/* ==========================================================================
   4. SECURITY GUARDRAILS
   ========================================================================== */

export const AI_SECURITY_RULES = {
  noPersistentPrivateStorage: true,
  noMutationOfSealedRecords: true,
  mandatoryAuditLogging: true,
  preferDataMinimization: true
};

/**
 * Lightweight security context check before AI calls
 */
export function enforceAISecurityContext(context = {}) {
  if (context.isSealedRecord) {
    console.warn("[AI Security] Sealed record – AI may only add advisory labels.");
  }
  if (context.containsPrivateData) {
    console.warn("[AI Security] Private data detected – ensure minimal transmission.");
  }
  return true;
}

/* ==========================================================================
   MODULE EXPORT
   ========================================================================== */

export default {
  // Principles & notices
  AI_PRINCIPLES,
  AI_USER_NOTICE,
  remindUserOfAIRestrictions,
  AI_SECURITY_RULES,
  enforceAISecurityContext,

  // Existing services
  moderatePost,
  translateTestimony,
  transcribeAudioWitness,
  summarizeReport,

  // Client-side synthetic scoring
  calculateSyntheticScoreFromMetadata,
  evaluateClientSyntheticAdvisory,
  SYNTHETIC_THRESHOLDS,

  // New capabilities
  detectSyntheticMedia,
  checkContentConsistency,
  suggestCorroborations,
  scoreToxicity
};
