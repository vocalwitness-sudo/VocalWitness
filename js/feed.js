// js/feed.js
import { db } from "./firebase-config.js";
import { collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, where } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { currentUser } from "./auth.js";
import { showToast, generateSha256Hash, isLowDataMode } from "./utils.js";
import { isPhoneVerified, isZKVerified } from "./verification.js";
import { uploadToStorage } from "./storage.js";
// main.js
import { db, storage } from "./firebase-config.js";
export const witnessEngine = new VocalWitnessEngine(db, storage);

// State Management
export let currentFeed = 'citizen-talk';
export let activeFeedListener = null;

/**
 * Handles UI tab switching and feed updates
 * Matches buttons with IDs: btn-vocaltruth, btn-citizentalk
 */
export function switchFeed(feedType) {
    const vocalBtn = document.getElementById('btn-vocaltruth');
    const citizenBtn = document.getElementById('btn-citizentalk');
    
    // Define Tailwind classes for state
    const activeClasses = ["bg-emerald-500", "text-black", "border-emerald-400/20"];
    const inactiveClasses = ["bg-zinc-800", "text-zinc-400", "border-zinc-900"];

    // Reset both buttons
    [vocalBtn, citizenBtn].forEach(btn => {
        btn.classList.remove(...activeClasses);
        btn.classList.add(...inactiveClasses);
    });

    // Apply active state
    if (feedType === 'vocaltruth') {
        vocalBtn.classList.add(...activeClasses);
        vocalBtn.classList.remove(...inactiveClasses);
        currentFeed = 'vocal-truth';
    } else {
        citizenBtn.classList.add(...activeClasses);
        citizenBtn.classList.remove(...inactiveClasses);
        currentFeed = 'citizen-talk';
    }

    listenToLedgerFeed();
}
window.switchFeed = switchFeed;

/**
 * Publishes testimony to the decentralized ledger
 */
export async function postNow() {
    if (!currentUser) return showToast("Identity verification required.", "info");

    const mainInput = document.getElementById('mainInput');
    const postButton = document.getElementById('postButton');
    if (!mainInput || !postButton) return;

    // Gatekeeper Logic
    if (currentFeed === 'vocal-truth' && (!isPhoneVerified || !isZKVerified)) {
        return showToast("Upgrade to Tier 1 Witness Circle to post in this feed.", "error");
    }

    const text = mainInput.value.trim();
    if (text.length < 15 && !window.selectedAudioFile) {
        return showToast("Testimony must be at least 15 characters or include audio.", "error");
    }

    postButton.disabled = true;
    postButton.innerText = "Processing...";

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
        window.selectedImageFile = null;
        window.selectedAudioFile = null;
        showToast("Record successfully written to the ledger.", "success");
    } catch (e) {
        console.error(e);
        showToast("Database error.", "error");
    } finally {
        postButton.disabled = false;
        postButton.innerText = "Publish to Decentralized Ledger";
    }
}
window.postNow = postNow;

/**
 * Listens to real-time feed updates based on the currentFeed state
 */
export function listenToLedgerFeed() {
    const feedContainer = document.getElementById('feed');
    if (!feedContainer) return;

    // Build query based on active feed
    const q = query(
        collection(db, "testimonies"), 
        where("feedType", "==", currentFeed), 
        orderBy("timestamp", "desc")
    );

    // Stop existing listener if any
    if (activeFeedListener) activeFeedListener();

    activeFeedListener = onSnapshot(q, (snapshot) => {
        feedContainer.innerHTML = ''; 
        const showMedia = !isLowDataMode();
        
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const id = docSnap.id;
            const card = document.createElement('div');
            card.className = 'witness-card glass rounded-3xl p-5 border border-zinc-900 bg-[#090f1d]/40 space-y-4';
            card.innerHTML = `
                <p class="text-zinc-200 text-sm">${data.witnessText}</p>
                ${data.audioUrl ? `<audio src="${data.audioUrl}" controls class="w-full"></audio>` : ''}
                ${showMedia && data.imageUrl ? `<img src="${data.imageUrl}" class="rounded-lg w-full">` : (data.imageUrl ? '<p class="text-xs text-zinc-500">[Image hidden: Low Data Mode]</p>' : '')}
                <button class="text-xs text-emerald-500" onclick="window.submitPeerVote('${id}', 'verify')">
                    Agree (${data.moderation.verificationsCount})
                </button>
            `;
            feedContainer.appendChild(card);
        });
    });
}
window.listenToLedgerFeed = listenToLedgerFeed;
