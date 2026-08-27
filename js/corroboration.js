// js/corroboration.js
// Corroboration Engine – “I saw this too”

import { auth, db } from './firebase-config.js';
import {
  collection, doc, addDoc, getDocs, query, where,
  orderBy, limit, serverTimestamp, increment, updateDoc,
  getDoc, writeBatch
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { showToast } from './utils.js';
import { canCorroborate, getUserTierWeight } from './tier.js';
import { uploadEvidenceMedia } from './storage.js';   // or your existing upload helper
import { computeSHA256 } from './utils.js';           // adjust name if different

const CORROBORATIONS = 'corroborations';
const TESTIMONIES   = 'testimonies';

/**
 * Submit a corroboration
 * @param {string} testimonyId
 * @param {object} opts
 * @param {string} [opts.note]
 * @param {File|Blob|null} [opts.mediaFile]
 * @param {string} [opts.approxTime]   ISO or free text
 * @param {string} [opts.approxLocation]
 * @param {number} [opts.lat]
 * @param {number} [opts.lng]
 */
export async function submitCorroboration(testimonyId, opts = {}) {
  const user = auth.currentUser;
  if (!user) {
    showToast("Sign in required", "error");
    throw new Error("Unauthenticated");
  }

  if (!(await canCorroborate(user))) {
    showToast("Phone verification required to corroborate", "error");
    throw new Error("Insufficient tier");
  }

  // Prevent self-corroboration & double-corroboration
  const existing = await getDocs(query(
    collection(db, CORROBORATIONS),
    where("testimonyId", "==", testimonyId),
    where("authorId", "==", user.uid),
    limit(1)
  ));
  if (!existing.empty) {
    showToast("You already corroborated this report", "info");
    return null;
  }

  const testimonyRef = doc(db, TESTIMONIES, testimonyId);
  const testimonySnap = await getDoc(testimonyRef);
  if (!testimonySnap.exists()) {
    showToast("Report not found", "error");
    throw new Error("Testimony missing");
  }
  const testimony = testimonySnap.data();
  if (testimony.authorId === user.uid) {
    showToast("You cannot corroborate your own report", "error");
    throw new Error("Self-corroboration blocked");
  }

  // Media handling
  let mediaUrl = null;
  let mediaType = null;
  let forensicHash = null;
  if (opts.mediaFile) {
    forensicHash = await computeSHA256(opts.mediaFile);
    mediaType = opts.mediaFile.type.startsWith('audio/') ? 'audio' : 'image';
    mediaUrl = await uploadEvidenceMedia(opts.mediaFile, mediaType);
  }

  const weight = await getUserTierWeight(user); // 1, 2 or 3

  const payload = {
    testimonyId,
    authorId: user.uid,
    authorDisplay: user.displayName || "Verified Witness",
    authorTier: weight,
    note: (opts.note || "").trim().slice(0, 280),
    mediaUrl,
    mediaType,
    forensicHash,
    approxTime: opts.approxTime || null,
    approxLocation: opts.approxLocation || null,
    lat: opts.lat ?? null,
    lng: opts.lng ?? null,
    weight,
    createdAt: serverTimestamp(),
    isDeleted: false
  };

  const batch = writeBatch(db);

  // 1. Write the corroboration
  const corrRef = doc(collection(db, CORROBORATIONS));
  batch.set(corrRef, payload);

  // 2. Atomically bump counters on the testimony
  batch.update(testimonyRef, {
    corroborationCount: increment(1),
    corroborationScore: increment(weight),
    lastCorroboratedAt: serverTimestamp()
  });

  await batch.commit();

  showToast("🛡️ Corroboration sealed", "success");
  return corrRef.id;
}

/**
 * Get live score + count for a testimony (cheap, uses denormalized fields)
 */
export function getCorroborationScoreFromDoc(testimonyData) {
  return {
    count: testimonyData.corroborationCount || 0,
    score: testimonyData.corroborationScore || 0
  };
}

/**
 * Fetch the actual corroborations list (for detail view / modal)
 */
export async function getCorroborations(testimonyId, max = 50) {
  const q = query(
    collection(db, CORROBORATIONS),
    where("testimonyId", "==", testimonyId),
    where("isDeleted", "==", false),
    orderBy("createdAt", "desc"),
    limit(max)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Very light clustering helper (call after load or on demand)
 * Groups by time window + rough content similarity
 */
export function clusterTestimonies(testimonies, windowHours = 6) {
  // Simple implementation – can be improved later
  const clusters = [];
  const used = new Set();

  for (const t of testimonies) {
    if (used.has(t.id)) continue;
    const cluster = [t];
    used.add(t.id);

    const tTime = t.createdAt?.toMillis?.() || 0;
    for (const other of testimonies) {
      if (used.has(other.id)) continue;
      const oTime = other.createdAt?.toMillis?.() || 0;
      const hoursDiff = Math.abs(tTime - oTime) / 3600000;
      if (hoursDiff > windowHours) continue;

      // Hash match or simple content overlap
      const sameHash = t.forensicHash && t.forensicHash === other.forensicHash;
      const contentSim = simpleSimilarity(t.content || "", other.content || "");
      if (sameHash || contentSim > 0.45) {
        cluster.push(other);
        used.add(other.id);
      }
    }
    if (cluster.length > 1) clusters.push(cluster);
  }
  return clusters;
}

function simpleSimilarity(a, b) {
  const setA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const setB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  for (const w of setA) if (setB.has(w)) inter++;
  return inter / Math.max(setA.size, setB.size);
}

/**
 * UI helper – returns HTML for the button + score badge
 */
export function renderCorroborationUI(testimony, currentUserCanCorroborate) {
  const { count, score } = getCorroborationScoreFromDoc(testimony);
  const scoreLabel = score > 0 ? `${score} pts · ${count} saw this` : "";

  return `
    <div class="flex items-center gap-2 mt-2">
      <button
        class="corroborate-btn px-3 py-1.5 rounded-full text-xs font-medium
               ${currentUserCanCorroborate
                 ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-600/30'
                 : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'}"
        data-testimony-id="${testimony.id}"
        ${currentUserCanCorroborate ? '' : 'disabled'}
        title="${currentUserCanCorroborate ? 'I saw this too' : 'Phone verification required'}">
        👁️ I saw this too
      </button>
      ${score > 0 ? `
        <span class="text-[11px] text-emerald-400/90 font-medium tracking-tight">
          ${scoreLabel}
        </span>` : ''}
    </div>
  `;
}
