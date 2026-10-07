// js/my-testimonies.js
// My Reports / My Testimonies page logic

import { db, auth } from './firebase-config.js';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  limit
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';
import { showToast } from './utils.js';
import { getUserTier } from './tier.js';

// ========== DOM Elements ==========
const testimoniesFeed = document.getElementById('testimoniesFeed');
const emptyState = document.getElementById('empty-state');
const filterSelect = document.getElementById('filterStatus');
const userTierBadge = document.getElementById('user-tier-badge');

let currentFilter = 'all';
let unsubscribe = null;

// ========== Helper: Format date ==========
function formatDate(timestamp) {
  if (!timestamp) return 'Unknown date';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// ========== Helper: Create a single report card ==========
function createReportCard(doc) {
  const data = doc.data();
  const id = doc.id;

  const channelLabel = data.channel === 'witness-voice' 
    ? '🛡️ Witness Voice' 
    : '🗣️ Citizen Talk';

  const isVerified = data.zkVerified || data.forensicHash || data.packCoreHash;
  const isAnonymous = data.isAnonymous;

  const card = document.createElement('div');
  card.className = 'glass rounded-3xl p-5 sm:p-6 transition hover:border-emerald-500/40';
  card.dataset.id = id;

  card.innerHTML = `
    <div class="flex items-start justify-between gap-3 mb-3">
      <div class="flex items-center gap-2 flex-wrap">
        <span class="text-xs font-medium px-2.5 py-1 rounded-full border ${
          data.channel === 'witness-voice' 
            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400' 
            : 'border-zinc-600 bg-zinc-800 text-zinc-300'
        }">
          ${channelLabel}
        </span>
        ${isVerified ? `
          <span class="text-xs font-medium px-2.5 py-1 rounded-full border border-cyan-500/40 bg-cyan-500/10 text-cyan-400">
            🔒 Sealed
          </span>` : ''}
        ${isAnonymous ? `
          <span class="text-xs font-medium px-2.5 py-1 rounded-full border border-zinc-600 bg-zinc-800 text-zinc-400">
            Anonymous
          </span>` : ''}
      </div>
      <span class="text-xs text-zinc-500 whitespace-nowrap">${formatDate(data.createdAt)}</span>
    </div>

    ${data.title ? `
      <h3 class="text-lg font-semibold text-white mb-2 leading-snug">
        ${escapeHTML(data.title)}
      </h3>` : ''}

    <p class="text-sm text-zinc-300 leading-relaxed mb-4 line-clamp-4">
      ${escapeHTML(data.content || data.text || '')}
    </p>

    <div class="flex items-center justify-between gap-3 pt-3 border-t border-zinc-800">
      <div class="flex items-center gap-3 text-xs text-zinc-500">
        ${data.forensicHash ? `
          <span class="font-mono" title="${data.forensicHash}">
            ${data.forensicHash.slice(0, 10)}…
          </span>` : ''}
      </div>
      <div class="flex gap-2">
        <a href="/verify.html?id=${id}" 
           class="text-xs font-medium text-emerald-400 hover:text-emerald-300 transition">
          Verify
        </a>
        <button type="button" 
                class="text-xs font-medium text-zinc-400 hover:text-white transition view-btn"
                data-id="${id}">
          View
        </button>
      </div>
    </div>
  `;

  // View button (optional - can expand or open modal later)
  card.querySelector('.view-btn')?.addEventListener('click', () => {
    // Simple version: open in new tab or scroll to public feed
    window.open(`/?id=${id}`, '_blank');
  });

  return card;
}

// ========== Escape HTML ==========
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ========== Load user's reports ==========
function loadMyReports(filter = 'all') {
  if (!auth.currentUser) {
    showEmptyState(true);
    showToast('Please sign in to view your reports', 'info');
    return;
  }

  // Clean previous listener
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }

  testimoniesFeed.innerHTML = '';
  showEmptyState(false);

  let q = query(
    collection(db, 'testimonies'),
    where('authorId', '==', auth.currentUser.uid),
    orderBy('createdAt', 'desc'),
    limit(50)
  );

  // Apply filter
  if (filter === 'witness-voice') {
    q = query(
      collection(db, 'testimonies'),
      where('authorId', '==', auth.currentUser.uid),
      where('channel', '==', 'witness-voice'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
  } else if (filter === 'citizen-talk') {
    q = query(
      collection(db, 'testimonies'),
      where('authorId', '==', auth.currentUser.uid),
      where('channel', '==', 'citizen-talk'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
  }

  unsubscribe = onSnapshot(q, (snapshot) => {
    testimoniesFeed.innerHTML = '';

    let docs = snapshot.docs;

    // Client-side filters for verified / draft
    if (filter === 'verified') {
      docs = docs.filter(doc => {
        const d = doc.data();
        return d.zkVerified || d.forensicHash || d.packCoreHash;
      });
    } else if (filter === 'draft') {
      // If you later support drafts, filter here
      docs = docs.filter(doc => doc.data().status === 'draft');
    }

    if (docs.length === 0) {
      showEmptyState(true);
      return;
    }

    showEmptyState(false);
    docs.forEach(doc => {
      const card = createReportCard(doc);
      testimoniesFeed.appendChild(card);
    });
  }, (error) => {
    console.error('Error loading reports:', error);
    showToast('Failed to load your reports', 'error');
    showEmptyState(true);
  });
}

// ========== Show / Hide empty state ==========
function showEmptyState(show) {
  if (emptyState) {
    emptyState.classList.toggle('hidden', !show);
  }
  if (testimoniesFeed) {
    testimoniesFeed.classList.toggle('hidden', show);
  }
}

// ========== Load user tier badge ==========
async function loadUserTier() {
  if (!auth.currentUser || !userTierBadge) return;

  try {
    const tierData = await getUserTier(auth.currentUser.uid);
    const tier = tierData.tier || 'citizen';

    userTierBadge.textContent = tier.charAt(0).toUpperCase() + tier.slice(1);
    userTierBadge.classList.remove('hidden');
  } catch (err) {
    console.warn('Could not load user tier:', err);
  }
}

// ========== Initialize ==========
export function initMyTestimonies() {
  // Wait for auth
  auth.onAuthStateChanged((user) => {
    if (user) {
      loadUserTier();
      loadMyReports(currentFilter);
    } else {
      showEmptyState(true);
      if (userTierBadge) userTierBadge.classList.add('hidden');
    }
  });

  // Filter change
  if (filterSelect) {
    filterSelect.addEventListener('change', (e) => {
      currentFilter = e.target.value;
      loadMyReports(currentFilter);
    });
  }

  console.log('✅ My Reports page initialized');
}

// Auto-init if this script is loaded directly on the page
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMyTestimonies);
} else {
  initMyTestimonies();
}
