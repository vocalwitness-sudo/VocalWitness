// js/observability.js
// Lightweight error + feedback capture for Batch 5
// Does not change any sealing logic.

import { db, auth } from './firebase-config.js';
import { collection, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';
import { showToast } from './utils.js';

/**
 * Log a client-side error or event (non-blocking)
 */
export async function logClientEvent({
  type = 'error',          // 'error' | 'warning' | 'feedback' | 'metric'
  message = '',
  stack = null,
  context = {},
  severity = 'info'
}) {
  try {
    await addDoc(collection(db, 'client_events'), {
      type,
      message: String(message).slice(0, 1000),
      stack: stack ? String(stack).slice(0, 2000) : null,
      context,
      severity,
      uid: auth.currentUser?.uid || null,
      url: location.href,
      userAgent: navigator.userAgent.slice(0, 300),
      createdAt: serverTimestamp(),
      isSeed: false
    });
  } catch (e) {
    // Never break the app if logging fails
    console.warn('[observability] log failed', e);
  }
}

/**
 * Global unhandled error capture
 */
export function initErrorTracking() {
  window.addEventListener('error', (event) => {
    logClientEvent({
      type: 'error',
      message: event.message || 'Unhandled error',
      stack: event.error?.stack || null,
      context: { filename: event.filename, lineno: event.lineno },
      severity: 'error'
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    logClientEvent({
      type: 'error',
      message: event.reason?.message || String(event.reason) || 'Unhandled rejection',
      stack: event.reason?.stack || null,
      severity: 'error'
    });
  });

  console.log('[observability] Error tracking ready');
}

/**
 * Simple feedback form submission
 */
export async function submitFeedback({ message, category = 'general', email = null }) {
  if (!message || message.trim().length < 5) {
    showToast('Please write a short message', 'warning');
    return false;
  }

  try {
    await addDoc(collection(db, 'feedback'), {
      message: message.trim().slice(0, 2000),
      category,
      email: email || auth.currentUser?.email || null,
      uid: auth.currentUser?.uid || null,
      url: location.href,
      createdAt: serverTimestamp(),
      status: 'new'
    });
    showToast('Thank you — feedback received', 'success');
    return true;
  } catch (e) {
    console.error(e);
  showToast('Could not send feedback. Try again later.', 'error');
    return false;
  }
}
2. Wire it up (minimal)
In js/main.js (or your main entry):

js
import { initErrorTracking } from './observability.js';

// After Firebase is ready
initErrorTracking();
3. Feedback button (add once in the footer or header)
html
<button id="vw-feedback-btn" class="text-sm text-zinc-400 hover:text-emerald-400">
  Feedback / Report a problem
</button>
js
document.getElementById('vw-feedback-btn')?.addEventListener('click', () => {
  const message = prompt('What went wrong or what would you like improved?');
  if (message) {
    import('./observability.js').then(m => m.submitFeedback({ message }));
  }
});
This is enough to see real errors and user feedback without any new external services.

Part B — Safe seed content
Create a small script you can run once from the browser console or a temporary admin page.
All content is clearly fictional and non-sensitive.

js
// scripts/seed-safe-content.js  (run once, then delete or guard heavily)
import { db } from '../js/firebase-config.js';
import { collection, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';

const SEED_REPORTS = [
  {
    content: "Sample sealed field note: Observed heavy rainfall and temporary flooding near a market area this morning. Roads remain passable. (This is fictional seed content for platform testing.)",
    channel: "citizen",
    isSeed: true
  },
  {
    content: "Witness Voice sample: First-hand observation of a community clean-up event at a public park. Many volunteers present. No incidents. (Fictional seed content — not a real event.)",
    channel: "witness_voice",
    isSeed: true
  },
  {
    content: "Citizen report: Local library announced extended evening hours for exam season. (Seed content only.)",
    channel: "citizen",
    isSeed: true
  }
  // Add 5–10 more similar safe, generic entries
];

export async function seedSafeContent() {
  console.warn('Seeding fictional content only. Do not use real incidents.');
  for (const item of SEED_REPORTS) {
    await addDoc(collection(db, 'testimonies'), {
      ...item,
      authorId: 'seed-system',
      isAnonymous: true,
      createdAt: serverTimestamp(),
      visibility: 'public',
      forensicHash: 'seed-placeholder-hash',
      isSeed: true
    });
  }
  console.log('Safe seed content written.');
}
Rules reminder: Make sure your Firestore rules still prevent ordinary users from writing isSeed or overwriting sealed fields. Seed documents should be created only by an admin/service account or a one-time protected script.

Recommended order
Add js/observability.js + call initErrorTracking().
Add the simple feedback button.
Deploy and confirm events appear in the client_events / feedback collections.
Only then run the seed script once.
Invite 5–10 trusted people for closed beta.
This keeps risk very low while giving you the real-user loop you need.

Would you like the exact Firestore rules snippet that safely allows writing to client_events and feedback while still protecting sealed testimony fields?





13 sources
