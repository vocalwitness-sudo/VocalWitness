// js/ui-components.js - Advanced Radial Tier Circles & Forensic Renderers

export function renderTierCircle(tier = 'citizen', reputation = 0) {
    let percentage = 0;
    let color = '#64748b';
    let emblem = '👤';

    if (tier === 'citizen_circle') {
        percentage = 75;
        color = '#10b981';
        emblem = '🛡️';
    } else if (tier === 'witness_circle') {
        percentage = Math.min(100, Math.floor((reputation / 300) * 100));
        color = '#8b5cf6';
        emblem = '🔐';
    } else {
        percentage = Math.min(45, Math.floor((reputation / 100) * 100));
    }

    return `
        <div class="relative w-12 h-12 flex items-center justify-center flex-shrink-0">
            <svg class="w-12 h-12 -rotate-90 transition-all" viewBox="0 0 42 42">
                <circle cx="21" cy="21" r="15" fill="none" stroke="#1f2937" stroke-width="5"></circle>
                <circle
                    cx="21" cy="21" r="15"
                    fill="none"
                    stroke="${color}"
                    stroke-width="5"
                    stroke-dasharray="${percentage * 0.94} 94"
                    stroke-linecap="round"
                    class="transition-all duration-700"
                ></circle>
            </svg>
            <div class="absolute text-center">
                <div class="text-2xl leading-none">${emblem}</div>
            </div>
        </div>
    `;
}

export function updateTierBadge(containerId, tier, reputation) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.style.transition = "opacity 0.4s ease";
    container.style.opacity = 0;

    setTimeout(() => {
        container.innerHTML = renderTierCircle(tier, reputation);
        container.style.opacity = 1;
    }, 100);
}

/**
 * Renders Forensic Chips, ZK Proof status, and copyable SHA-256 hashes for Witness Voice posts.
 * @param {Object} post - Firestore testimony document
 * @returns {string} HTML string containing forensic badges
 */
export function renderForensicChips(post = {}) {
    const isWitness = post.targetFeed === 'witness_voice' || post.channel === 'witness_voice' || post.isWitnessVoice === true;
    const hash = post.forensicHash || post.imageHash || post.audioHash || null;
    const isZk = post.zkVerified || post.hasZkProof || false;

    if (!isWitness && !hash && !isZk) return '';

    const truncatedHash = hash ? `${hash.substring(0, 8)}...${hash.substring(hash.length - 8)}` : null;

    return `
        <div class="mt-3 pt-2 border-t border-slate-800/80 flex flex-wrap items-center gap-2 text-xs">
            ${isWitness ? `
                <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
                    Witness Voice
                </span>
            ` : ''}
            ${isZk ? `
                <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md font-medium bg-purple-500/10 text-purple-300 border border-purple-500/30">
                    <span class="text-xs">🔐</span> ZK-Verified
                </span>
            ` : ''}
            ${hash ? `
                <button
                    type="button"
                    data-copy-hash="${hash}"
                    class="copy-hash-btn inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md font-mono bg-slate-900 text-slate-300 border border-slate-700 hover:border-emerald-500 hover:text-emerald-400 transition cursor-pointer"
                    title="Click to copy full SHA-256 hash"
                >
                    <svg class="w-3 h-3 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                    <span>${truncatedHash}</span>
                </button>
            ` : ''}
        </div>
    `;
}

// Delegate click listener for all dynamic SHA-256 hash copy buttons
if (typeof window !== 'undefined' && !window.__hashCopyListenerAttached) {
    window.__hashCopyListenerAttached = true;

    /**
     * Copy text to clipboard with modern API + legacy fallback.
     * @param {string} text
     * @returns {Promise<boolean>} true if copy succeeded
     */
    async function copyToClipboard(text) {
        if (!text) return false;

        // Modern Clipboard API (requires secure context: https or localhost)
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch (err) {
                console.warn('Clipboard API failed, trying fallback:', err?.message || err);
            }
        }

        // Fallback for older browsers / denied permission / non-secure context
        try {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.setAttribute('readonly', '');
            textarea.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
            document.body.appendChild(textarea);
            textarea.select();
            textarea.setSelectionRange(0, text.length);
            const ok = document.execCommand('copy');
            document.body.removeChild(textarea);
            return ok;
        } catch (err) {
            console.error('Clipboard fallback failed:', err);
            return false;
        }
    }

    document.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-copy-hash]');
        if (!btn) return;

        e.preventDefault();
        e.stopPropagation();

        const hashText = btn.getAttribute('data-copy-hash');
        if (!hashText) return;

        // Prevent double-clicks while copying
        if (btn.dataset.copying === '1') return;
        btn.dataset.copying = '1';

        const originalHTML = btn.innerHTML;

        try {
            const success = await copyToClipboard(hashText);

            if (success) {
                btn.innerHTML = `<span>✅ Copied!</span>`;
                btn.classList.add('border-emerald-500', 'text-emerald-400');
                if (typeof window.showToast === 'function') {
                    window.showToast('Hash copied to clipboard', 'success');
                }
            } else {
                btn.innerHTML = `<span>❌ Copy failed</span>`;
                btn.classList.add('border-red-500', 'text-red-400');
                if (typeof window.showToast === 'function') {
                    window.showToast('Could not copy. Select and copy manually.', 'error');
                } else {
                    // Last resort: show the hash so user can copy manually
                    window.prompt('Copy this hash manually:', hashText);
                }
            }
        } catch (err) {
            console.error('Copy handler error:', err);
            btn.innerHTML = `<span>❌ Error</span>`;
            btn.classList.add('border-red-500', 'text-red-400');
        } finally {
            setTimeout(() => {
                btn.innerHTML = originalHTML;
                btn.classList.remove(
                    'border-emerald-500', 'text-emerald-400',
                    'border-red-500', 'text-red-400'
                );
                delete btn.dataset.copying;
            }, 1800);
        }
    });
}
/**
 * Renders HTML string for a user's Tier / Level badge.
 * Used by profile.js and UI components.
 * @param {Object} tierData - Result object from getUserTierData()
 * @returns {string} Formatted HTML badge string
 */
