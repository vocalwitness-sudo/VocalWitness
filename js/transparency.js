/**
 * js/transparency.js
 * Public Transparency Dashboard data layer + UI binders.
 * Safe for guests: no challenger UIDs / full challenge text in the table.
 *
 * Requires deployed rules for:
 *   match /disputes/{disputeId} { allow read: if true; ... }
 */

import { db } from './firebase-config.js';
import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';
import {
  fetchAIFlagAuditLogs,
  submitFlagAppeal,
  getTransparencyMetrics,
  getHashChainHealth,
} from './audit.js';
import { listRecentDisputes } from './governance.js';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function truncateId(id, head = 10) {
  const s = String(id || '');
  if (!s) return '—';
  return s.length <= head ? s : `${s.slice(0, head)}…`;
}

function formatDate(value) {
  try {
    if (!value) return '—';
    if (typeof value?.toDate === 'function') {
      return value.toDate().toLocaleDateString();
    }
    if (typeof value === 'number') {
      return new Date(value).toLocaleDateString();
    }
    if (typeof value === 'string') {
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
    }
  } catch (_) {}
  return '—';
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/* -------------------------------------------------------------------------- */
/* Trust metrics (sealed / chain / disputes summary)                          */
/* -------------------------------------------------------------------------- */

export async function loadTrustMetrics() {
  const trustEl = document.getElementById('trustStatsContainer');
  const disputeEl = document.getElementById('disputeOutcomes');
  const chainHeadEl = document.getElementById('chainHeadDisplay');

  try {
    let m = await getTransparencyMetrics();

    // If audit metrics are thin, enrich disputes from public disputes collection
    if (!m || !m.disputes) {
      m = m || {};
      try {
        const rows = await listRecentDisputes(200);
        m.disputes = {
          open: rows.filter((x) => x.status === 'OPEN' || x.status === 'PENDING').length,
          upheld: rows.filter(
            (x) => x.status === 'UPHELD' || x.resolution === 'UPHELD'
          ).length,
          rejected: rows.filter(
            (x) => x.status === 'REJECTED' || x.resolution === 'REJECTED'
          ).length,
          total: rows.length,
        };
      } catch (_) {
        m.disputes = { open: 0, upheld: 0, rejected: 0, total: 0 };
      }
    }

    if (!m.chain) {
      try {
        m.chain = await getHashChainHealth(30);
      } catch (_) {
        m.chain = { ok: true, checked: 0, breaks: 0, status: 'RESTRICTED_ACCESS' };
      }
    }

    const chainLabel =
      m.chain?.status === 'HEALTHY'
        ? 'Healthy'
        : m.chain?.status === 'BREAKS_DETECTED'
          ? 'Breaks'
          : m.chain?.status === 'HEALTHY_SHORT'
            ? 'OK (short)'
            : m.chain?.status === 'RESTRICTED_ACCESS'
              ? 'Restricted'
              : m.chain?.status || '—';

    const chainClass = m.chain?.ok === false ? 'text-red-400' : 'text-emerald-400';

    if (trustEl) {
      trustEl.innerHTML = `
        <div class="glass rounded-3xl p-6 text-center">
          <div class="text-4xl font-bold text-emerald-400">${Number(m.sealedReports || 0).toLocaleString()}</div>
          <div class="text-sm text-zinc-400 mt-2">Sealed reports</div>
        </div>
        <div class="glass rounded-3xl p-6 text-center">
          <div class="text-3xl font-bold ${chainClass}">${escapeHtml(chainLabel)}</div>
          <div class="text-sm text-zinc-400 mt-2">Hash-chain · ${m.chain?.checked || 0} checked${
            m.chain?.breaks ? ` · ${m.chain.breaks} break(s)` : ''
          }</div>
        </div>
        <div class="glass rounded-3xl p-6 text-center">
          <div class="text-4xl font-bold text-amber-400">${Number(m.disputes?.open || 0).toLocaleString()}</div>
          <div class="text-sm text-zinc-400 mt-2">Open disputes</div>
        </div>
        <div class="glass rounded-3xl p-6 text-center">
          <div class="text-4xl font-bold text-white">${Number(m.disputes?.upheld || 0).toLocaleString()}
            <span class="text-zinc-600">/</span>
            ${Number(m.disputes?.rejected || 0).toLocaleString()}
          </div>
          <div class="text-sm text-zinc-400 mt-2">Upheld / Rejected</div>
        </div>
      `;
    }

    if (disputeEl) {
      disputeEl.innerHTML = `
        <ul class="grid grid-cols-2 gap-3 text-zinc-400">
          <li class="bg-zinc-950/50 border border-zinc-800 rounded-xl p-3">Open:
            <span class="text-white font-semibold">${m.disputes?.open || 0}</span>
          </li>
          <li class="bg-zinc-950/50 border border-zinc-800 rounded-xl p-3">Total:
            <span class="text-white font-semibold">${m.disputes?.total || 0}</span>
          </li>
          <li class="bg-zinc-950/50 border border-zinc-800 rounded-xl p-3">Upheld:
            <span class="text-amber-300 font-semibold">${m.disputes?.upheld || 0}</span>
          </li>
          <li class="bg-zinc-950/50 border border-zinc-800 rounded-xl p-3">Rejected:
            <span class="text-emerald-300 font-semibold">${m.disputes?.rejected || 0}</span>
          </li>
        </ul>
      `;
    }

    if (chainHeadEl && m.chain?.headHash) {
      chainHeadEl.classList.remove('hidden');
      chainHeadEl.textContent = `Chain head (newest forensicHash): ${m.chain.headHash}`;
    }

    if (m.density) {
      setText('density-lagos', `${m.density.lagos ?? 0} sealed`);
      setText('density-nairobi', `${m.density.nairobi ?? 0} sealed`);
    }

    const lastUpdatedEl = document.getElementById('lastUpdated');
    if (lastUpdatedEl) {
      lastUpdatedEl.textContent = new Date(m.updatedAt || Date.now()).toLocaleString();
    }
  } catch (e) {
    console.error('Trust metrics error:', e);
    if (trustEl) {
      trustEl.innerHTML =
        '<div class="col-span-full text-center text-red-400 text-sm py-6">Unable to load trust metrics right now.</div>';
    }
    if (disputeEl) disputeEl.textContent = 'Dispute metrics unavailable.';
  }
}

/* -------------------------------------------------------------------------- */
/* Contributions (optional public totals)                                     */
/* -------------------------------------------------------------------------- */

export async function loadTransparencyData() {
  const statsEl = document.getElementById('statsContainer');
  if (!statsEl) return;

  try {
    const contributionsRef = collection(db, 'contributions');
    const snapshot = await getDocs(
      query(contributionsRef, orderBy('timestamp', 'desc'), limit(50))
    );

    let totalUSD = 0;
    snapshot.forEach((docSnap) => {
      totalUSD += Number(docSnap.data().amountUSD || 0);
    });

    statsEl.innerHTML = `
      <div class="glass rounded-3xl p-6 text-center">
        <div class="text-5xl font-bold text-emerald-400">$${totalUSD.toFixed(0)}</div>
        <div class="text-sm text-zinc-400 mt-2">Total Contributions</div>
      </div>
      <div class="glass rounded-3xl p-6 text-center">
        <div class="text-5xl font-bold">${snapshot.size}</div>
        <div class="text-sm text-zinc-400 mt-2">Active Sustainers</div>
      </div>
      <div class="glass rounded-3xl p-6 text-center">
        <div class="text-5xl font-bold text-amber-400">—</div>
        <div class="text-sm text-zinc-400 mt-2">Utilization Rate</div>
      </div>
    `;
  } catch (e) {
    console.warn('Contribution data unavailable:', e?.message || e);
    statsEl.innerHTML =
      '<p class="text-zinc-500 text-sm col-span-full text-center">Contribution data unavailable.</p>';
  }
}

/* -------------------------------------------------------------------------- */
/* AI flag audit (may require auth under current rules)                       */
/* -------------------------------------------------------------------------- */

export async function loadAIAuditLogs() {
  const tableBody = document.getElementById('aiAuditLogsTable');
  if (!tableBody) return;

  try {
    const logs = await fetchAIFlagAuditLogs(50);

    if (!logs || logs.length === 0) {
      tableBody.innerHTML =
        '<tr><td colspan="5" class="p-4 text-center text-zinc-500">No media currently flagged as synthetic.</td></tr>';
      return;
    }

    tableBody.innerHTML = logs
      .map((log) => {
        const rawHash = log.mediaHash || log.targetId || log.id || '';
        const hash = escapeHtml(rawHash);
        const conf = ((log.confidenceScore ?? log.details?.confidenceScore ?? 0) * 100).toFixed(1);
        const confClass =
          (log.confidenceScore ?? log.details?.confidenceScore ?? 0) > 0.8
            ? 'text-red-400'
            : 'text-amber-400';
        const status = escapeHtml(
          log.status || log.details?.status || 'QUARANTINED'
        );
        const statusClass =
          status === 'APPEAL_PENDING'
            ? 'bg-amber-950 text-amber-300 border-amber-800'
            : status === 'REINSTATED'
              ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
              : 'bg-red-950 text-red-300 border-red-800';
        const canAppeal = status !== 'APPEAL_PENDING' && status !== 'REINSTATED';

        return `
          <tr>
            <td class="p-3 font-mono text-emerald-400 truncate max-w-[120px]" title="${hash}">${hash}</td>
            <td class="p-3 font-bold ${confClass}">${conf}%</td>
            <td class="p-3 text-zinc-400">${escapeHtml(
              log.detectorModel || log.details?.detectorModel || 'Engine'
            )}</td>
            <td class="p-3">
              <span class="px-2 py-0.5 text-[10px] rounded-full border ${statusClass}">${status}</span>
            </td>
            <td class="p-3 text-right">
              ${
                canAppeal
                  ? `<button type="button" data-appeal-hash="${hash}" class="appeal-btn px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[10px] rounded-lg transition">Appeal</button>`
                  : `<span class="text-zinc-500 text-[10px]">Under Review</span>`
              }
            </td>
          </tr>`;
      })
      .join('');

    tableBody.querySelectorAll('.appeal-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        openAppealModal(btn.getAttribute('data-appeal-hash'));
      });
    });
  } catch (e) {
    console.warn('AI audit logs restricted or failed:', e?.message || e);
    tableBody.innerHTML =
      '<tr><td colspan="5" class="p-4 text-center text-zinc-500">AI logs unavailable (sign in or restricted rules).</td></tr>';
  }
}

