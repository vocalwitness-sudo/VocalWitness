import { db } from "./firebase-config.js";
import { collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, where, doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { currentUser } from "./auth.js";
import { showToast, generateSha256Hash } from "./utils.js";
import { isPhoneVerified, isZKVerified } from "./verification.js";
import { uploadToStorage } from "./storage.js";

export let currentFeed = 'citizen-talk';
export let activeFeedListener = null;

// js/feed.js

// Ensure default is set
export let currentFeed = 'citizen-talk';

export function switchFeed(feedType) {
    // Check if user is trying to access Witness Voice without permissions
    if (feedType === 'witness-voice') {
        // You can add your "Is Verified?" check here
        // If not verified, you could show a toast: "Upgrade required for Witness Voice"
        // For now, we allow the switch, but your postNow() will block the actual writing
    }

    // Update internal state
    currentFeed = (feedType === 'witness-voice') ? 'witness-voice' : 'citizen-talk';

    // Refresh display
    listenToLedgerFeed();
}
// Inside your postNow() function in feed.js
export async function postNow() {
    // ... existing checks
    
    // The "Gatekeeper" logic
    if (currentFeed === 'witness-voice') {
        const isVerified = (isPhoneVerified && isZKVerified); 
        if (!isVerified) {
            showToast("Upgrade to Tier 1 Witness Circle to post in this feed.", "error");
            return; // Block execution
        }
    }
    
    // ... proceed with uploading if verified
}
        export function searchTestimonies(queryText) {
    const feedContainer = document.getElementById('feed');
    const cards = feedContainer.getElementsByClassName('witness-card'); // Ensure your cards have this class
    
    const term = queryText.toLowerCase();
    Array.from(cards).forEach(card => {
        const text = card.textContent.toLowerCase();
        card.style.display = text.includes(term) ? '' : 'none';
    });
}
window.searchTestimonies = searchTestimonies;
    }

    const mainInput = document.getElementById('mainInput');
    const postButton = document.getElementById('postButton');
    if (!mainInput || !postButton) return;

    const text = mainInput.value.trim();
    if (text.length < 15 && !window.selectedAudioFile) {
        showToast("Testimony must be at least 15 characters or include audio.", "error");
        return;
    }

    if (currentFeed === 'true-witness' && (!isPhoneVerified || !isZKVerified || !window.selectedImageFile)) {
        showToast("True Witness requires Phone/ZK Verification + Photo.", "error");
        return;
    }

    postButton.disabled = true;
    postButton.innerText = "Processing...";

    try {
        let imageUrl = null;
        let audioUrl = null;
        let finalIntegrityHash = "N/A";

        if (window.selectedImageFile) {
            imageUrl = await uploadToStorage(window.selectedImageFile, 'posts/images');
        }

        if (window.selectedAudioFile) {
            audioUrl = await uploadToStorage(window.selectedAudioFile, 'posts/audio');
            finalIntegrityHash = await generateSha256Hash(window.selectedAudioFile);
        }

        const selectedLanguageCode = document.getElementById('language-select')?.value || '+44';

        await addDoc(collection(db, "testimonies"), {
            witnessText: text,
            feedType: currentFeed,
            languageCode: selectedLanguageCode,
            userId: currentUser.uid,
            userName: currentUser.displayName || "Anonymous Witness",
            timestamp: serverTimestamp(),
            audioUrl: audioUrl,
            imageUrl: imageUrl,
            hasVoice: !!audioUrl,
            hasPhoto: !!imageUrl,
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

export function listenToLedgerFeed() {
    const feedContainer = document.getElementById('feed');
    if (!feedContainer) return;

    const selectedLang = document.getElementById('language-select')?.value || '+44';
    const q = query(collection(db, "testimonies"), where("feedType", "==", currentFeed), where("languageCode", "==", selectedLang), orderBy("timestamp", "desc"));

    if (activeFeedListener) activeFeedListener();

    activeFeedListener = onSnapshot(q, (snapshot) => {
        feedContainer.innerHTML = ''; 
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const id = docSnap.id;
            const card = document.createElement('div');
            card.className = 'glass rounded-3xl p-5 border border-zinc-900 bg-[#090f1d]/40 space-y-4';

            card.innerHTML = `
                <p class="text-zinc-200 text-sm">${data.witnessText}</p>
                ${data.audioUrl ? `<audio src="${data.audioUrl}" controls class="w-full"></audio>` : ''}
                ${data.imageUrl ? `<img src="${data.imageUrl}" class="rounded-lg w-full">` : ''}
                <button onclick="window.submitPeerVote('${id}', 'verify')">Agree (${data.moderation.verificationsCount})</button>
            `;
            feedContainer.appendChild(card);
        });
    });
}
// Inside your feed rendering loop:
const showImage = !isLowDataMode();
card.innerHTML = `
    <p>${data.witnessText}</p>
    ${showImage && data.imageUrl ? `<img src="${data.imageUrl}">` : '<p>[Image hidden to save data]</p>'}
`;
window.listenToLedgerFeed = listenToLedgerFeed;
// js/feed.js

export function switchFeed(feedType) {
    // 1. Update active tab UI
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
    
    // 2. Refresh the ledger display for the new feed type
    listenToLedgerFeed();
}
window.switchFeed = switchFeed;
