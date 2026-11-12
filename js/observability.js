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