/* -------------------------------------------------------------------------- */
/* Public challenges table (privacy-safe columns only)                        */
/* -------------------------------------------------------------------------- */

export async function loadChallengesTable() {
  const tbody = document.getElementById('challengesTable');
  if (!tbody) return;

  try {
    const rows = await listRecentDisputes(25);

    if (!rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="4" class="p-4 text-center text-zinc-500">No testimony challenges yet.</td></tr>';
      return;
    }

    tbody.innerHTML = rows
      .map((d) => {
        const id = escapeHtml(truncateId(d.id, 10));
        const tid = escapeHtml(truncateId(d.testimonyId, 12));
        const status = escapeHtml(d.status || 'OPEN');
        const created = formatDate(d.createdAt || d.createdAtClient);

        const stClass =
          status === 'OPEN' || status === 'PENDING'
            ? 'text-amber-300'
            : status === 'UPHELD'
              ? 'text-amber-400'
              : status === 'REJECTED'
                ? 'text-emerald-400'
                : 'text-zinc-400';

        return `
          <tr>
            <td class="p-3 font-mono text-zinc-400">${id}</td>
            <td class="p-3 font-mono text-emerald-400/90">${tid}</td>
            <td class="p-3 font-semibold ${stClass}">${status}</td>
            <td class="p-3 text-zinc-500">${created}</td>
          </tr>`;
      })
      .join('');
  } catch (e) {
    console.error('Challenges table error:', e);
    tbody.innerHTML =
      '<tr><td colspan="4" class="p-4 text-center text-zinc-500">Challenges unavailable (deploy disputes read rules).</td></tr>';
  }
}

