/**
 * functions/http/analyzeToxicity.js
 */
import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {
  analyzeToxicityWithPerspective,
} from "../lib/moderation.js";

export function createAnalyzeToxicity({ perspectiveApiKey, corsHandler }) {
  return onRequest({ secrets: [perspectiveApiKey] }, (req, res) => {
    corsHandler(req, res, async () => {
      try {
        const { text } = req.body || {};
        const result = await analyzeToxicityWithPerspective(text, () =>
          perspectiveApiKey.value() || process.env.PERSPECTIVE_API_KEY
        );
        res.status(200).json(result);
      } catch (error) {
        logger.error("Perspective API error:", error);
        res.status(500).json({ error: error.message });
      }
    });
  });
}
