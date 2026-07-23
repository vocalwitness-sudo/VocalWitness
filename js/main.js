// js/main.js - Polished & Robust Main Entry Point
import './app-state.js';
import { initAuth, requireAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db, auth, storage } from './firebase-config.js';
import { initLanguage } from './i18n.js';
import * as mediaModule from './media.js';
import { CitizenTalkEngine } from '../vocalWitnessEngine.js';
import { initProfile } from './profile.js';
import { loadDynamicNavigation } from './navigation.js';
import { AppState } from './app-state.js';
import { showToast } from './utils.js';
import './composer.js';

let engineInstance = null;
let isInitialized = false;
let listenersInitialized = false;

// ====================== TAB SWITCHING ======================
window.switchTab = async (tab) => {
    console.log(`Switching to tab: ${tab}`);

    // Update active tab UI
    document.querySelectorAll('#main-nav button[data-tab]').forEach(btn => {
        btn.classList.remove('active', 'bg-amber-900', 'text-amber-300');
        if (btn.dataset.tab === tab) {
            btn.classList.add('active');
            if (tab === 'witness') btn.classList.add('bg-amber-900', 'text-amber-300');
        }
    });

    AppState.currentTab = tab;
    AppState.currentMode = tab === 'witness' ? 'witness' : 'citizen';

    const container = document.getElementById('dynamicContainer');
    if (!container) return;

    // Show loading state
    container.innerHTML = `<div class="text-center py-20 text-zinc-400">Loading ${tab}...</div>`;

    try {
        if (tab === 'square' || tab === 'citizen') {
            container.innerHTML = `<div id="feedContainer" class="space-y-8"></div>`;
            if (typeof initFeed === 'function') {
                initFeed(db, 'citizen-talk');
            } else {
                container.innerHTML = `<div class="p-8 text-center text-amber-400">Public Square feed coming soon...</div>`;
            }
        } 
        else if (tab === 'ledger') {
            container.innerHTML = `<div id="ledgerContainer" class="space-y-6"></div>`;
            if (typeof loadEvidenceLedger === 'function') {
                loadEvidenceLedger();
            } else {
                container.innerHTML = `<div class="p-8 text-center text-zinc-400">Evidence Ledger coming soon...</div>`;
            }
        } 
        else if (tab === 'witness') {
            container.innerHTML = `
                <div class="space-y-6 p-8 text-center">
                    <h2 class="text-3xl font-bold text-amber-400">🛡️ Verified Witnesses</h2>
                    <p class="text-zinc-400">ZK-Verified Testimonies</p>
                </div>`;
        } 
        else if (tab === 'arena' || tab === 'mycircle') {
            container.innerHTML = `<div class="p-8 text-center text-zinc-400">This section is under construction</div>`;
        }
    } catch (e) {
        console.error("Tab switch error:", e);
        container.innerHTML = `<div class="text-red-400 text-center py-8">Failed to load tab. Please try again.</div>`;
    }
};

window.refreshLedger = () => {
    loadEvidenceLedger();
};

// ====================== WELCOME NOTE ======================
function showWelcomeNote() {
    if (!auth.currentUser || localStorage.getItem('hasSeenWelcome')) return;
    showToast("🎉 Welcome to VocalWitness! Your voice matters in the Public Square.", "success");
    localStorage.setItem('hasSeenWelcome', 'true');
}

