// js/live-arena.js
import { listenToVerifiedCount, showToast } from './utils.js';
import { requireAuth } from './auth.js';
import { auth, db } from './firebase-config.js';
import { doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

const GOAL = 500;

export function initLiveArena() {
  // Real-time verified count
  const unsubscribe = listenToVerifiedCount((count) => {
    const countEl = document.getElementById('verifiedCount');
    const progressBar = document.getElementById('verifiedProgress');
    const progressText = document.getElementById('progressText');

    if (countEl) countEl.textContent = count.toLocaleString();

    if (progressBar) {
      const percentage = Math.min((count / GOAL) * 100, 100);
      progressBar.style.width = `${percentage}%`;
    }

    if (progressText) {
      if (count >= GOAL) {
        progressText.textContent = "🎉 Arena is ready to launch!";
        progressText.classList.add('text-emerald-400', 'font-medium');
      } else {
        progressText.textContent = `${(GOAL - count).toLocaleString()} more needed`;
      }
    }
  });

  // Cleanup
  window.addEventListener('beforeunload', () => {
    if (typeof unsubscribe === 'function') unsubscribe();
  });
}

export async function notifyLiveArena() {
  const btn = document.getElementById('notifyArenaBtn');

  if (!requireAuth("Please sign in to get notified when the Live Arena launches.")) {
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = "Saving...";
  }

  try {
    const user = auth.currentUser;
    if (!user) {
      showToast("Please sign in first.", "error");
      return;
    }

    await updateDoc(doc(db, "users", user.uid), {
      interestedInArena: true,
      arenaNotifyAt: serverTimestamp()
    });

    showToast("✅ You're on the list! We'll notify you when the Arena goes live.", "success");

    if (btn) {
      btn.textContent = "✅ You're on the list";
      btn.classList.remove("from-rose-500", "to-pink-500");
      btn.classList.add("from-emerald-500", "to-teal-500");
    }
  } catch (error) {
    console.error(error);
    showToast("Something went wrong. Please try again.", "error");

    if (btn) {
      btn.disabled = false;
      btn.textContent = "🔔 Notify Me When Arena Goes Live";
    }
  }
}

// Make available globally for onclick
window.notifyLiveArena = notifyLiveArena;

window.goBack = function () {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    window.location.href = 'index.html';
  }
};

// Auto start
initLiveArena();
