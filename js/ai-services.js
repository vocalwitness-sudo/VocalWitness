// js/ai-services.js
// VocalWitness AI Advisory Layer
// Principle: AI assists humans. It never replaces human judgment or violates privacy.

import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js";
import { app } from "./firebase-config.js";
import { logAuditEvent } from './audit.js';

const functions = getFunctions(app, "us-central1");

/* ==========================================================================
   0. AI PRINCIPLES & USER-FACING DISCLAIMERS (ALWAYS SURFACE THESE)
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
  // You can wire this to a toast, modal, or inline notice
  console.info("[AI Notice]", AI_USER_NOTICE.short);
  // Example: showToast?.(AI_USER_NOTICE.short, "info");
  return AI_USER_NOTICE;
}

/* ==========================================================================
   1. EXISTING CLOUD FUNCTION CALLABLES (kept & clarified)
   ========================================================================== */

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

/* ==========================================================================
   2. SYNTHETIC / DEEPFAKE RISK SCORING (Client-side advisory)
   ========================================================================== */

export const SYNTHETIC_THRESHOLDS = {
  ADVISORY_LABEL_ONLY: 45,      // Show informational label
  STEWARD_REVIEW_TRIGGER: 75    // Queue for human review
};

/**
 * Lightweight client-side synthetic risk score.
 * Never claims certainty. Only produces an advisory signal.
 */
export function calculateSyntheticScoreFromMetadata(metadata = {}) {
  let score = 10;
  const { editorDetected = false, detectedSignatures = [], provenance = 'unverified' } = metadata;

  if (provenance === 'c2pa_sealed') score -= 25;
  if (editorDetected) score += 30;

  const aiEngineKeywords = ['Sora', 'Runway', 'Pika', 'Kling', 'Midjourney', 'Stable Diffusion', 'DALL·E', 'Gen-3'];
  const matchesAIGenerator = detectedSignatures.some(sig =>
    aiEngineKeywords.some(kw => sig.toLowerCase().includes(kw.toLowerCase()))
  );
  if (matchesAIGenerator) score += 55;

  const finalScore = Math.min(100, Math.max(0, score));
  const requiresReview = finalScore >= SYNTHETIC_THRESHOLDS.STEWARD_REVIEW_TRIGGER;

  let advisory = 'LOW_SYNTHETIC_PROBABILITY';
  if (requiresReview) advisory = 'HIGH_SYNTHETIC_PROBABILITY';
  else if (finalScore >= SYNTHETIC_THRESHOLDS.ADVISORY_LABEL_ONLY) advisory = 'MODERATE_SYNTHETIC_PROBABILITY';

  return { score: finalScore, advisory, requiresReview };
}

export async function evaluateClientSyntheticAdvisory(testimonyId, videoMetadata) {
  const result = calculateSyntheticScoreFromMetadata(videoMetadata);

  if (result.requiresReview && testimonyId) {
    await logAuditEvent({
      testimonyId,
      eventType: 'CLIENT_HIGH_SYNTHETIC_FLAG',
      syntheticScore: result.score,
      actionTaken: 'pending_steward_review',
      details: {
        signatures: videoMetadata.detectedSignatures || [],
        provenance: videoMetadata.provenance || 'unverified',
        note: 'Advisory only – no automatic action taken'
      }
    });
  }
  return result;
}

/* ==========================================================================
   3. NEW HIGH-VALUE AI CAPABILITIES (sketched)
   ========================================================================== */

/**
 * Stronger synthetic / deepfake detection (Cloud Function)
 * Returns advisory score + explanation. Never auto-hides content.
 */
export async function detectSyntheticMedia({ mediaUrl, mediaHash, mimeType }) {
  remindUserOfAIRestrictions("synthetic-detection");
  try {
    const detectFn = httpsCallable(functions, "detectSyntheticMedia");
    const result = await detectFn({ mediaUrl, mediaHash, mimeType });
    // Expected shape: { score, confidence, labels, explanation, requiresHumanReview }
    return result.data;
  } catch (error) {
    console.error("Synthetic detection error:", error);
    throw error;
  }
}

/**
 * Consistency check: does the text roughly match the audio transcript / image description?
 * Advisory only.
 */
export async function checkContentConsistency({ text, transcript, imageCaption }) {
  remindUserOfAIRestrictions("consistency-check");
  try {
    const checkFn = httpsCallable(functions, "checkContentConsistency");
    const result = await checkFn({ text, transcript, imageCaption });
    return result.data; // { consistent: boolean, score, notes }
  } catch (error) {
    console.error("Consistency check error:", error);
    throw error;
  }
}

/**
 * Corroboration helper – finds similar reports (time / rough location / keywords)
 * Helps humans, does not decide truth.
 */
export async function suggestCorroborations({ testimonyId, text, timestamp, roughGeoHash }) {
  remindUserOfAIRestrictions("corroboration");
  try {
    const suggestFn = httpsCallable(functions, "suggestCorroborations");
    const result = await suggestFn({ testimonyId, text, timestamp, roughGeoHash });
    return result.data; // array of related report summaries
  } catch (error) {
    console.error("Corroboration suggestion error:", error);
    throw error;
  }
}

/**
 * Toxicity / harassment signal for comments & replies only
 * (Never applied to sealed primary reports)
 */
export async function scoreToxicity(text) {
  remindUserOfAIRestrictions("toxicity");
  try {
    const toxicityFn = httpsCallable(functions, "scoreToxicity");
    const result = await toxicityFn({ text });
    return result.data; // { score, labels }
  } catch (error) {
    console.error("Toxicity scoring error:", error);
    throw error;
  }
}

/* ==========================================================================
   4. SECURITY & PRIVACY GUARDRAILS
   ========================================================================== */

/**
 * Hard rules that must never be violated
 */
export const AI_SECURITY_RULES = {
  // Never send raw private user data beyond what is required for the task
  noPersistentPrivateStorage: true,
  // Never use AI output to mutate sealed ledger entries
  noMutationOfSealedRecords: true,
  // Always log high-impact AI decisions
  mandatoryAuditLogging: true,
  // Prefer on-device or minimal-data approaches when possible
  preferDataMinimization: true
};

/**
 * Safe wrapper – call this before any AI function that touches media or text
 */
export function enforceAISecurityContext(context = {}) {
  if (context.isSealedRecord) {
    console.warn("[AI Security] This is a sealed record. AI may only add advisory labels.");
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
  // Principles
  AI_PRINCIPLES,
  AI_USER_NOTICE,
  remindUserOfAIRestrictions,
  AI_SECURITY_RULES,
  enforceAISecurityContext,

  // Existing
  moderatePost,
  translateTestimony,
  transcribeAudioWitness,
  calculateSyntheticScoreFromMetadata,
  evaluateClientSyntheticAdvisory,
  SYNTHETIC_THRESHOLDS,

  // New
  detectSyntheticMedia,
  checkContentConsistency,
  suggestCorroborations,
  scoreToxicity
};
