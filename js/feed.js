import { db } from "./firebase-config.js";
import { collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, where, doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { currentUser } from "./auth.js";
import { showToast, generateSha256Hash } from "./utils.js";
import { isPhoneVerified, isZKVerified } from "./verification.js";
import { uploadToStorage } from "./storage.js"; // New modular import

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

    if (text.length < 15 && !window.selectedAudioFile) {
        showToast("Testimony must be at least 15 chars or include audio.", "error");
        return;
    }

    if (currentFeed === 'true-witness' && (!isPhoneVerified || !isZKVerified || !window.selectedImageFile)) {
        showToast("True Witness ledger requires Phone/ZK Verification + Photo evidence.", "error");
        return;
    }

    postButton.disabled = true;
    postButton.innerText = "Encrypting & Uploading Evidence...";

    try {
        let imageUrl = null;
        let audioUrl = null;
        let finalIntegrityHash = "N/A";

        // Handle File Uploads via storage.js
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
            audioUrl: audioUrl,   // URL Reference
            imageUrl: imageUrl,   // URL Reference
            hasVoice: !!audioUrl,
            hasPhoto: !!imageUrl,
            integrityHash: finalIntegrityHash,
            moderation: {
                trustScore: 100,
                verificationsCount: 0,
                disputesCount: 0,
                votedUsers: []
            }
        });

        if (window.triggerRewardCycle) window.triggerRewardCycle(currentFeed);

        mainInput.value = '';
        window.selectedImageFile = null;
        window.selectedAudioFile = null;

        showToast("Record successfully written onto the decentralized ledger.", "success");

    } catch (e) {
        console.error("Ledger Write Error: ", e);
        showToast("Database error. Check Firestore security rules.", "error");
    } finally {
        postButton.disabled = false;
        postButton.innerText = "Publish to Decentralized Ledger";
    }
}
window.postNow = postNow;

// Peer Audit Logic
export async function submitPeerVote(testimonyId, voteType) {
    if (!currentUser) return showToast("Login required.", "error");
    const docRef = doc(db, "testimonies", testimonyId);
    try {
        await runTransaction(db, async (transaction) => {
            const sfDoc = await transaction.get(docRef);
            const data = sfDoc.data();
            const mod = data.moderation;
            
            if (mod.votedUsers?.includes(currentUser.uid)) throw new Error("Already audited.");

            let verif = (mod.verificationsCount || 0) + (voteType === 'verify' ? 1 : 0);
            let disp = (mod.disputesCount || 0) + (voteType === 'dispute' ? 1 : 0);
            
            transaction.update(docRef, {
                'moderation.verificationsCount': verif,
                'moderation.disputesCount': disp,
                'moderation.trustScore': Math.round((verif / (verif + disp)) * 100),
                'moderation.votedUsers': [...(mod.votedUsers || []), currentUser.uid]
            });
        });
        showToast("Audit recorded.", "success");
    } catch (err) { showToast(err.message, "error"); }
}
window.submitPeerVote = submitPeerVote;

export function listenToLedgerFeed() {
    const feedContainer = document.getElementById('feed');
    if (!feedContainer) return;

    const selectedLang = document.getElementById('language-select')?.value || '+44';
    const q = query(collection(db, "testimonies"), where("feedType", "==", currentFeed), where("languageCode", "==", selectedLang), orderBy("timestamp", "desc"));

    if (activeFeedListener) activeFeedListener();

    activeFeedListener = onSnapshot(q, (snapshot) => {
        feedContainer.innerHTML = ''; 
        snapshot.forEach((doc) => {
            const data = doc.data();
            // Card rendering logic remains same, but swap data.audioData/imageData for data.audioUrl/imageUrl
            // ... (keep your existing UI rendering logic here)
        });
    });
}
window.listenToLedgerFeed = listenToLedgerFeed;
