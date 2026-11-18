/**
 * functions/callable/moderatePostContent.js
 * Gemini advisory moderation for citizen reports.
 * Never auto-deletes or changes sealed records.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { GoogleGenAI, Type } from "@google/genai";
import * as logger from "firebase-functions/logger";
import { enforceRateLimit } from "../lib/rate-limit.js";

export function createModeratePostContent({ allowedOrigins, geminiApiKey }) {
  return onCall(
    {
      cors: allowedOrigins,
      secrets: [geminiApiKey],
      timeoutSeconds: 30,
      memory: "256MiB",
    },
    async (request) => {
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "Authentication required.");
      }

      const uid = request.auth.uid;
      const { title = "", text = "" } = request.data || {};

      const content = String(text || "").trim();
      const headline = String(title || "").trim();

      if (!content && !headline) {
        return {
          flagged: false,
          reason: "Empty content",
          categories: [],
          safetyScore: 1.0,
        };
      }

      // Soft rate limit (advisory only)
      try {
        await enforceRateLimit(uid, "moderatePostContent", {
          windowMs: 60_000,
          max: 20,
        });
      } catch (_) {
        // Non-fatal – still return safe default
        return {
          flagged: false,
          reason: "Rate limited – skipped",
          categories: [],
          safetyScore: 1.0,
        };
      }

      try {
        const apiKey = geminiApiKey.value() || process.env.GEMINI_API_KEY;
        if (!apiKey) {
          logger.warn("moderatePostContent: GEMINI_API_KEY missing");
          return {
            flagged: false,
            reason: "AI unavailable",
            categories: [],
            safetyScore: 1.0,
          };
        }

        const ai = new GoogleGenAI({ apiKey });

        const prompt = `
You are an advisory content-safety assistant for a citizen-reporting platform (VocalWitness).
Analyse the following report. Be conservative. Do NOT decide truth.
Only flag clear violations: hate speech, direct threats of violence, child sexual content, severe harassment, or obvious spam/scams.

Title: ${headline || "(none)"}
Text: ${content.slice(0, 3000)}

Return JSON only:
- flagged: boolean
- reason: short string (empty if not flagged)
- categories: array of short strings (e.g. ["hate_speech"])
- safetyScore: number 0.0–1.0 (1.0 = completely safe)
`;

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                flagged: { type: Type.BOOLEAN },
                reason: { type: Type.STRING },
                categories: { type: Type.ARRAY, items: { type: Type.STRING } },
                safetyScore: { type: Type.NUMBER },
              },
              required: ["flagged", "reason", "categories", "safetyScore"],
            },
          },
        });

        const result = JSON.parse(response.text || "{}");

        return {
          flagged: Boolean(result.flagged),
          reason: String(result.reason || "").slice(0, 200),
          categories: Array.isArray(result.categories) ? result.categories.slice(0, 8) : [],
          safetyScore: Math.min(1, Math.max(0, Number(result.safetyScore) || 1)),
          note: "Advisory only. Never changes sealed records.",
        };
      } catch (err) {
        logger.error("moderatePostContent error:", err?.message || err);
        // Fail-open so publish is never blocked by AI
        return {
          flagged: false,
          reason: "Moderation service error – allowed",
          categories: [],
          safetyScore: 1.0,
        };
      }
    }
  );
}
