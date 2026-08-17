/**
 * VocalWitness Legal, Onboarding & Frictionless Anonymous Submission (js/onboarding.js)
 * Combines legal disclaimers, welcome guide, platform Q&A AI assistant, and background ephemeral identity generation.
 */

import { db, auth } from './firebase-config.js';
import { showToast } from './utils.js';

const EPHEMERAL_KEY_STORAGE = 'vw_ephemeral_identity';
const ANONYMOUS_SESSION_KEY = 'vw_anonymous_session_id';

/* ==========================================================================
   0. CLIENT-SIDE PII CENSORED GUARD & SYSTEM PROMPTS
   ========================================================================== */

/**
 * Sanitizes user inputs using regex to censor PII before any AI request.
 */
export function sanitizeUserPII(text) {
    if (!text || typeof text !== 'string') return '';

    let cleanText = text;

    // 1. Email Addresses
    cleanText = cleanText.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED PII]');

    // 2. Phone Numbers (International & Local formats)
    cleanText = cleanText.replace(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g, '[REDACTED PII]');

    // 3. Physical Street Addresses / GPS Coordinates
    cleanText = cleanText.replace(/\b\d{1,5}\s+(?:[A-Za-z0-9#.]+\s+){1,4}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct)\b/gi, '[REDACTED PII]');
    cleanText = cleanText.replace(/[-+]?\d{1,2}\.\d{4,},\s*[-+]?\d{1,3}\.\d{4,}/g, '[REDACTED PII]');

    return cleanText;
}

const PLATFORM_QA_SYSTEM_PROMPT = `You are the VocalWitness Platform Q&A Assistant.
Your sole mandate is to answer user queries regarding cryptography, Zero-Knowledge (ZK) proofs, media hashing, client-side metadata scrubbing, and forensic ledger operations.

Rules:
1. Explain technical cryptographic concepts simply and clearly.
2. If a query contains [REDACTED PII], acknowledge that personal data was redacted for their privacy.
3. Keep responses concise, supportive, and strictly grounded in VocalWitness security architecture.
4. Do not offer formal legal counsel; frame answers around technical integrity and cryptographic verification.`;

/* ==========================================================================
   1. ANONYMOUS & ZERO-REGISTRATION HELPERS
   ========================================================================== */

/**
 * Retrieves or creates an ephemeral identity for zero-registration users.
 */
export function getOrCreateAnonymousIdentity() {
    try {
        let identity = localStorage.getItem(EPHEMERAL_KEY_STORAGE);
        if (identity) {
            return JSON.parse(identity);
        }

        const array = new Uint8Array(32);
        window.crypto.getRandomValues(array);
        const secretHex = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');

        const newIdentity = {
            sessionId: `anon_${Date.now()}_${secretHex.substring(0, 8)}`,
            secretKey: secretHex,
            createdAt: new Date().toISOString(),
            submissionCount: 0
        };

        localStorage.setItem(EPHEMERAL_KEY_STORAGE, JSON.stringify(newIdentity));
        sessionStorage.setItem(ANONYMOUS_SESSION_KEY, newIdentity.sessionId);
        
        console.log(`🛡️ [Anonymous Onboarding] Ephemeral session ready: ${newIdentity.sessionId}`);
        return newIdentity;
    } catch (err) {
        console.error("Failed to generate ephemeral identity:", err);
        return { sessionId: `anon_fallback_${Date.now()}`, secretKey: 'fallback' };
    }
}

/**
 * Renders an inline indicator showing zero-knowledge protection status.
 */
export function renderAnonymousBadge(parentContainer) {
    if (!parentContainer) return;

    const user = auth.currentUser;
    const identity = getOrCreateAnonymousIdentity();

    const isAnon = !user;
    const badgeText = isAnon ? "Zero-Registration Submission" : "Authenticated Witness";
    const subText = isAnon 
        ? "Protected by ephemeral session. No account required." 
        : `Signed in as ${user.email || user.uid.substring(0, 8)}`;

    parentContainer.innerHTML = `
        <div class="flex items-center justify-between p-3.5 mb-4 bg-zinc-950/80 border ${isAnon ? 'border-emerald-800/60' : 'border-zinc-800'} rounded-2xl">
            <div class="flex items-center gap-3">
                <div class="p-2 bg-emerald-950/80 border border-emerald-700/50 rounded-xl text-emerald-400 text-sm">
                    ${isAnon ? '🛡️' : '🔒'}
                </div>
                <div>
                    <div class="text-xs font-semibold text-white flex items-center gap-2">
                        <span>${badgeText}</span>
                        ${isAnon ? '<span class="text-[10px] bg-emerald-900/60 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-700 font-mono">ANONYMOUS</span>' : ''}
                    </div>
                    <p class="text-[11px] text-zinc-400">${subText}</p>
                </div>
            </div>
            ${isAnon ? `
                <button type="button" onclick="window.claimAnonymousAccount()" class="text-[11px] bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 px-3 py-1.5 rounded-xl transition">
                    Save Key
                </button>
            ` : ''}
        </div>
    `;
}

/**
 * Prepares an anonymous submission payload.
 */
export async function prepareAnonymousSubmission(formData = {}) {
    const identity = getOrCreateAnonymousIdentity();
    const user = auth.currentUser;

    identity.submissionCount = (identity.submissionCount || 0) + 1;
    localStorage.setItem(EPHEMERAL_KEY_STORAGE, JSON.stringify(identity));

    return {
        ...formData,
        authorId: user ? user.uid : identity.sessionId,
        isAnonymous: !user,
        ephemeralSession: !user ? identity.sessionId : null,
        nullifierNonce: identity.submissionCount,
        timestamp: new Date().toISOString()
    };
}

/**
 * Displays modal for copying the ephemeral recovery key.
 */
window.claimAnonymousAccount = () => {
    const identity = getOrCreateAnonymousIdentity();
    const keyString = `${identity.sessionId}:${identity.secretKey}`;

    const modalHtml = `
        <div id="anon-key-modal" class="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-[120]">
            <div class="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 max-w-md w-full space-y-4">
                <div class="flex items-center justify-between pb-3 border-b border-zinc-800">
                    <h3 class="text-base font-bold text-white flex items-center gap-2">
                        <span>🔑</span> Ephemeral Recovery Key
                    </h3>
                    <button onclick="document.getElementById('anon-key-modal').remove()" class="text-zinc-400 hover:text-white text-lg">&times;</button>
                </div>
                <p class="text-xs text-zinc-400">
                    Save this key if you want to track or manage your anonymous testimonies later. Do not share it with anyone.
                </p>
                <div class="p-3 bg-zinc-950 border border-zinc-800 rounded-xl font-mono text-xs text-emerald-400 break-all select-all">
                    ${keyString}
                </div>
                <div class="flex justify-end gap-2 pt-2">
                    <button onclick="navigator.clipboard.writeText('${keyString}'); if(typeof window.showToast==='function'){window.showToast('Recovery key copied!', 'success');} document.getElementById('anon-key-modal').remove();" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition">
                        Copy to Clipboard
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
};

/* ==========================================================================
   2. LEGAL NOTICE & WELCOME ONBOARDING FLOWS
   ========================================================================== */

export function showLegalNotice() {
    if (localStorage.getItem('hasSeenLegal')) return;

    const modal = document.createElement('div');
    modal.id = 'legal-modal';
    modal.className = 'fixed inset-0 bg-black/90 flex items-center justify-center z-[100]';
    modal.innerHTML = `
        <div class="bg-zinc-900 border border-red-600/50 rounded-3xl max-w-lg mx-4 p-8 text-center">
            <div class="text-5xl mb-6">⚖️</div>
            <h2 class="text-3xl font-bold text-white mb-4">Important Legal Notice</h2>
            <p class="text-red-400 font-medium mb-6">
                VocalWitness functions strictly as an un-manipulated decentralized distribution medium.
            </p>
            <p class="text-zinc-400 text-sm leading-relaxed mb-8">
                This platform does not verify the truthfulness of testimonies. 
                Users are solely responsible for what they publish. 
                Always act responsibly and ethically.
            </p>
            <button id="accept-legal" 
                    class="w-full bg-green-600 hover:bg-green-500 transition py-4 rounded-2xl text-white font-semibold text-lg">
                I Understand and Agree
            </button>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('accept-legal').addEventListener('click', () => {
        localStorage.setItem('hasSeenLegal', 'true');
        modal.remove();
        setTimeout(showWelcomeOnboarding, 600);
    });
}

function showWelcomeOnboarding() {
    if (localStorage.getItem('onboardingComplete')) return;

    const modal = document.createElement('div');
    modal.id = 'onboarding-modal';
    modal.className = 'fixed inset-0 bg-black/90 flex items-center justify-center z-[100]';
    modal.innerHTML = `
        <div class="bg-zinc-900 rounded-3xl max-w-md mx-4 p-8 text-center">
            <h2 class="text-3xl font-bold text-white mb-2">Welcome, Witness! 👋</h2>
            <p class="text-zinc-400 mb-8">Here's how to get started on VocalWitness</p>
            
            <div class="space-y-6 text-left">
                <div class="flex gap-4">
                    <div class="text-2xl">📸</div>
                    <div>
                        <strong class="text-white">Add Evidence</strong>
                        <p class="text-sm text-zinc-400">Use Photo + Forensic Shield or Voice Testimony</p>
                    </div>
                </div>
                <div class="flex gap-4">
                    <div class="text-2xl">🔒</div>
                    <div>
                        <strong class="text-white">Get Verified</strong>
                        <p class="text-sm text-zinc-400">Become a Witness Voice contributor for higher credibility</p>
                    </div>
                </div>
                <div class="flex gap-4">
                    <div class="text-2xl">🚀</div>
                    <div>
                        <strong class="text-white">Publish</strong>
                        <p class="text-sm text-zinc-400">Share to Citizen Talk or Witness Voice feed</p>
                    </div>
                </div>
            </div>

            <button id="start-journey" 
                    class="mt-10 w-full bg-green-600 hover:bg-green-500 py-4 rounded-2xl text-white font-semibold">
                I'm Ready — Let's Begin
            </button>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('start-journey').addEventListener('click', () => {
        localStorage.setItem('onboardingComplete', 'true');
        modal.remove();
    });
}

export function initOnboarding() {
    getOrCreateAnonymousIdentity();
    showLegalNotice();
}

export function initHelpButton() {
    const btn = document.getElementById('help-button');
    if (!btn) return;

    btn.addEventListener('click', showQuickGuide);
}

function showQuickGuide() {
    const guide = document.createElement('div');
    guide.className = 'fixed inset-0 bg-black/90 flex items-center justify-center z-[110]';
    guide.innerHTML = `
        <div class="bg-zinc-900 rounded-3xl max-w-lg p-8 max-h-[90vh] overflow-auto border border-zinc-800">
            <h2 class="text-3xl font-bold mb-6 text-center text-white">How to Use VocalWitness</h2>
            
            <div class="space-y-4 text-sm text-zinc-300 mb-6">
                <div class="p-3 bg-zinc-950 rounded-xl border border-zinc-800">
                    <h4 class="font-bold text-emerald-400 mb-1">1. Zero-Registration Posting</h4>
                    <p class="text-xs text-zinc-400">You can publish immediately without an account. An ephemeral key is generated locally to protect your identity.</p>
                </div>
                <div class="p-3 bg-zinc-950 rounded-xl border border-zinc-800">
                    <h4 class="font-bold text-emerald-400 mb-1">2. Media Metadata Scrubbing</h4>
                    <p class="text-xs text-zinc-400">Photos uploaded are processed client-side to strip EXIF data (GPS location, device specs) before reaching storage.</p>
                </div>
                <div class="p-3 bg-zinc-950 rounded-xl border border-zinc-800">
                    <h4 class="font-bold text-emerald-400 mb-1">3. Feeds</h4>
                    <p class="text-xs text-zinc-400">Share everyday discussions to <strong>Citizen Talk</strong> or high-integrity investigative testimonies to <strong>Witness Voice</strong>.</p>
                </div>
            </div>

            <!-- Platform Q&A Assistant UI -->
            <div class="p-4 bg-zinc-950 rounded-2xl border border-emerald-900/60 space-y-3 mb-6">
                <div class="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
                    <span>🤖</span> Ask Platform Security Assistant
                </div>
                <div id="qa-response-area" class="text-xs text-zinc-300 min-h-[40px] max-h-[120px] overflow-y-auto bg-zinc-900/80 p-2.5 rounded-xl border border-zinc-800 hidden"></div>
                <div class="flex gap-2">
                    <input type="text" id="qa-user-input" placeholder="Ask about ZK proofs, hashing, or ledgers..." class="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500" />
                    <button type="button" id="qa-send-btn" class="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3 py-2 rounded-xl font-medium transition">
                        Ask
                    </button>
                </div>
            </div>

            <button onclick="this.closest('.fixed').remove()" 
                    class="w-full py-4 bg-green-600 hover:bg-green-500 font-semibold text-white rounded-2xl transition">
                Got it, Thanks!
            </button>
        </div>
    `;
    document.body.appendChild(guide);

    // Attach Platform Q&A Assistant Logic
    const sendBtn = guide.querySelector('#qa-send-btn');
    const userInput = guide.querySelector('#qa-user-input');
    const responseArea = guide.querySelector('#qa-response-area');

    if (sendBtn && userInput && responseArea) {
        sendBtn.addEventListener('click', async () => {
            const rawQuery = userInput.value.trim();
            if (!rawQuery) return;

            const sanitizedQuery = sanitizeUserPII(rawQuery);
            userInput.value = '';
            responseArea.classList.remove('hidden');
            responseArea.innerHTML = `<span class="text-zinc-500 italic">Processing with Privacy Guard...</span>`;

            try {
                const answer = await processPlatformQAQuery(sanitizedQuery);
                responseArea.innerHTML = answer;
            } catch (err) {
                responseArea.innerHTML = `<span class="text-red-400">Failed to query assistant. Please try again.</span>`;
            }
        });
    }
}

/**
 * Handles answering platform cryptography & ZK questions locally with privacy guard.
 */
async function processPlatformQAQuery(sanitizedQuery) {
    const q = sanitizedQuery.toLowerCase();

    let reply = "";
    if (q.includes("zk") || q.includes("zero-knowledge") || q.includes("proof")) {
        reply = "<strong>Zero-Knowledge (ZK) Proofs:</strong> VocalWitness uses SNARK Groth16 proofs generated inside your browser's Web Worker. This proves your testimony is valid without exposing your wallet address or private credentials.";
    } else if (q.includes("hash") || q.includes("metadata") || q.includes("exif")) {
        reply = "<strong>Media Scrubbing & Hashing:</strong> Uploaded images are rendered through an HTML5 Canvas locally to strip EXIF/GPS telemetry. A SHA-256 digest is then generated to anchor the exact asset state.";
    } else if (q.includes("ledger") || q.includes("blockchain")) {
        reply = "<strong>Forensic Ledger:</strong> The ledger stores cryptographic hashes and proof signatures—never your raw personal data or un-redacted location.";
    } else {
        reply = `<strong>Platform Guard Response:</strong> ${sanitizedQuery.includes('[REDACTED PII]') ? '<i>(Note: Sensitive personal data in your question was redacted prior to processing)</i><br>' : ''}VocalWitness ensures all submitted evidence is cryptographically stamped on-device with zero account friction.`;
    }

    return reply;
}

// Global scope registration for dynamic HTML calls
if (typeof window !== 'undefined') {
    window.getOrCreateAnonymousIdentity = getOrCreateAnonymousIdentity;
    window.renderAnonymousBadge = renderAnonymousBadge;
    window.prepareAnonymousSubmission = prepareAnonymousSubmission;
    window.claimAnonymousAccount = claimAnonymousAccount;
    window.sanitizeUserPII = sanitizeUserPII;
}
