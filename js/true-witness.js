// js/witness-voice.js - ZK-Verified Testimonies Stream
import { db } from './firebase-config.js';
import { collection, query, where, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

export function initWitnessVoice(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `<div class="text-center py-12 text-zinc-400">Loading Witness Voice ZK-verified records...</div>`;

    // Query testimonies that have a valid ZK proof
    const q = query(
        collection(db, "testimonies"),
        where("hasZKProof", "==", true),
        orderBy("createdAt", "desc")
    );

    onSnapshot(q, (snapshot) => {
        container.innerHTML = '';

        if (snapshot.empty) {
            container.innerHTML = `
                <div class="text-center py-16 text-zinc-400">
                    <p class="text-5xl mb-3">🛡️</p>
                    <p class="font-medium">No Witness Voice records found yet.</p>
                    <p class="text-xs text-zinc-500 mt-1">High-trust cryptographic entries will appear here.</p>
                </div>`;
            return;
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const dateStr = data.createdAt ? new Date(data.createdAt.toDate()).toLocaleString() : 'N/A';

            const div = document.createElement('div');
            div.className = 'glass p-5 rounded-2xl border border-amber-500/30';
            div.innerHTML = `
                <div class="flex justify-between items-start mb-2">
                    <span class="text-xs bg-amber-500/20 text-amber-400 px-2.5 py-1 rounded-full font-medium">🔬 Witness Voice</span>
                    <span class="text-xs text-zinc-500">${dateStr}</span>
                </div>
                <p class="text-zinc-100 leading-relaxed mt-2">${data.text || data.content || ''}</p>
                <div class="mt-4 pt-3 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-400">
                    <span>Witness ID: ${(data.author?.uid || 'Anonymous').substring(0, 8)}...</span>
                    <span class="text-emerald-400 font-mono">Status: Verified</span>
                </div>
            `;
            container.appendChild(div);
        });
    }, (error) => {
        console.error("Witness Voice feed error:", error);
        container.innerHTML = `<p class="text-red-400 text-center py-8">Failed to load cryptographic feed. Check console for index requirements.</p>`;
    });
}
