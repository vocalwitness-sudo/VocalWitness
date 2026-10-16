/**
 * js/transparency.js
 * Production Transparency Dashboard — guest-safe, no private contribution queries.
 * Prove-It-Yourself lab included.
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
import { generateSha256Hash } from './utils.js';

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
    if (typeof value?.toDate === 'function') return value.toDate().toLocaleDateString();
    if (typeof value === 'number') return new Date(value).toLocaleDateString();
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
/* Trust metrics                                                              */
/* -------------------------------------------------------------------------- */

export async function loadTrustMetrics() {
  const trustEl = document.getElementById('trustStatsContainer');
  const disputeEl = document.getElementById('disputeOutcomes');
  const chainHeadEl = document.getElementById('chainHeadDisplay');

  try {
    let m = await getTransparencyMetrics();

    if (!m || !m.disputes) {
      m = m || {};
      try {
        const rows = await listRecentDisputes(200);
        m.disputes = {
          open: rows.filter((x) => x.status === 'OPEN' || x.status === 'PENDING').length,
          upheld: rows.filter((x) => x.status === 'UPHELD' || x.resolution === 'UPHELD').length,
          rejected: rows.filter((x) => x.status === 'REJECTED' || x.resolution === 'REJECTED').length,
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
      m.chain?.status === 'HEALTHY' ? 'Healthy' :
      m.chain?.status === 'BREAKS_DETECTED' ? 'Breaks' :
      m.chain?.status === 'HEALTHY_SHORT' ? 'OK (short)' :
      m.chain?.status === 'RESTRICTED_ACCESS' ? 'Restricted' :
      m.chain?.status || '—';

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

    // Density – honest fallback when no city data yet
    setText('density-enugu', m.density?.enugu != null ? `${m.density.enugu} sealed` : '0 sealed (pilot)');
    setText('density-lagos', m.density?.lagos != null ? `${m.density.lagos} sealed` : '0 sealed (pilot)');

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
/* Support / contributions – guest-safe, non-extorting                        */
/* -------------------------------------------------------------------------- */

export async function loadTransparencyData() {
  const statsEl = document.getElementById('statsContainer');
  const allocEl = document.getElementById('allocationContainer');
  if (!statsEl) return;

  // Never query a private / unruled collection.
  // Honest public message only.
  statsEl.innerHTML = `
    <div class="glass rounded-3xl p-6 text-center md:col-span-3">
      <p class="text-zinc-300 text-sm leading-relaxed">
        The Square is free to use. Optional support keeps servers and legal minimums running.
        <strong class="text-emerald-400">Money never buys voting power or a higher truth rank.</strong>
      </p>
      <p class="text-xs text-zinc-500 mt-3">
        Personal tips stay private. No public dollar totals are shown here.
      </p>
    </div>
  `;

  if (allocEl) {
    allocEl.innerHTML = `
      <p class="text-zinc-400 text-sm leading-relaxed">
        Shared operating costs (hosting, security, legal) are covered by optional support when available.
        There is no public breakdown of individual donations on this page — by design.
      </p>
    `;
  }
}

/* -------------------------------------------------------------------------- */
/* AI flag audit (graceful for guests)                                        */
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
        const status = escapeHtml(log.status || log.details?.status || 'QUARANTINED');
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
    // Guests often cannot read audit_logs — show clean empty state
    tableBody.innerHTML =
      '<tr><td colspan="5" class="p-4 text-center text-zinc-500">No public AI flags at this time (or sign in for full audit view).</td></tr>';
  }
}

/* -------------------------------------------------------------------------- */
/* Challenges table                                                           */
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
      '<tr><td colspan="4" class="p-4 text-center text-zinc-500">Challenges unavailable.</td></tr>';
  }
}

/* -------------------------------------------------------------------------- */
/* External OpenTimestamps Anchor                                             */
/* -------------------------------------------------------------------------- */

export async function loadLatestOtsAnchor() {
  const container = document.getElementById('otsAnchorContainer');
  if (!container) return;

  try {
    const snap = await getDocs(
      query(
        collection(db, 'ledger_anchors'),
        orderBy('createdAt', 'desc'),
        limit(1)
      )
    );

    if (snap.empty) {
      container.innerHTML = `
        <div class="text-zinc-500 text-sm">
          No external anchors published yet. The first daily Merkle root will appear here after the scheduled function runs.
        </div>`;
      return;
    }

    const a = snap.docs[0].data();
    const root = escapeHtml(a.root || '—');
    const date = escapeHtml(a.date || formatDate(a.createdAt));
    const leafCount = Number(a.leafCount || 0).toLocaleString();
    const otsUrl = a.otsUrl || '';
    const previousRoot = a.previousRoot ? escapeHtml(a.previousRoot) : null;

    container.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        <div class="bg-zinc-950/60 border border-zinc-800 rounded-2xl p-4">
          <div class="text-zinc-500 text-[11px] uppercase tracking-wide mb-1">Anchor Date</div>
          <div class="text-white font-semibold">${date}</div>
        </div>
        <div class="bg-zinc-950/60 border border-zinc-800 rounded-2xl p-4">
          <div class="text-zinc-500 text-[11px] uppercase tracking-wide mb-1">Sealed Reports Included</div>
          <div class="text-white font-semibold">${leafCount}</div>
        </div>
      </div>

      <div class="bg-zinc-950/60 border border-zinc-800 rounded-2xl p-4 mt-4">
        <div class="text-zinc-500 text-[11px] uppercase tracking-wide mb-2">Merkle Root (SHA-256)</div>
        <div class="font-mono text-xs text-emerald-400 break-all select-all">${root}</div>
      </div>

      ${previousRoot ? `
        <div class="bg-zinc-950/40 border border-zinc-800/70 rounded-2xl p-3 mt-3">
          <div class="text-zinc-500 text-[10px] uppercase tracking-wide mb-1">Previous Root</div>
          <div class="font-mono text-[10px] text-zinc-500 break-all">${previousRoot}</div>
        </div>` : ''}

      <div class="flex flex-wrap gap-3 mt-5">
        ${otsUrl ? `
          <a href="${escapeHtml(otsUrl)}" 
             download 
             class="inline-flex items-center gap-2 px-4 py-2.5 bg-cyan-900/40 hover:bg-cyan-800/50 border border-cyan-700 text-cyan-300 text-xs font-medium rounded-xl transition">
            📥 Download .ots Receipt
          </a>` : ''}

        <a href="https://opentimestamps.org" 
           target="_blank" 
           rel="noopener"
           class="inline-flex items-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-medium rounded-xl transition">
          🔗 Verify on OpenTimestamps.org
        </a>

        <button type="button" 
                id="copyRootBtn"
                class="inline-flex items-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-xs font-medium rounded-xl transition">
          📋 Copy Root
        </button>
      </div>

      <p class="text-[11px] text-zinc-500 mt-4 leading-relaxed">
        The <code class="text-zinc-400">.ots</code> file contains the cryptographic proof that this Merkle root was submitted to the public OpenTimestamps calendars. 
        You can verify it independently at <a href="https://opentimestamps.org" class="text-cyan-400 hover:underline" target="_blank">opentimestamps.org</a> 
        or with the <code class="text-zinc-400">ots</code> command-line tool.
      </p>
    `;

    // Copy button
    document.getElementById('copyRootBtn')?.addEventListener('click', () => {
      navigator.clipboard.writeText(a.root || '').then(() => {
        const btn = document.getElementById('copyRootBtn');
        if (btn) {
          btn.textContent = '✅ Copied';
          setTimeout(() => { btn.textContent = '📋 Copy Root'; }, 2000);
        }
      });
    });

  } catch (e) {
    console.error('OTS anchor load error:', e);
    container.innerHTML = `
      <div class="text-red-400/80 text-sm">
        Unable to load external anchor data. The collection may not exist yet or rules may restrict public reads.
      </div>`;
  }
}
/* -------------------------------------------------------------------------- */
/* Prove-It-Yourself Lab                                                      */
/* -------------------------------------------------------------------------- */

export async function initProveItLab() {
  const dropZone = document.getElementById('labDropZone');
  const fileInput = document.getElementById('labFileInput');
  const hashBtn = document.getElementById('labHashBtn');
  const localHashEl = document.getElementById('labLocalHash');
  const chainHeadEl = document.getElementById('labChainHead');
  const matchEl = document.getElementById('labMatchResult');
  const copyHash = document.getElementById('labCopyHash');
  const copyHead = document.getElementById('labCopyHead');

  if (!dropZone || !fileInput) return;

  // Load current chain head
  try {
    const health = await getHashChainHealth(30);
    if (health?.headHash && chainHeadEl) {
      chainHeadEl.value = health.headHash;
    } else if (chainHeadEl) {
      chainHeadEl.value = 'Restricted or empty (sign-in may show more)';
    }
  } catch (_) {
    if (chainHeadEl) chainHeadEl.value = 'Unavailable for guests';
  }

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('border-emerald-500', 'bg-emerald-950/30');
  });
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('border-emerald-500', 'bg-emerald-950/30');
  });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-emerald-500', 'bg-emerald-950/30');
    if (e.dataTransfer.files?.[0]) {
      fileInput.files = e.dataTransfer.files;
      hashSelectedFile();
    }
  });

  fileInput.addEventListener('change', hashSelectedFile);
  hashBtn?.addEventListener('click', hashSelectedFile);

  async function hashSelectedFile() {
    const file = fileInput.files?.[0];
    if (!file) return;

    localHashEl.value = 'Computing…';
    matchEl?.classList.add('hidden');

    try {
      const hash = await generateSha256Hash(file);
      localHashEl.value = hash || 'Failed';

      if (hash && chainHeadEl?.value && chainHeadEl.value.length === 64) {
        const match = hash === chainHeadEl.value;
        matchEl.textContent = match
          ? 'Exact match with current chain head.'
          : 'No exact match with head (normal for individual media). Compare against an Evidence Pack mediaHash.';
        matchEl.className = match
          ? 'text-sm font-medium text-emerald-400'
          : 'text-sm font-medium text-zinc-400';
        matchEl.classList.remove('hidden');
      }
    } catch (err) {
      localHashEl.value = 'Error';
      console.warn('Lab hash failed', err);
    }
  }

  copyHash?.addEventListener('click', () => {
    if (localHashEl.value && localHashEl.value.length === 64) {
      navigator.clipboard.writeText(localHashEl.value);
    }
  });
  copyHead?.addEventListener('click', () => {
    if (chainHeadEl.value && chainHeadEl.value.length === 64) {
      navigator.clipboard.writeText(chainHeadEl.value);
    }
  });
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
      alert('Appeal failed. You may need to be signed in.');
    }
  });
}

/* -------------------------------------------------------------------------- */
/* Init                                                                       */
/* -------------------------------------------------------------------------- */

export function initTransparencyPage() {
  bindAppealModal();
  initProveItLab();

  loadTrustMetrics();
  loadTransparencyData();
  loadAIAuditLogs();
  loadChallengesTable();

  window.addEventListener('vocalWitness:posted', () => {
    loadTrustMetrics();
    loadChallengesTable();
  });
}

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
  initProveItLab,
};
