// js/ai-services.js - AI Cloud Functions, Client-Side Synthetic Scoring & Advisory Layer
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js";
import { app } from "./firebase-config.js";
import { logAuditEvent } from './audit.js';
import { calculateSyntheticScoreFromMetadata } from './ai-services.js';

const functions = getFunctions(app, "us-central1");

/* ==========================================================================
   1. FIREBASE CLOUD FUNCTION CALLABLES (ON-DEMAND AI SERVICES)
   ========================================================================== */

/**
 * AI Post Content Moderation via Cloud Function
 * @param {string} title 
 * @param {string} text 
 * @returns {Promise<Object>} Moderation result object
 */
export async function moderatePost(title = "", text = "") {
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
 * @param {string} text 
 * @param {string} targetLanguage - e.g., 'yo', 'ha', 'ig', 'sw', 'pcm'
 * @returns {Promise<string>} Translated text string
 */
export async function translateTestimony(text, targetLanguage) {
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
 * @param {string} audioBase64 
 * @param {string} mimeType - e.g., 'audio/wav', 'audio/webm'
 * @returns {Promise<string>} Transcribed text string
 */
export async function transcribeAudioWitness(audioBase64, mimeType = "audio/wav") {
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
   2. SYNTHETIC SCORING & AUDIT QUEUE ADVISORY LAYER (BATCH 3)
   ========================================================================== */

/**
 * High-risk score thresholds for advisory action.
 */
export const SYNTHETIC_THRESHOLDS = {
    ADVISORY_LABEL_ONLY: 45,        // 45-74: Add informational synthetic label
    STEWARD_REVIEW_TRIGGER: 75    // 75+: Queue for human steward review
};

/**
 * Calculates a synthetic likelihood score based on header markers and metadata.
 * Serves as a non-destructive client-side advisory check.
 * 
 * @param {Object} metadata 
 * @param {boolean} metadata.editorDetected - True if NLE signatures were detected
 * @param {string[]} metadata.detectedSignatures - Array of detected tools (e.g., CapCut, Sora, RunwayML)
 * @param {string} metadata.provenance - Provenance tag ('c2pa_sealed' or 'unverified')
 * @returns {{ score: number, advisory: string, requiresReview: boolean }}
 */
export function calculateSyntheticScoreFromMetadata(metadata = {}) {
    let score = 10; // Baseline neutral score for organic uploads

    const { editorDetected = false, detectedSignatures = [], provenance = 'unverified' } = metadata;

    // C2PA authenticated media reduces risk score significantly
    if (provenance === 'c2pa_sealed') {
        score -= 25;
    }

    // NLE / AI generation engine signatures
    if (editorDetected) {
        score += 30;
    }

    const aiEngineKeywords = ['Sora', 'RunwayML', 'Pika', 'Kling', 'Midjourney', 'StableDiffusion'];
    const matchesAIGenerator = detectedSignatures.some(sig => 
        aiEngineKeywords.some(kw => sig.toLowerCase().includes(kw.toLowerCase()))
    );

    if (matchesAIGenerator) {
        score += 55;
    }

    // Clamp score within 0–100 range
    const finalScore = Math.min(100, Math.max(0, score));

    const requiresReview = finalScore >= SYNTHETIC_THRESHOLDS.STEWARD_REVIEW_TRIGGER;
    let advisory = 'LOW_SYNTHETIC_PROBABILITY';

    if (requiresReview) {
        advisory = 'HIGH_SYNTHETIC_PROBABILITY';
    } else if (finalScore >= SYNTHETIC_THRESHOLDS.ADVISORY_LABEL_ONLY) {
        advisory = 'MODERATE_SYNTHETIC_PROBABILITY';
    }

    return {
        score: finalScore,
        advisory,
        requiresReview
    };
}

/**
 * Client-side hook to evaluate metadata score and trigger audit log if high risk.
 * 
 * @param {string} testimonyId 
 * @param {Object} videoMetadata 
 */
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
                provenance: videoMetadata.provenance || 'unverified'
            }
        });
    }

    return result;
}

/* ==========================================================================
   MODULE EXPORT AGGREGATOR
   ========================================================================== */

export default {
    moderatePost,
    translateTestimony,
    transcribeAudioWitness,
    calculateSyntheticScoreFromMetadata,
    evaluateClientSyntheticAdvisory,
    SYNTHETIC_THRESHOLDS
};
