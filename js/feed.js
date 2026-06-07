import { db } from "./firebase-config.js";
import { collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, where, doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { currentUser } from "./auth.js";
import { showToast, generateSha256Hash } from "./utils.js";
import { isPhoneVerified, isZKVerified } from "./verification.js";
import { uploadToStorage } from "./storage.js";

export let currentFeed = 'citizen-talk';
export let activeFeedListener = null;

export async function postNow() {
    if (!currentUser) {
        showToast("Identity verification required to write to the ledger.", "info");
        return;
    }

    const mainInput = document.getElementById('mainInput');
    const postButton = document.getElementById('postButton');
    if (!mainInput || !postButton) return;

    const text = mainInput.value.trim();
    if (text.length < 15 && !window.recordedAudioBlob && !window.selectedImageFile) {
        showToast("Your testimony must contain text, audio, or an image.", "error");
        return;
    }

    if (currentFeed === 'true-witness' && (!isPhoneVerified || !isZKVerified || !window.selectedImageFile)) {
        showToast("True Witness requires Phone + ZK Verification + Photo", "error");
        return;
    }

    postButton.disabled = true;
    postButton.innerText = "Securing Media & Publishing...";

    try {
        let audioUrl = null;
        let imageUrl = null;
        let finalIntegrityHash = "N/A";

        // Upload media to Storage if present
        if (window.recordedAudioBlob) {
            finalIntegrityHash = await generateSha256Hash(window.recordedAudioBlob);
            audioUrl = await uploadToStorage(window.recordedAudioBlob, 'audio');
        }

        if (window.selectedImageFile) {
            imageUrl = await uploadToStorage(window.selectedImageFile, 'images');
        }

        // Save metadata and URLs to Firestore
        await addDoc(collection(db, "testimonies"), {
            witnessText: text,
            feedType: currentFeed,
            languageCode: document.getElementById('language-select')?.value || '+44',
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

        if (window.triggerRewardCycle) window.triggerRewardCycle(currentFeed);

        mainInput.value = '';
        if (document.getElementById('charCount')) document.getElementById('charCount').textContent = '0/500';
        window.removeImage?.();
        window.recordedAudioBlob = null;

        showToast("Record successfully written to the ledger.", "success");
    } catch (e) {
        console.error("Firebase Error: ", e);
        showToast("Database error. Check Firestore/Storage rules.", "error");
    } finally {
        postButton.disabled = false;
        postButton.innerText = "Publish to Decentralized Ledger";
    }
}
window.postNow = postNow;

export async function submitPeerVote(testimonyId, voteType) {
    if (!currentUser) {
        showToast("Login required to audit.", "error");
        return;
    }
    const docRef = doc(db, "testimonies", testimonyId);
    try {
        await runTransaction(db, async (transaction) => {
            const sfDoc = await transaction.get(docRef);
            if (!sfDoc.exists()) throw new Error("Document missing.");
            const data = sfDoc.data();
            const mod = data.moderation || { trustScore: 100, verificationsCount: 0, disputesCount: 0, votedUsers: [] };

            if (mod.votedUsers?.includes(currentUser.uid)) throw new Error("Already audited.");

            let v = (mod.verificationsCount || 0) + (voteType === 'verify' ? 1 : 0);
            let d = (mod.disputesCount || 0) + (voteType === 'dispute' ? 1 : 0);
            const total = v + d;
            
            transaction.update(docRef, {
                'moderation.verificationsCount': v,
                'moderation.disputesCount': d,
                'moderation.trustScore': Math.round((v / total) * 100),
                'moderation.votedUsers': [...(mod.votedUsers || []), currentUser.uid]
            });
        });
        showToast("Audit updated!", "success");
    } catch (err) {
        showToast(err.message, "error");
    }
}
window.submitPeerVote = submitPeerVote;

export function listenToLedgerFeed() {
    const feedContainer = document.getElementById('feed');
    if (!feedContainer) return;
    const q = query(collection(db, "testimonies"), where("feedType", "==", currentFeed), orderBy("timestamp", "desc"));

    if (activeFeedListener) activeFeedListener();

    activeFeedListener = onSnapshot(q, (snapshot) => {
        feedContainer.innerHTML = '';
        snapshot.forEach((doc) => {
            const data = doc.data();
            const card = document.createElement('div');
            card.className = 'glass rounded-3xl p-5 border border-zinc-900 bg-[#090f1d]/40 space-y-4';

            // Use data.audioUrl and data.imageUrl
            const audioHTML = data.audioUrl ? `<audio src="${data.audioUrl}" controls class="w-full mt-2"></audio>` : '';
            const imageHTML = data.imageUrl ? `<img src="${data.imageUrl}" class="w-full rounded-2xl mt-2">` : '';

            card.innerHTML = `
                <p>${data.witnessText}</p>
                ${audioHTML}
                ${imageHTML}
                <button onclick="window.submitPeerVote('${doc.id}', 'verify')">Agree</button>
            `;
            feedContainer.appendChild(card);
        });
    });
}
window.listenToLedgerFeed = listenToLedgerFeed;

export function switchFeed(feed) {
    currentFeed = feed;
    listenToLedgerFeed();
}
window.switchFeed = switchFeed;
