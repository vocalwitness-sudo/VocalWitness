/**
 * functions/callable/aiTools.js
 * Gemini: translate / transcribe / summarize
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { GoogleGenAI } from "@google/genai";

function getAi(geminiApiKey) {
  const apiKey = geminiApiKey.value() || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new HttpsError("failed-precondition", "Gemini API key missing.");
  }
  return new GoogleGenAI({ apiKey });
}

export function createTranslateTestimony({ allowedOrigins, geminiApiKey }) {
  return onCall(
    { cors: allowedOrigins, secrets: [geminiApiKey] },
    async (request) => {
      const { text, targetLanguage } = request.data || {};
      if (!text || !targetLanguage) {
        throw new HttpsError(
          "invalid-argument",
          "Text and targetLanguage are required."
        );
      }

      const ai = getAi(geminiApiKey);
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Translate the following report accurately into ${targetLanguage}, preserving tone and essential detail:\n\n"${text}"`,
      });

      return { translatedText: response.text ? response.text.trim() : "" };
    }
  );
}

export function createTranscribeAudioWitness({ allowedOrigins, geminiApiKey }) {
  return onCall(
    { cors: allowedOrigins, secrets: [geminiApiKey] },
    async (request) => {
      const { audioBase64, mimeType } = request.data || {};
      if (!audioBase64 || !mimeType) {
        throw new HttpsError(
          "invalid-argument",
          "audioBase64 and mimeType are required."
        );
      }

      const ai = getAi(geminiApiKey);
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          { inlineData: { mimeType, data: audioBase64 } },
          "Provide a precise, verbatim transcription of this voice witness submission. Do not add intro or outro prose.",
        ],
      });

      return { transcription: response.text ? response.text.trim() : "" };
    }
  );
}

export function createSummarizeReport({ allowedOrigins, geminiApiKey }) {
  return onCall(
    { cors: allowedOrigins, secrets: [geminiApiKey] },
    async (request) => {
      const { text } = request.data || {};
      if (!text) {
        throw new HttpsError("invalid-argument", "Text is required.");
      }

      const ai = getAi(geminiApiKey);
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Summarize this citizen report into a single concise sentence (under 25 words) suitable for a compact feed card:\n\n"${text}"`,
      });

      return { summary: response.text ? response.text.trim() : "" };
    }
  );
}