export function renderTierBadge(tierData = {}) {
    if (!tierData || Object.keys(tierData).length === 0) {
        return `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20">👤 Citizen</span>`;
    }

    const { level, metadata } = tierData;

    if (level) {
        return `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold shadow-sm text-white transition-all duration-200" style="background-color: ${level.color}">
            <span>${level.emblem}</span> <span>${level.name}</span>
        </span>`;
    }

    const badgeText = metadata?.badge || '👤 Citizen';
    return `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">${badgeText}</span>`;
}

/**
 * Confirmation modal when switching from ZK-Anonymous → Bold Witness mode.
 * Required by profile.js (ProfileManager.bindEvents).
 * @param {Function} onConfirm - async/sync callback after user confirms
 */
export function showBoldWitnessModal(onConfirm) {
    document.getElementById('boldWitnessModal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'boldWitnessModal';
    modal.className = 'fixed inset-0 z-[10020] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'boldWitnessTitle');

    modal.innerHTML = `
      <div class="w-full max-w-md rounded-3xl border border-amber-500/40 bg-zinc-900 p-6 text-white shadow-2xl relative">
        <!-- Close / Exit Button -->
        <button type="button" id="boldWitnessCloseTop" class="absolute top-4 right-4 text-zinc-400 hover:text-white p-1 rounded-lg hover:bg-zinc-800 transition" aria-label="Close modal">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>

        <div class="mb-4 flex items-start gap-3 pr-6">
          <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/20 text-2xl" aria-hidden="true">👁️</div>
          <div>
            <h3 id="boldWitnessTitle" class="text-lg font-bold text-amber-400">Switch to Bold Witness?</h3>
            <p class="mt-1 text-sm text-zinc-400">
              Your display name and profile will be visible on public testimonies.
              You can switch back to ZK-Anonymous anytime.
            </p>
          </div>
        </div>
        <ul class="mb-5 space-y-1.5 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-400">
          <li>• Real name / handle shown on posts</li>
          <li>• Stronger public accountability</li>
          <li>• Privacy Shield can still hide location</li>
        </ul>
        <div class="flex gap-3">
          <button type="button" id="boldWitnessConfirm"
                class="flex-1 rounded-xl bg-amber-500 py-3 text-sm font-bold text-black transition hover:bg-amber-400">
            Activate Bold Witness
          </button>
          <button type="button" id="boldWitnessCancel"
                class="rounded-xl bg-zinc-800 px-5 py-3 text-sm font-semibold text-zinc-300 transition hover:bg-zinc-700">
            Cancel
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const close = () => {
        modal.remove();
        document.removeEventListener('keydown', onKey);
    };

    const onKey = (e) => {
        if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);

    modal.querySelector('#boldWitnessCancel')?.addEventListener('click', close);
    modal.querySelector('#boldWitnessCloseTop')?.addEventListener('click', close); // Added listener
    modal.addEventListener('click', (e) => {
        if (e.target === modal) close();
    });

    modal.querySelector('#boldWitnessConfirm')?.addEventListener('click', async () => {
        close();
        if (typeof onConfirm === 'function') {
            try {
                await onConfirm();
            } catch (err) {
                console.error('Bold Witness confirm error:', err);
            }
        }
    });
}
// Global window exports
if (typeof window !== 'undefined') {
    window.renderTierBadge = renderTierBadge;
    window.showBoldWitnessModal = showBoldWitnessModal;
}
