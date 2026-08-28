// js/moderation.js - Enhanced Moderation Engine & Review Queue
import { db, auth, app } from './firebase-config.js';
import { showToast } from './utils.js';
import { logSecurityAudit, logAIFlaggedContent } from './audit.js';
import { 
    collection, addDoc, updateDoc, doc, query, where, getDocs, getDoc,
    serverTimestamp, increment, runTransaction 
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js";
import { getCurrentUserTier, TIERS, hasStewardAccess } from './tier.js';

// Initialize Cloud Functions instance
const functions = getFunctions(app, "us-central1");
const moderatePostContentFn = httpsCallable(functions, "moderatePostContent");

// ====================== GEMINI AI CALLABLE MODERATION ======================
export async function runGeminiModeration(title = '', text = '') {
    if (!auth.currentUser) {
        return { flagged: false, reason: "Unauthenticated", categories: [], safetyScore: 1.0 };
    }

    try {
        const response = await moderatePostContentFn({ title, text });
        return response.data || { flagged: false, reason: "No response data", categories: [], safetyScore: 1.0 };
    } catch (err) {
        console.error("Gemini AI Callable Moderation error:", err);
        return { flagged: false, reason: "Moderation connection failure fallback", categories: [], safetyScore: 1.0 };
    }
}

// ====================== PERSPECTIVE API TOXICITY SCAN ======================
export async function scanForToxicity(content) {
    if (!content || typeof content !== 'string' || content.trim().length < 5) {
        return { score: 0, flagged: false, reasons: [] };
    }

    try {
        // Calls backend onRequest proxy to avoid leaking client-side API keys
        const response = await fetch("https://us-central1-vocalwitness-3affa.cloudfunctions.net/analyzeToxicity", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: content })
        });

        if (!response.ok) {
            return fallbackToxicityScan(content);
        }

        const data = await response.json();
        const toxicityScore = data.toxicityScore || 0;
        const isToxic = !data.safe;

        return {
            score: toxicityScore,
            flagged: isToxic,
            reasons: isToxic ? [data.note || "Flagged for toxicity"] : []
        };
    } catch (err) {
        console.warn("Toxicity endpoint connection failure, engaging fallback scanner:", err);
        return fallbackToxicityScan(content);
    }
}

function fallbackToxicityScan(content) {
    const lower = content.toLowerCase();
    let score = 0;
    const reasons = [];

    const badWords = ["hate", "kill", "die", "retard", "fuck", "shit", "cunt"];
    badWords.forEach(word => {
        const regex = new RegExp(`\\b${word}\\b`, 'i');
        if (regex.test(lower)) {
            score += 0.25;
            reasons.push(word);
        }
    });

    return { score: Math.min(1, score), flagged: score > 0.5, reasons };
}

// ====================== PUBLISH WITH HYBRID MODERATION ======================
export async function publishWithModeration(content, mediaData, currentUser, title = '') {
    const tier = await getCurrentUserTier();

    // Run parallel checks: Gemini 2.5 Flash Cloud Function + Perspective/Fallback scan
    const [geminiResult, toxicity] = await Promise.all([
        runGeminiModeration(title, content),
        scanForToxicity(content)
    ]);

    let moderationStatus = "approved";
    const combinedReasons = [...(toxicity.reasons || [])];

    if (geminiResult.flagged) {
        combinedReasons.push(`Gemini AI: ${geminiResult.reason || 'Flagged'}`);
    }

    // Auto-flag condition for citizens or high toxicity / AI safety triggers
    const isHighRisk = geminiResult.flagged || toxicity.flagged || (geminiResult.safetyScore < 0.6);
    const requiresReview = isHighRisk && (tier === TIERS.CITIZEN || tier === 'citizen' || !tier);

    if (requiresReview) {
        moderationStatus = "needs_review";
        showToast("⚠️ Content flagged for steward review", "warning");
    }

    const postData = {
        authorId: currentUser.uid,
        author: currentUser.displayName || "Anonymous Witness",
        title: title || "",
        content,
        imageUrl: mediaData?.imageUrl || null,
        audioUrl: mediaData?.audioUrl || null,
        mediaHash: mediaData?.mediaHash || null,
        isSynthetic: mediaData?.isSynthetic || false,
        syntheticScore: mediaData?.syntheticScore || 0,
        timestamp: serverTimestamp(),
        createdAt: serverTimestamp(),
        feedVisibility: "citizen-talk",
        moderationStatus,
        toxicityScore: toxicity.score,
        geminiSafetyScore: geminiResult.safetyScore || 1.0,
        geminiCategories: geminiResult.categories || [],
        autoFlaggedReasons: combinedReasons,
        authorTier: tier
    };

    const docRef = await addDoc(collection(db, "testimonies"), postData);

    // Record deepfake / synthetic media detections in audit collection
    if (mediaData?.isSynthetic && mediaData?.mediaHash) {
        await logAIFlaggedContent({
            mediaHash: mediaData.mediaHash,
            confidenceScore: mediaData.syntheticScore || 0.9,
            detectorModel: mediaData.detectorModel || "Deepfake Detector",
            details: { postId: docRef.id }
        });
    }

    return { 
        success: true, 
        postId: docRef.id, 
        moderationStatus, 
        toxicity,
        geminiResult 
    };
}

