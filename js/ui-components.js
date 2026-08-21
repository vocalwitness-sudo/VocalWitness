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
            <!-- Channel / Mode Indicator -->
            ${isWitness ? `
                <span class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
                    Witness Voice
                </span>
            ` : ''}

            <!-- ZK Proof Verification Badge -->
            ${isZk ? `
                <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md font-medium bg-purple-500/10 text-purple-300 border border-purple-500/30">
                    <span class="text-xs">🔐</span> ZK-Verified
                </span>
            ` : ''}

            <!-- Copyable SHA-256 Evidence Hash Chip -->
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
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-copy-hash]');
        if (!btn) return;
        
        e.preventDefault();
        const hashText = btn.getAttribute('data-copy-hash');
        if (hashText) {
            navigator.clipboard.writeText(hashText).then(() => {
                const originalHTML = btn.innerHTML;
                btn.innerHTML = `<span>✅ Copied!</span>`;
                btn.classList.add('border-emerald-500', 'text-emerald-400');
                setTimeout(() => {
                    btn.innerHTML = originalHTML;
                    btn.classList.remove('border-emerald-500', 'text-emerald-400');
                }, 1800);
            }).catch(err => console.error('Failed to copy hash:', err));
        }
    });
}
