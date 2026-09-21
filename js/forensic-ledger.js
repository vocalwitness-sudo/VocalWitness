// js/forensic-ledger.js
import { db } from './firebase-config.js';
import {
    collection, query, orderBy, limit, onSnapshot, where
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { showToast } from './utils.js';

let unsubscribe = null;
let isInitialized = false;
let isLoading = false;

/**
 * Escape user-controlled content to prevent XSS
 */
function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Safely format timestamp values from Firestore Timestamps or JS numbers
 */
function formatTimestamp(ts) {
    try {
        if (!ts) return 'Unknown time';
        if (typeof ts.toDate === 'function') return ts.toDate().toLocaleString();
        const d = new Date(ts);
        return isNaN(d.getTime()) ? 'Unknown time' : d.toLocaleString();
    } catch {
        return 'Unknown time';
    }
}

/**
 * Shorten hash for display
 */
function shortHash(hash, len = 16) {
    if (!hash || typeof hash !== 'string') return 'N/A';
    return hash.length > len ? hash.substring(0, len) + '…' : hash;
}

/**
 * Copy full hash to clipboard
 */
async function copyFullHash(hash) {
    try {
        await navigator.clipboard.writeText(hash);
        if (typeof showToast === 'function') showToast('Full cryptographic hash copied', 'success');
    } catch {
        if (typeof showToast === 'function') showToast('Could not copy hash', 'error');
    }
}

/**
 * Render a single forensic entry
 */
function renderEntry(docSnap) {
    const data = docSnap.data() || {};
    const id = docSnap.id;

    const content = data.content || '';
    const preview = content.length > 180
        ? content.substring(0, 180) + '…'
        : (content || 'Media Testimony');

    const hash     = data.hash || data.contentHash || '';
    const prevHash = data.prevHash || data.previousHash || '';
    const hasZk    = !!(data.zkProof || data.zkVerified || data.witnessVoice || data.trueWitness);
    const author   = data.author || data.displayName || 'Anonymous Witness';

    const entry = document.createElement('div');
    entry.className = 'ledger-entry glass rounded-3xl p-5 border border-emerald-500/20';
    entry.dataset.id = id;

    entry.innerHTML = `
        <div class="flex justify-between items-start gap-3">
            <div class="flex items-center gap-3 min-w-0">
                <div class="w-8 h-8 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-lg shrink-0">🔒</div>
                <div class="min-w-0">
                    <p class="font-medium truncate">${escapeHtml(author)}</p>
                    <p class="text-xs text-emerald-500">${formatTimestamp(data.timestamp)}</p>
                </div>
            </div>
            <div class="text-right shrink-0 space-y-1">
                <span class="text-[10px] uppercase tracking-widest text-emerald-400 bg-emerald-900/50 px-3 py-1 rounded-full block">
                    FORENSIC
                </span>
                ${hasZk ? '<span class="text-[10px] text-teal-400 block">ZK Proof</span>' : ''}
            </div>
        </div>

        <p class="mt-4 text-zinc-100 leading-relaxed">${escapeHtml(preview)}</p>

        ${data.imageUrl ? `<img src="${escapeHtml(data.imageUrl)}" class="mt-4 rounded-2xl w-full max-h-64 object-cover" alt="Evidence" loading="lazy">` : ''}
        ${data.audioUrl ? `<audio controls class="w-full mt-4" preload="none"><source src="${escapeHtml(data.audioUrl)}" type="audio/webm"></audio>` : ''}

        <div class="mt-5 pt-4 border-t border-zinc-700 space-y-2 text-xs text-zinc-400">
            <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                    <span>Hash:</span>
                    <span class="font-mono text-[10px] text-emerald-400/90 ml-1">${shortHash(hash, 18)}</span>
                </div>
                ${hash ? `
                <button type="button"
                        class="text-emerald-400 hover:text-emerald-300 shrink-0"
                        data-action="copy-hash"
                        data-hash="${escapeHtml(hash)}"
                        title="Copy full cryptographic hash"
                        aria-label="Copy full hash">
                    📋
                </button>` : ''}
            </div>

            ${prevHash ? `
            <div class="text-[11px]">
                <span class="text-zinc-500">Prev hash:</span>
                <span class="font-mono text-zinc-500">${shortHash(prevHash, 14)}</span>
            </div>` : ''}

            <div class="flex items-center justify-between pt-1">
                <span class="text-[11px] text-zinc-500">ID: ${escapeHtml(id.substring(0, 12))}…</span>
                <button type="button"
                        data-action="view-proof"
                        data-id="${escapeHtml(id)}"
                        class="text-emerald-400 hover:text-emerald-300 font-medium">
                    View Full Proof →
                </button>
            </div>
        </div>
    `;

    return entry;
}

/**
 * Update the live chain-health summary (if elements exist on the page)
 */
function updateChainHealth(count, latestHash) {
    const countEl  = document.getElementById('entryCount');
    const hashEl   = document.getElementById('latestHashPreview');
    const statusEl = document.getElementById('chainStatus');

    if (countEl)  countEl.textContent = count;
    if (hashEl)   hashEl.textContent  = shortHash(latestHash, 18);

    if (statusEl) {
        if (count === 0) {
            statusEl.textContent = '● No entries yet';
            statusEl.className = 'text-zinc-500';
        } else {
            statusEl.textContent = '● Chain healthy';
            statusEl.className = 'text-emerald-400';
        }
    }
}

/**
 * Load Forensic Ledger into the dynamic container
 */
export function loadForensicLedger() {
    const container = document.getElementById('ledgerContainer');
    if (!container) {
        console.error('ledgerContainer element not found in DOM');
        return;
    }

    if (isLoading) return;
    isLoading = true;

    // Clean previous listener
    if (unsubscribe) {
        try { unsubscribe(); } catch (_) {}
        unsubscribe = null;
    }

    container.innerHTML = `
        <div class="text-center py-12 text-zinc-400">
            Loading forensic ledger…
        </div>
    `;

    try {
        const q = query(
            collection(db, "testimonies"),
            where("forensicVerified", "==", true),
            orderBy("timestamp", "desc"),
            limit(20)
        );

        unsubscribe = onSnapshot(q, (snapshot) => {
            container.innerHTML = '';
            const count = snapshot.size;

            if (snapshot.empty) {
                updateChainHealth(0, '');
                container.innerHTML = `
                    <div class="text-center py-16 text-zinc-400">
                        <div class="text-4xl mb-3">📜</div>
                        <p>No forensic entries yet.</p>
                        <p class="text-sm text-zinc-500 mt-1">Be the first to publish with Forensic Shield / Witness Voice.</p>
                    </div>
                `;
                isLoading = false;
                return;
            }

            let firstHash = '';
            snapshot.forEach((docSnap, index) => {
                if (index === 0) {
                    const d = docSnap.data() || {};
                    firstHash = d.hash || d.contentHash || '';
                }
                container.appendChild(renderEntry(docSnap));
            });

            updateChainHealth(count, firstHash);
            isLoading = false;
            isInitialized = true;

        }, (error) => {
            console.error('Ledger snapshot error:', error);
            container.innerHTML = `
                <p class="text-red-400 text-center py-12">
                    Failed to load forensic ledger. Please check network or permissions.
                </p>
            `;
            updateChainHealth(0, '');
            const statusEl = document.getElementById('chainStatus');
            if (statusEl) {
                statusEl.textContent = '● Error';
                statusEl.className = 'text-red-400';
            }
            isLoading = false;
        });

    } catch (error) {
        console.error('Ledger query initialization error:', error);
        container.innerHTML = `
            <p class="text-red-400 text-center py-12">
                Failed to initialize forensic ledger.
            </p>
        `;
        isLoading = false;
    }
}

/**
 * Refresh the ledger
 */
export function refreshLedger() {
    loadForensicLedger();
    if (typeof showToast === 'function') {
        showToast('Forensic ledger refreshed', 'success');
    }
}

/**
 * Open the full forensic proof / verifier page
 * Name must do what it says.
 */
export function viewFullEntry(id) {
    if (!id) return;
    // Real navigation – this is what “View Full Proof” means
    window.location.href = `verify.html?id=${encodeURIComponent(id)}`;
}

/**
 * Cleanup snapshot listeners to prevent memory leaks
 */
export function cleanupLedger() {
    if (unsubscribe) {
        try { unsubscribe(); } catch (_) {}
        unsubscribe = null;
    }
    isInitialized = false;
    isLoading = false;
}

// -------------------------------------------------------
// Auto-initialize when this module is loaded on the ledger page
// -------------------------------------------------------
if (document.getElementById('ledgerContainer')) {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('📜 Forensic Ledger module loaded (name-aligned)');

        loadForensicLedger();

        // Back button (supports both id="backBtn" and data-action="back")
        document.getElementById('backBtn')?.addEventListener('click', () => {
            if (window.history.length > 1) window.history.back();
            else window.location.href = 'index.html';
        });

        document.addEventListener('click', (e) => {
            if (e.target.closest('[data-action="back"]')) {
                e.preventDefault();
                if (window.history.length > 1) window.history.back();
                else window.location.href = 'index.html';
            }
        });

        // Refresh button
        document.getElementById('refreshLedgerBtn')?.addEventListener('click', refreshLedger);

        // Event delegation for dynamic buttons
        const container = document.getElementById('ledgerContainer');
        if (container) {
            container.addEventListener('click', (e) => {
                // Copy full hash
                const copyBtn = e.target.closest('[data-action="copy-hash"]');
                if (copyBtn) {
                    const hash = copyBtn.getAttribute('data-hash');
                    if (hash) copyFullHash(hash);
                    return;
                }

                // View Full Proof → real navigation
                const viewBtn = e.target.closest('[data-action="view-proof"]');
                if (viewBtn) {
                    const id = viewBtn.getAttribute('data-id');
                    viewFullEntry(id);
                }
            });
        }
    });

    // Cleanup on page unload
    window.addEventListener('beforeunload', cleanupLedger);
}
