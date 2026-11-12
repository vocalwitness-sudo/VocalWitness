/**
 * functions/lib/moderation.js
 * Toxicity helpers (Perspective + local fallback)
 */
import axios from "axios";
import * as logger from "firebase-functions/logger";

export function gentleModerationCheck(content = "") {
  const text = content.toLowerCase();
  const flagWords = ["spam", "scam", "abuse", "hate", "harass"];
  const isFlagged = flagWords.some((word) => text.includes(word));
  return {
    safe: !isFlagged,
    toxicityScore: isFlagged ? 0.8 : 0.0,
    note: isFlagged
      ? "Flagged by local fallback moderation check."
      : "Passed local fallback check.",
  };
}

/**
 * @param {string} content
 * @param {() => string} getApiKey - returns Perspective API key
 */
export async function analyzeToxicityWithPerspective(content = "", getApiKey) {
  const apiKey = typeof getApiKey === "function" ? getApiKey() : getApiKey;
  if (!apiKey || !content || content.length < 3) {
    return { safe: true, toxicityScore: 0, note: "Skipped or too short" };
  }

  try {
    const response = await axios.post(
      `https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze?key=${apiKey}`,
      {
        comment: { text: content },
        languages: ["en"],
        requestedAttributes: { TOXICITY: {}, INSULT: {}, THREAT: {} },
      }
    );

    const scores = response.data.attributeScores;
    const toxicityScore = scores?.TOXICITY?.summaryScore?.value || 0;
    const insultScore = scores?.INSULT?.summaryScore?.value || 0;
    const threatScore = scores?.THREAT?.summaryScore?.value || 0;
    const isToxic =
      toxicityScore > 0.7 || insultScore > 0.7 || threatScore > 0.6;

    return {
      safe: !isToxic,
      toxicityScore,
      insultScore,
      threatScore,
      note: isToxic
        ? "Flagged by automated Perspective API moderation for toxicity/insult."
        : "Passed Perspective API check.",
    };
  } catch (error) {
    logger.error("Perspective API evaluation error:", error.message);
    return gentleModerationCheck(content);
  }
}