/* -------------------------------------------------------------------------- */
/* Appeal modal                                                               */
/* -------------------------------------------------------------------------- */

export function openAppealModal(mediaHash) {
  const hashInput = document.getElementById('appealHashInput');
  const modal = document.getElementById('appealModal');
  if (hashInput && modal) {
    hashInput.value = mediaHash || '';
    modal.classList.remove('hidden');
  }
}

export function bindAppealModal() {
  document.getElementById('cancelAppealBtn')?.addEventListener('click', () => {
    document.getElementById('appealModal')?.classList.add('hidden');
  });

  document.getElementById('submitAppealBtn')?.addEventListener('click', async () => {
    const hashInput = document.getElementById('appealHashInput');
    const justificationInput = document.getElementById('appealJustificationInput');
    if (!hashInput || !justificationInput) return;

    const hash = hashInput.value;
    const justification = justificationInput.value.trim();

    if (!justification) {
      alert('Please provide a justification for your appeal.');
      return;
    }

    const success = await submitFlagAppeal(hash, justification);
    if (success) {
      document.getElementById('appealModal')?.classList.add('hidden');
      justificationInput.value = '';
      loadAIAuditLogs();
    } else {
      alert('Appeal failed. You may need to be signed in, or the flag record may be missing.');
    }
  });
}

/* -------------------------------------------------------------------------- */
/* Init                                                                       */
/* -------------------------------------------------------------------------- */

export function initTransparencyPage() {
  bindAppealModal();

  loadTrustMetrics();
  loadTransparencyData();
  loadAIAuditLogs();
  loadChallengesTable();

  window.addEventListener('vocalWitness:posted', () => {
    loadTrustMetrics();
    loadChallengesTable();
  });
}

// Auto-run when this module is imported by transparency.html
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTransparencyPage);
  } else {
    initTransparencyPage();
  }
}

export default {
  initTransparencyPage,
  loadTrustMetrics,
  loadTransparencyData,
  loadAIAuditLogs,
  loadChallengesTable,
  openAppealModal,
};
