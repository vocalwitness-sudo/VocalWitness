/**
 * functions/callable/aiTools.js
 * Gemini-powered tools — extracted + opt-in guarded
 * Batch 3 + Batch 4
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { GoogleGenAI } from "@google/genai";
import { enforceRateLimit } from "../lib/rate-limit.js";

/**
 * Shared helper – creates a Gemini client
 */
function getGeminiClient(geminiApiKey) {
  const apiKey = geminiApiKey.value() || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new HttpsError("failed-precondition", "Gemini API key is not configured.");
  }
  return new GoogleGenAI({ apiKey });
}

/**
 * 1. Translate testimony
 */
export function createTranslateTestimony({ allowedOrigins, geminiApiKey }) {
  return onCall(
    {
      cors: allowedOrigins,
      secrets: [geminiApiKey],
    },
    async (request) => {
      const { text, targetLanguage, enableAI = false } = request.data || {};

      // Batch 4: require explicit opt-in
      if (!enableAI) {
        throw new HttpsError(
          "failed-precondition",
          "AI translation is off by default. Pass enableAI: true to use this feature."
        );
      }

      if (!text || !targetLanguage) {
        throw new HttpsError("invalid-argument", "Text and targetLanguage are required.");
      }

      if (request.auth?.uid) {
        await enforceRateLimit(request.auth.uid, "translateTestimony", {
          windowMs: 60_000,
          max: 8,
        });
      }

      const ai = getGeminiClient(geminiApiKey);
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Translate the following report accurately into ${targetLanguage}, preserving tone and essential detail:\n\n"${text}"`,
      });

      const translatedText = response.text ? response.text.trim() : "";
      return { translatedText };
    }
  );
}

/**
 * 2. Transcribe audio (Witness Voice)
 * High-integrity path — strongly gated
 */
export function createTranscribeAudioWitness({ allowedOrigins, geminiApiKey }) {
  return onCall(
    {
      cors: allowedOrigins,
      secrets: [geminiApiKey],
      timeoutSeconds: 60,
      memory: "512MiB",
    },
    async (request) => {
      const { audioBase64, mimeType, enableAI = false, channel = "citizen" } = request.data || {};

      // Batch 4: require explicit opt-in
      if (!enableAI) {
        throw new HttpsError(
          "failed-precondition",
          "AI transcription is off by default on Witness Voice. Pass enableAI: true only when the user explicitly requests it."
        );
      }

      // Extra guard for high-integrity channel
      if (channel === "witness_voice" || channel === "witness") {
        // Still allowed, but only when enableAI === true (already checked)
        // Future: can add extra logging / audit here
      }

      if (!audioBase64 || !mimeType) {
        throw new HttpsError("invalid-argument", "audioBase64 and mimeType are required.");
      }

      if (request.auth?.uid) {
        await enforceRateLimit(request.auth.uid, "transcribeAudioWitness", {
          windowMs: 60_000,
          max: 4,
        });
      }

      const ai = getGeminiClient(geminiApiKey);
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            inlineData: {
              mimeType,
              data: audioBase64,
            },
          },
          "Provide a precise, verbatim transcription of this voice witness submission. Do not add intro or outro prose.",
        ],
      });

      const transcription = response.text ? response.text.trim() : "";
      return { transcription };
    }
  );
}

/**
 * 3. Summarize report
 */
export function createSummarizeReport({ allowedOrigins, geminiApiKey }) {
  return onCall(
    {
      cors: allowedOrigins,
      secrets: [geminiApiKey],
    },
    async (request) => {
      const { text, enableAI = false } = request.data || {};

      // Batch 4: require explicit opt-in
      if (!enableAI) {
        throw new HttpsError(
          "failed-precondition",
          "AI summarization is off by default. Pass enableAI: true to use this feature."
        );
      }

      if (!text) {
        throw new HttpsError("invalid-argument", "Text is required.");
      }

      if (request.auth?.uid) {
        await enforceRateLimit(request.auth.uid, "summarizeReport", {
          windowMs: 60_000,
          max: 10,
        });
      }

      const ai = getGeminiClient(geminiApiKey);
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Summarize this citizen report into a single concise sentence (under 25 words) suitable for a compact feed card:\n\n"${text}"`,
      });

      const summary = response.text ? response.text.trim() : "";
      return { summary };
    }
  );
}
