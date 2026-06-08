/**
 * VocalWitness Feed Module
 * Manages the Two-Tiered data streams and forensic ledger submissions
 */
import { db } from "./firebase-config.js";
import { collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { currentUser } from "./auth.js";
import { showToast, generateSha256Hash, isLowDataMode } from "./utils.js";
import { isPhoneVerified, isZKVerified } from "./verification.js";
import { uploadToStorage } from "./storage.js";

// State Management
export let currentFeed = 'citizen-talk';
export let activeFeedListener = null;

/**
 * Handles UI tab switching and real-time feed subscription
 */
export function switchFeed(feedType) {
    currentFeed = feedType === 'vocaltruth' ? 'vocal-truth' : 'citizen-talk';
    
    // UI logic for button states
    const vocalBtn = document.getElementById('btn-vocaltruth');
    const citizenBtn = document.getElementById('btn-citizentalk');
    
    const activeClasses = ["bg-emerald-500", "text-black", "border-emerald-400/20"];
    const inactiveClasses = ["bg-zinc-800", "text-zinc-400", "border-zinc-900"];

    // Toggle styling
    if (feedType === 'vocaltruth') {
        vocalBtn.classList.add(...activeClasses);
        vocalBtn.classList.remove(...inactiveClasses);
        citizenBtn.classList.add(...inactiveClasses);
        citizenBtn.classList.remove(...activeClasses);
    } else {
        citizenBtn.classList.add(...activeClasses);
        citizenBtn.classList.remove(...inactiveClasses);
        vocalBtn.classList.add(...inactiveClasses);
        vocalBtn.classList.remove(...activeClasses);
    }

    listenToLedgerFeed();
}

/**
 * Publishes testimony to the chosen tier
 */
export async function postNow() {
    if (!currentUser) return showToast("Identity verification required to dispatch.");

    const mainInput = document.getElementById('mainInput');
    const postButton = document.getElementById('postButton');
    if (!mainInput || !postButton) return;

    // Gatekeeper: Tier 2 (Vocal Truth) requires specific verification
    if (currentFeed === 'vocal-truth' && (!isPhoneVerified || !isZKVerified)) {
        return showToast("⚠️ Tier 2 Ledger Access Requires Identity Proofs.");
    }

    const text = mainInput.value.trim();
    if (text.length < 15 && !window.selectedAudioFile) {
        return showToast("Entry must contain text or forensic audio.");
    }

    postButton.disabled = true;
    postButton.innerText = "Encrypting & Dispatching...";

    try {
        let imageUrl = null;
        let audioUrl = null;
        let finalIntegrityHash = "N/A";

        if (window.selectedImageFile) imageUrl = await uploadToStorage(window.selectedImageFile, 'posts/images');
        if (window.selectedAudioFile) {
            audioUrl = await uploadToStorage(window.selectedAudioFile, 'posts/audio');
            finalIntegrityHash = await generateSha256Hash(window.selectedAudioFile);
        }

        await addDoc(collection(db, "testimonies"), {
            witnessText: text,
            feedType: currentFeed,
            userId: currentUser.uid,
            timestamp: serverTimestamp(),
            audioUrl, 
            imageUrl,
            integrityHash: finalIntegrityHash,
            moderation: { trustScore: 100, verificationsCount: 0, disputesCount: 0, votedUsers: [] }
        });

        mainInput.value = '';
        showToast("Record successfully written to ledger.");
    } catch (e) {
        showToast("Ledger dispatch failed.");
    } finally {
        postButton.disabled = false;
        postButton.innerText = "Publish to Decentralized Ledger";
    }
}

/**
 * Real-time ledger synchronization
 */
export function listenToLedgerFeed() {
    const feedContainer = document.getElementById('feed');
    if (!feedContainer) return;

    const q = query(
        collection(db, "testimonies"), 
        where("feedType", "==", currentFeed), 
        orderBy("timestamp", "desc")
    );

    if (activeFeedListener) activeFeedListener();

    activeFeedListener = onSnapshot(q, (snapshot) => {
        feedContainer.innerHTML = ''; 
        const showMedia = !isLowDataMode();
        
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const card = document.createElement('div');
            card.className = 'witness-card glass rounded-3xl p-5 border border-zinc-900 bg-[#090f1d]/40';
            card.innerHTML = `
                <p class="text-zinc-200 text-sm mb-3">${data.witnessText}</p>
                ${data.audioUrl ? `<audio src="${data.audioUrl}" controls class="w-full mb-3"></audio>` : ''}
                ${showMedia && data.imageUrl ? `<img src="${data.imageUrl}" class="rounded-lg w-full mb-3">` : ''}
                <button class="text-xs text-emerald-500 font-bold" onclick="window.submitPeerVote('${docSnap.id}', 'verify')">
                    Agree (${data.moderation.verificationsCount})
                </button>
            `;
            feedContainer.appendChild(card);
        });
    });
}