// ====================== REPORT CONTENT ======================
export async function reportContent(postId, reason, details = '') {
    if (!auth.currentUser) {
        showToast("Sign in required to report content", "error");
        return false;
    }

    try {
        const reportRef = collection(db, "reports");
        const postRef = doc(db, "testimonies", postId);

        await runTransaction(db, async (transaction) => {
            const postDoc = await transaction.get(postRef);
            if (!postDoc.exists()) {
                throw new Error("Testimony no longer exists.");
            }

            const newReportRef = doc(reportRef);
            transaction.set(newReportRef, {
                postId,
                reportedBy: auth.currentUser.uid,
                reason: reason || "other",
                details: details || "",
                status: "pending",
                timestamp: serverTimestamp()
            });

            transaction.update(postRef, {
                reportCount: increment(1)
            });
        });

        try {
            await logSecurityAudit("REPORT_CONTENT", postId, { reason, details });
        } catch (auditErr) {
            console.warn("Audit logging failed:", auditErr);
        }

        showToast("🚩 Content reported to Stewards", "success");
        return true;
    } catch (e) {
        console.error("Report failed:", e);
        showToast(e.message || "Failed to submit report", "error");
        return false;
    }
}

// ====================== STEWARD REVIEW ACTIONS ======================
export async function stewardReviewAction(postId, actionType, notes = '') {
    const isSteward = await hasStewardAccess();
    if (!isSteward) {
        showToast("Unauthorized: Steward access required", "error");
        return false;
    }

    try {
        const postRef = doc(db, "testimonies", postId);

        if (actionType === 'approve') {
            await updateDoc(postRef, {
                moderationStatus: 'approved',
                reviewedBy: auth.currentUser.uid,
                reviewedAt: serverTimestamp(),
                reviewNotes: notes
            });

            await logSecurityAudit("APPROVE_POST", postId, { reviewedBy: auth.currentUser.uid, notes });
            showToast("✅ Testimony approved and published", "success");
        } else if (actionType === 'purge') {
            await updateDoc(postRef, {
                moderationStatus: 'purged',
                reviewedBy: auth.currentUser.uid,
                reviewedAt: serverTimestamp(),
                reviewNotes: notes
            });

            await logSecurityAudit("PURGE_POST", postId, { reviewedBy: auth.currentUser.uid, notes });
            showToast("🗑️ Testimony purged from public feed", "info");
        }
        return true;
    } catch (e) {
        console.error("Steward action failed:", e);
        showToast("Action failed", "error");
        return false;
    }
}

// ====================== FETCH REVIEW QUEUE ======================
export async function fetchReviewQueue() {
    const isSteward = await hasStewardAccess();
    if (!isSteward) return [];

    try {
        const q = query(
            collection(db, "testimonies"),
            where("moderationStatus", "==", "needs_review")
        );
        const snapshot = await getDocs(q);
        const items = [];
        snapshot.forEach(docSnap => {
            items.push({ id: docSnap.id, ...docSnap.data() });
        });
        return items;
    } catch (e) {
        console.error("Failed to fetch review queue:", e);
        return [];
    }
}

// ====================== INITIALIZE MODERATION PAGE ======================
export async function initModeration() {
    const queueContainer = document.getElementById('moderationQueueContainer');
    const queue = await fetchReviewQueue();
    
    if (!queueContainer) {
        console.log("Moderation queue initialized (No active container present):", queue.length);
        return queue;
    }

    queueContainer.innerHTML = '';
    
    if (queue.length === 0) {
        queueContainer.innerHTML = `
            <div class="text-center py-12 text-zinc-500 text-sm">
                🎉 Review queue is clear. No testimonies pending review.
            </div>`;
        return queue;
    }

    queue.forEach(item => {
        const itemEl = document.createElement('div');
        itemEl.className = 'bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-3 flex flex-col gap-3';
        itemEl.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <span class="text-xs font-semibold text-amber-400">Score: ${Math.round((item.toxicityScore || 0) * 100)}% Toxicity</span>
                    <p class="text-xs text-zinc-400 mt-0.5">Reasons: ${(item.autoFlaggedReasons || []).join(', ') || 'Manual Flag'}</p>
                </div>
                <div class="flex gap-2">
                    <button data-mod-action="approve" data-id="${item.id}" class="px-3 py-1 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-medium hover:bg-emerald-600/30">Approve</button>
                    <button data-mod-action="purge" data-id="${item.id}" class="px-3 py-1 bg-red-600/20 text-red-400 border border-red-500/30 rounded-lg text-xs font-medium hover:bg-red-600/30">Purge</button>
                </div>
            </div>
            <p class="text-zinc-200 text-sm bg-zinc-950 p-3 rounded-xl border border-zinc-800/80">${item.content || 'Media Only'}</p>
        `;

        itemEl.querySelectorAll('button[data-mod-action]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const act = e.currentTarget.getAttribute('data-mod-action');
                const res = await stewardReviewAction(item.id, act);
                if (res) itemEl.remove();
            });
        });

        queueContainer.appendChild(itemEl);
    });

    return queue;
}
