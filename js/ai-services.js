import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js";
import { app } from "./firebase-config.js"; // Verify path to your Firebase init file

const functions = getFunctions(app, "us-central1");

// 1. Post Content Moderation
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

// 2. On-Demand Feed Translation
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

// 3. Audio-to-Text Witness Transcriptions
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

// 4. Compact Summary Generation for Feed Cards
export async function summarizeReport(text) {
  try {
    const summarizeFn = httpsCallable(functions, "summarizeReport");
    const result = await summarizeFn({ text });
    return result.data.summary;
  } catch (error) {
    console.error("AI Summarization Error:", error);
    throw error;
  }
}
