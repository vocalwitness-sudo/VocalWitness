// js/forensic-ledger.js
import { db } from './firebase-config.js';
import {
    collection, query, orderBy, limit, onSnapshot, where
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { showToast } from './utils.js';

let unsubscribe = null;
let isInitialized = false;

/**
 * Load Forensic Ledger into the dynamic container
 */
export function loadForensicLedger() {
    const container = document.getElementById('ledgerContainer');
    if (!container) {
        console.error("ledgerContainer not found");
        return;
    }

    if (isInitialized && unsubscribe) {
        unsubscribe();
    }

    container.innerHTML = `
        <div class="text-center py-12 text-zinc-400">
            Loading immutable ledger...
        </div>
    `;

    try {
        const q = query(
            collection(db, "testimonies"),
            where("forensicVerified", "==", true),
            orderBy("timestamp", "desc"),
            limit(15)
        );

        unsubscribe = onSnapshot(q, (snapshot) => {
            container.innerHTML = "";

            if (snapshot.empty) {
                container.innerHTML = `
                    <div class="text-center py-16 text-zinc-400">
                        No verified entries yet.<br>
                        Be the first to publish with Forensic Shield.
                    </div>
                `;
                return;
            }

            snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                const entry = document.createElement('div');
                entry.className = "ledger-entry glass rounded-3xl p-5 border border-emerald-500/20";

                entry.innerHTML = `
                    <div class="flex justify-between items-start">
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-lg">🔒</div>
                            <div>
                                <p class="font-medium">${data.author || 'Anonymous Witness'}</p>
                                <p class="text-xs text-emerald-500">${new Date(data.timestamp?.toDate?.() || data.timestamp).toLocaleString()}</p>
                            </div>
                        </div>
                        <div class="text-right">
                            <span class="text-[10px] uppercase tracking-widest text-emerald-400 bg-emerald-900/50 px-3 py-1 rounded-full">VERIFIED</span>
                        </div>
                    </div>
                    <p class="mt-4 text-zinc-100 leading-relaxed">
                        ${data.content ? data.content.substring(0, 180) + (data.content.length > 180 ? '...' : '') : 'Media Testimony'}
                    </p>
                    
                    ${data.imageUrl ? `<img src="${data.imageUrl}" class="mt-4 rounded-2xl w-full max-h-64 object-cover" alt="Evidence">` : ''}
                    ${data.audioUrl ? `<audio controls class="w-full mt-4"><source src="${data.audioUrl}" type="audio/webm"></audio>` : ''}
                    
                    <div class="flex items-center justify-between text-xs mt-5 pt-4 border-t border-zinc-700 text-zinc-400">
                        <div>Hash: <span class="font-mono text-[10px]">${data.hash ? data.hash.substring(0, 12) + '...' : 'N/A'}</span></div>
                        <button onclick="viewFullEntry('${docSnap.id}')" 
                                class="text-emerald-400 hover:text-emerald-300">View Full Proof →</button>
                    </div>
                `;

                container.appendChild(entry);
            });
        });

        isInitialized = true;

    } catch (error) {
        console.error("Ledger load error:", error);
        container.innerHTML = `<p class="text-red-400 text-center py-12">Failed to load ledger. Please try again later.</p>`;
    }
}

/**
 * Refresh the ledger
 */
export function refreshLedger() {
    if (unsubscribe) unsubscribe();
    loadForensicLedger();
    showToast("Ledger refreshed", "success");
}

/**
 * View full entry (placeholder for future ZK proof modal)
 */
export function viewFullEntry(id) {
    showToast(`Opening full forensic record for ID: ${id}`, "info");
    // TODO: Open modal with ZK proof, full content, signatures, etc.
}

// Cleanup function (important for memory leaks)
export function cleanupLedger() {
    if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
    }
    isInitialized = false;
}

// Make functions available globally for inline onclick handlers
window.refreshLedger = refreshLedger;
window.viewFullEntry = viewFullEntry;
