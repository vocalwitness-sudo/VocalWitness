// js/adminVerification.js - Developer & Steward Verification Interface Module
import { db, auth } from './firebase-config.js';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  updateDoc, 
  addDoc, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { showToast } from './utils.js';

export function initAdminVerification(containerId = 'admin-verification-container') {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Render Skeleton UI Frame
  container.innerHTML = `
    <div class="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
      <div class="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h2 class="text-lg font-bold text-slate-100 flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-amber-500 animate-pulse"></span>
            Pending Verification Queue
          </h2>
          <p class="text-xs text-slate-400">Review requests for Witness Voice & True Circle escalation.</p>
        </div>
        <span id="pending-count-badge" class="px-2.5 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-full text-xs font-semibold">0 Pending</span>
      </div>

      <div id="verification-requests-list" class="space-y-3 min-h-[120px]">
        <div class="text-center py-8 text-slate-500 text-sm">Listening for incoming verification requests...</div>
      </div>
    </div>
  `;

  const listElement = document.getElementById('verification-requests-list');
  const countBadge = document.getElementById('pending-count-badge');

  // Real-time listener for pending requests
  const q = query(
    collection(db, "verification_requests"),
    where("status", "==", "pending")
  );

  onSnapshot(q, (snapshot) => {
    if (snapshot.empty) {
      listElement.innerHTML = `
        <div class="text-center py-8 text-slate-500 text-sm">
          No pending verification requests at this time.
        </div>
      `;
      countBadge.textContent = "0 Pending";
      return;
    }

    countBadge.textContent = `${snapshot.size} Pending`;
    listElement.innerHTML = "";

    snapshot.forEach((requestDoc) => {
      const data = requestDoc.data();
      const reqId = requestDoc.id;
      const requestedDate = data.requestedAt?.toDate() ? data.requestedAt.toDate().toLocaleString() : "Just now";

      const card = document.createElement('div');
      card.className = "bg-slate-800/80 border border-slate-700/60 hover:border-slate-600 rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition";
      card.innerHTML = `
        <div class="space-y-1">
          <div class="flex items-center gap-2">
            <span class="font-semibold text-slate-200">${data.applicantName || 'Anonymous Witness'}</span>
            <span class="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300 font-mono">${data.applicantId.slice(0, 8)}...</span>
          </div>
          <div class="text-xs text-slate-400 flex items-center gap-3">
            <span>Target Feed: <strong class="text-amber-400">${data.targetFeed || 'witness_voice'}</strong></span>
            <span>•</span>
            <span>Requested: ${requestedDate}</span>
          </div>
        </div>

        <div class="flex items-center gap-2 self-end md:self-center">
          <button data-action="reject" data-id="${reqId}" data-uid="${data.applicantId}" class="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-xs font-semibold transition">
            Reject
          </button>
          <button data-action="approve" data-id="${reqId}" data-uid="${data.applicantId}" data-feed="${data.targetFeed}" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow transition flex items-center gap-1">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
            Approve & Verify
          </button>
        </div>
      `;

      // Event Listeners for Approve/Reject buttons
      card.querySelectorAll('button').forEach(btn => {
        btn.onclick = async (e) => {
          const action = btn.dataset.action;
          const requestId = btn.dataset.id;
          const targetUid = btn.dataset.uid;
          const feed = btn.dataset.feed;

          btn.disabled = true;

          if (action === 'approve') {
            await approveVerification(requestId, targetUid, feed);
          } else {
            await rejectVerification(requestId, targetUid);
          }
        };
      });

      listElement.appendChild(card);
    });
  }, (err) => {
    console.error("Error fetching verification requests:", err);
    listElement.innerHTML = `<div class="text-red-400 text-xs p-3 bg-red-950/30 rounded-lg border border-red-900/50">Error loading queue: ${err.message}</div>`;
  });
}

// Handler: Approve Request
async function approveVerification(requestId, targetUid, targetFeed) {
  try {
    const adminUser = auth.currentUser;
    if (!adminUser) {
      showToast("You must be logged in as an admin to perform this action.", "error");
      return;
    }

    // 1. Update User Profile in Firestore
    const userRef = doc(db, "users", targetUid);
    await updateDoc(userRef, {
      zkVerified: true,
      tier: "witness",
      developerVerifiedAt: serverTimestamp(),
      verifiedBy: adminUser.uid
    });

    // 2. Mark Request as Approved
    const reqRef = doc(db, "verification_requests", requestId);
    await updateDoc(reqRef, {
      status: "approved",
      reviewedBy: adminUser.uid,
      reviewedAt: serverTimestamp()
    });

    // 3. Log Audit Record
    await addDoc(collection(db, "audit_logs"), {
      action: "DEVELOPER_VERIFICATION_APPROVED",
      targetUserId: targetUid,
      targetFeed: targetFeed || "witness_voice",
      executedBy: adminUser.uid,
      timestamp: serverTimestamp()
    });

    showToast("✅ User verification approved successfully!", "success");
  } catch (error) {
    console.error("Approval error:", error);
    showToast(`Failed to approve: ${error.message}`, "error");
  }
}

// Handler: Reject Request
async function rejectVerification(requestId, targetUid) {
  try {
    const adminUser = auth.currentUser;
    if (!adminUser) return;

    const reqRef = doc(db, "verification_requests", requestId);
    await updateDoc(reqRef, {
      status: "rejected",
      reviewedBy: adminUser.uid,
      reviewedAt: serverTimestamp()
    });

    showToast("Request rejected.", "info");
  } catch (error) {
    console.error("Rejection error:", error);
    showToast(`Failed to reject: ${error.message}`, "error");
  }
}
