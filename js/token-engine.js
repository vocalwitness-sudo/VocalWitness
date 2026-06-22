// js/token-engine.js
import { doc, updateDoc, increment } from "firebase/firestore";
import { db } from "./firebase-init.js";

export async function processWitnessProof(userId, proofHash, confidenceScore) {
    // 1. Validate the proof via your ZK logic
    // 2. If valid, update the trustScore
    const userRef = doc(db, "users", userId);
    
    await updateDoc(userRef, {
        trustScore: increment(confidenceScore),
        verifiedUploads: increment(1)
    });
    
    return { status: 'success', scoreAdded: confidenceScore };
}

import { getFunctions, httpsCallable } from "firebase/functions";

export async function processWitnessProof(userId, confidenceScore) {
    const functions = getFunctions();
    const addProof = httpsCallable(functions, 'addWitnessProof');
    return await addProof({ userId, confidenceScore });
}
