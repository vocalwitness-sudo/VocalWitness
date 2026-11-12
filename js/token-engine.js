// js/token-engine.js
import { getFunctions, httpsCallable } from "firebase/functions";

/**
 * Server-side witness proof processing via callable.
 */
export async function processWitnessProof(userId, confidenceScore) {
  const functions = getFunctions();
  const addProof = httpsCallable(functions, "addWitnessProof");
  return await addProof({ userId, confidenceScore });
}
