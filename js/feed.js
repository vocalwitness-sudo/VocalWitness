import { db } from "./firebase-config.js";
import { collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, where, doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { currentUser } from "./auth.js";
import { showToast, generateSha256Hash, isLowDataMode } from "./utils.js";
import { isPhoneVerified, isZKVerified } from "./verification.js";
import { uploadToStorage } from "./storage.js";

export let currentFeed = 'citizen-talk';
export let activeFeedListener = null;

// Switch feeds via UI Tabs
export function switchFeed(feedType) {
    const citizenTab = document.getElementById('citizenTab');
    const witnessTab = document.getElementById('witnessTab');
    
    if (feedType === 'citizentalk') {
        citizenTab.className = "tab-active py-3.5 rounded-2xl font-bold text-sm";
        witnessTab.className = "py-3.5 rounded-2xl font-bold text-sm border border-zinc-700 text-zinc-400";
        currentFeed = 'citizen-talk';
    } else {
        witnessTab.className = "tab-active py-3.5 rounded-2xl font-bold text-sm";
        citizenTab.className = "py-3.5 rounded-2xl font-bold text-sm border border-zinc-700 text-zinc-400";
        currentFeed = 'witness-voice';
    }
    listenToLedgerFeed();
}
window.switchFeed = switchFeed;

export async function postNow() {
    if (!currentUser) return showToast("Identity verification required.", "info");

    const mainInput = document.getElementById('mainInput');
    const postButton = document.getElementById('postButton');
    if (!mainInput || !postButton) return;

    // Gatekeeper Logic
    if (currentFeed === 'witness-voice' && (!isPhoneVerified || !isZKVerified)) {
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
            audioUrl, imageUrl,
            integrityHash: finalIntegrityHash,
            moderation: { trustScore: 100, verificationsCount: 0, disputesCount: 0, votedUsers: [] }
        });

        mainInput.value = '';
        window.selectedImageFile = null;
        window.selectedAudioFile = null;
        showToast("Record successfully written to the ledger.", "success");
    } catch (e) {
        showToast("Database error.", "error");
    } finally {
        postButton.disabled = false;
        postButton.innerText = "Publish to Decentralized Ledger";
    }
}
window.postNow = postNow;

export function listenToLedgerFeed() {
    const feedContainer = document.getElementById('feed');
    if (!feedContainer) return;

    const q = query(collection(db, "testimonies"), where("feedType", "==", currentFeed), orderBy("timestamp", "desc"));
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
                <button class="text-xs text-emerald-500" onclick="window.submitPeerVote('${id}', 'verify')">Agree (${data.moderation.verificationsCount})</button>
            `;
            feedContainer.appendChild(card);
        });
    });
}
window.listenToLedgerFeed = listenToLedgerFeed;
