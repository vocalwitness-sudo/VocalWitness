// js/moderation.js - Enhanced Moderation Engine & Review Queue
import { db, auth } from './firebase-config.js';
import { showToast } from './utils.js';
import { logSecurityAudit } from './audit.js';
import { 
    collection, addDoc, updateDoc, doc, query, where, getDocs, getDoc,
    serverTimestamp, increment, deleteDoc, runTransaction 
} from "firebase/firestore";
import { getCurrentUserTier, TIERS, hasStewardAccess } from './tier.js';

const PERSPECTIVE_API_KEY = "AIzaSyATxYekXgjdLP2SfR42FG8rEdajq_pIEb0";

// ====================== PERSPECTIVE API TOXICITY SCAN ======================
export async function scanForToxicity(content) {
    if (!content || typeof content !== 'string' || content.trim().length < 5) {
        return { score: 0, flagged: false, reasons: [] };
    }

    try {
        const response = await fetch(
            `https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze?key=${PERSPECTIVE_API_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    comment: { text: content },
                    languages: ["en"],
                    requestedAttributes: {
                        TOXICITY: {},
                        SEVERE_TOXICITY: {},
                        IDENTITY_ATTACK: {},
                        INSULT: {},
                        PROFANITY: {},
                        THREAT: {}
                    }
                })
            }
        );

        if (!response.ok) {
            console.warn(`Perspective API responded with status ${response.status}`);
            return fallbackToxicityScan(content);
        }

        const data = await response.json();

        if (data.error) {
            console.warn("Perspective API payload error:", data.error);
            return fallbackToxicityScan(content);
        }

        const attributes = data.attributeScores;
        const toxicityScore = attributes?.TOXICITY?.summaryScore?.value || 0;
        const severeScore = attributes?.SEVERE_TOXICITY?.summaryScore?.value || 0;

        const reasons = [];
        if (severeScore > 0.6) reasons.push("Severe Toxicity");
        if (attributes?.IDENTITY_ATTACK?.summaryScore?.value > 0.7) reasons.push("Identity Attack");
        if (attributes?.INSULT?.summaryScore?.value > 0.7) reasons.push("Insult");
        if (attributes?.THREAT?.summaryScore?.value > 0.6) reasons.push("Threat");

        const finalScore = Math.max(toxicityScore, severeScore);

        return {
            score: finalScore,
            flagged: finalScore > 0.65 || severeScore > 0.5,
            reasons
        };

    } catch (err) {
        console.warn("Perspective API connection failure, engaging fallback scanner:", err);
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

// ====================== PUBLISH WITH MODERATION ======================
export async function publishWithModeration(content, mediaData, currentUser) {
    const toxicity = await scanForToxicity(content);
    const tier = await getCurrentUserTier();

    let moderationStatus = "approved";

    if (toxicity.flagged && (tier === TIERS.CITIZEN || tier === 'citizen')) {
        moderationStatus = "needs_review";
        showToast("⚠️ Content flagged for steward review", "warning");
    }

    const postData = {
        authorId: currentUser.uid,
        author: currentUser.displayName || "Anonymous Witness",
        content,
        imageUrl: mediaData?.imageUrl || null,
        audioUrl: mediaData?.audioUrl || null,
        timestamp: serverTimestamp(),
        createdAt: serverTimestamp(),
        feedVisibility: "citizen-talk",
        moderationStatus,
        toxicityScore: toxicity.score,
        autoFlaggedReasons: toxicity.reasons,
        authorTier: tier
    };

    const docRef = await addDoc(collection(db, "testimonies"), postData);

    return { success: true, postId: docRef.id, moderationStatus, toxicity };
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
export async function stewardReviewAction(postId, actionType) {
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
                reviewedAt: serverTimestamp()
            });

            await logSecurityAudit("APPROVE_POST", postId, { reviewedBy: auth.currentUser.uid });
            showToast("✅ Testimony approved and published", "success");
        } else if (actionType === 'purge') {
            await updateDoc(postRef, {
                moderationStatus: 'purged',
                reviewedBy: auth.currentUser.uid,
                reviewedAt: serverTimestamp()
            });

            await logSecurityAudit("PURGE_POST", postId, { reviewedBy: auth.currentUser.uid });
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