// ====================== PUBLISH TESTIMONY ======================
window.publishTestimony = async () => {
    if (!requireAuth("Please sign in to share your testimony in the Public Square.")) return;

    const textarea = document.getElementById('mainInput');
    const content = textarea ? textarea.value.trim() : '';
    
    if (!content) {
        showToast("Please write something before publishing", "error");
        return;
    }

    const postBtn = document.getElementById('postButton');

    if (postBtn) {
        postBtn.disabled = true;
        postBtn.classList.add('publishing');
        postBtn.innerHTML = `
            <span class="flex items-center justify-center gap-3">
                <span class="animate-spin h-5 w-5 border-2 border-black border-t-transparent rounded-full"></span>
                Publishing to the Square...
            </span>
        `;
    }

    try {
        const { collection, addDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js");
        
        const mediaData = await mediaModule.uploadForensicMedia();
        
        const testimonyData = {
            authorId: auth.currentUser.uid,
            author: auth.currentUser.displayName || "Registered Witness",
            content,
            createdAt: serverTimestamp(),
            timestamp: Date.now(),
            isPublic: true,
            moderationStatus: "approved",
            feedVisibility: "citizen-talk",
            imageUrl: mediaData.imageUrl || null,
            audioUrl: mediaData.audioUrl || null,
            imageHash: mediaData.imageHash || null,
            audioHash: mediaData.audioHash || null,
            hasForensic: !!(mediaData.imageHash || mediaData.audioHash)
        };

        await addDoc(collection(db, "testimonies"), testimonyData);
        
        showToast("✅ Testimony published successfully!", "success");
        
        if (textarea) textarea.value = '';
        mediaModule.resetMediaState();
        
        // Refresh feed
        if (typeof initFeed === 'function') initFeed(db, 'citizen-talk');
    } catch (err) {
        console.error("Publish error:", err);
        
        // Target friendly error guidance for Firebase permissions issue
        if (err.code === 'permission-denied') {
            showToast("⚠️ Permission denied. Please check your Firestore security rules.", "error");
        } else {
            showToast("Failed to publish. Please try again.", "error");
        }
    } finally {
        if (postBtn) {
            postBtn.disabled = false;
            postBtn.classList.remove('publishing');
            postBtn.innerHTML = '🚀 Publish to the Square';
        }
    }
};

// ====================== EVIDENCE LEDGER MODULE ======================
async function loadEvidenceLedger() {
    const container = document.getElementById('ledgerContainer');
    if (!container) return;

    container.innerHTML = `
        <div class="glass rounded-3xl p-8 border border-zinc-700/60 shadow-2xl">
            <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8 pb-6 border-b border-zinc-800">
                <div>
                    <h2 class="text-2xl font-bold text-white flex items-center gap-2">
                        <span>📜</span> Cryptographic Evidence Ledger
                    </h2>
                    <p class="text-sm text-zinc-400 mt-1">Permanent, immutable record of public testimonies and cryptographic hashes.</p>
                </div>
                <button onclick="window.refreshLedger()" class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-2xl text-xs font-medium text-emerald-400 transition flex items-center gap-2">
                    🔄 Sync Ledger
                </button>
            </div>
            <div id="ledgerTableWrapper" class="overflow-x-auto">
                <div class="text-center py-16 text-zinc-500 animate-pulse">
                    Securely connecting to blockchain and ledger database...
                </div>
            </div>
        </div>
    `;

    try {
        const { collection, getDocs, query, orderBy, limit } = await import("https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js");
        
        const q = query(collection(db, "testimonies"), orderBy("createdAt", "desc"), limit(20));
        const querySnapshot = await getDocs(q);

        const wrapper = document.getElementById('ledgerTableWrapper');
        if (!wrapper) return;

        if (querySnapshot.empty) {
            wrapper.innerHTML = `
                <div class="text-center py-12 text-zinc-500">
                    <p class="text-base font-medium text-zinc-400">No forensic records found in the ledger yet.</p>
                    <p class="text-xs mt-1 text-zinc-600">Published testimonies with media evidence will appear here automatically.</p>
                </div>
            `;
            return;
        }

        let html = `
            <table class="w-full text-left border-collapse">
                <thead>
                    <tr class="border-b border-zinc-800 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                        <th class="py-3 px-4">Witness / Author</th>
                        <th class="py-3 px-4">Summary / Content</th>
                        <th class="py-3 px-4">Cryptographic Hash</th>
                        <th class="py-3 px-4">Status</th>
                        <th class="py-3 px-4 text-right">Timestamp</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-zinc-800/60 text-sm">
        `;

        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const dateStr = data.createdAt?.toDate ? data.createdAt.toDate().toLocaleString() : 'Just now';
            const shortHash = data.imageHash || data.audioHash ? (data.imageHash || data.audioHash).substring(0, 14) + '...' : 'Standard Log';
            const hasMedia = data.hasForensic ? '🛡️ Verified Media' : '📝 Text Record';
            
            html += `
                <tr class="hover:bg-zinc-900/60 transition-colors group">
                    <td class="py-4 px-4 font-medium text-white flex items-center gap-2">
                        <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                        ${escapeHtml(data.author || 'Anonymous Witness')}
                    </td>
                    <td class="py-4 px-4 text-zinc-300 max-w-xs truncate">
                        ${escapeHtml(data.content || '')}
                    </td>
                    <td class="py-4 px-4 font-mono text-xs text-emerald-400">
                        ${escapeHtml(shortHash)}
                    </td>
                    <td class="py-4 px-4">
                        <span class="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-950/80 text-emerald-300 border border-emerald-800/50">
                            ${hasMedia}
                        </span>
                    </td>
                    <td class="py-4 px-4 text-right text-xs text-zinc-500">
                        ${dateStr}
                    </td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
        `;
        wrapper.innerHTML = html;

    } catch (err) {
        console.error("Ledger fetch error:", err);
        const wrapper = document.getElementById('ledgerTableWrapper');
        if (wrapper) {
            wrapper.innerHTML = `<div class="text-red-400 text-center py-8">Failed to load ledger records securely. Please verify your connection.</div>`;
        }
    }
}

function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// ====================== SETUP EVENT LISTENERS ======================
function setupEventListeners() {
    if (listenersInitialized) {
        console.log("⚠️ Event listeners already set up, skipping duplicate binding.");
        return;
    }
    listenersInitialized = true;

    console.log("✅ Setting up all buttons...");

    document.querySelectorAll('#main-nav button[data-tab]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            window.switchTab(btn.dataset.tab);
        });
    });

    document.getElementById('profile-btn')?.addEventListener('click', window.showProfile);

    document.getElementById('support-btn')?.addEventListener('click', () => {
        const modal = document.getElementById('supportModal');
        if (modal) modal.classList.remove('hidden');
        else showToast("Support page coming soon", "info");
    });

    document.getElementById('signin-btn')?.addEventListener('click', () => {
        const modal = document.getElementById('loginModal');
        if (modal) modal.classList.remove('hidden');
    });

    document.getElementById('btn-photo')?.addEventListener('click', () => {
        if (!requireAuth("Sign in to upload Forensic Photo")) return;
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/jpeg,image/png,image/webp';
        input.onchange = (e) => {
            const previewArea = document.getElementById('preview-area');
            if (previewArea && typeof mediaModule.handleImageSelect === 'function') {
                mediaModule.handleImageSelect(e, previewArea);
            }
        };
        input.click();
    });

    document.getElementById('btn-voice')?.addEventListener('click', () => {
        if (!requireAuth("Sign in to record Voice Testimony")) return;
        if (typeof mediaModule.toggleVoiceRecording === 'function') {
            mediaModule.toggleVoiceRecording(document.getElementById('btn-voice'));
        }
    });

    document.getElementById('postButton')?.addEventListener('click', window.publishTestimony);

    console.log("✅ All major buttons wired successfully");
}

// ====================== BOOTSTRAP ======================
async function bootstrap() {
    if (isInitialized) return;
    isInitialized = true;
    console.log("🚀 VocalWitness Bootstrap started");

    try {
        await initAuth();
        setupEventListeners();
        
        if (typeof initLanguage === 'function') initLanguage();

        engineInstance = new CitizenTalkEngine(db, storage);
        window.engineInstance = engineInstance;
        mediaModule.setEngine(engineInstance);

        loadDynamicNavigation();
        
        setTimeout(() => window.switchTab('square'), 300);
        setTimeout(showWelcomeNote, 1200);

        console.log("✅ Bootstrap finished successfully");
    } catch (e) {
        console.error("Bootstrap error:", e);
        showToast("Failed to initialize app. Please refresh.", "error");
    }
}

document.addEventListener('DOMContentLoaded', bootstrap);
