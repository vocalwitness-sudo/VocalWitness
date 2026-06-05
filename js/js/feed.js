import { db } from "./firebase-config.js";
import { collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, where, doc, runTransaction } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { currentUser } from "./auth.js";
import { showToast, generateSha256Hash } from "./utils.js";
import { isPhoneVerified, isZKVerified } from "./verification.js";

export let currentFeed = 'citizen-talk'; // Renamed normalized default state
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

    if (text.length < 15 && !window.recordedAudioBlob) {
        showToast("Your testimony must be at least 15 characters long or have a voice recording.", "error");
        return;
    }

    // Standardized check verifying metadata matching premium validation standards
    if (currentFeed === 'true-witness' && (!isPhoneVerified || !isZKVerified || !window.compressedImageBase64)) {
        showToast("True Witness ledger feed requires Phone + ZK Verification + Photo evidence", "error");
        return;
    }

    postButton.disabled = true;
    postButton.innerText = "Processing Forensic Scrub...";

    try {
        let audioPayload = null;
        let finalIntegrityHash = "N/A - TEXT UPDATE";

        if (window.recordedAudioBlob) {
            finalIntegrityHash = await generateSha256Hash(window.recordedAudioBlob);
            audioPayload = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(window.recordedAudioBlob);
            });
        }

        const selectedLanguageCode = document.getElementById('language-select')?.value || '+44';

        await addDoc(collection(db, "testimonies"), {
            witnessText: text,
            feedType: currentFeed,
            languageCode: selectedLanguageCode,
            userId: currentUser.uid,
            userName: currentUser.displayName || "Anonymous Witness",
            timestamp: serverTimestamp(),
            audioData: audioPayload,
            imageData: window.compressedImageBase64 || null, 
            hasVoice: !!audioPayload,
            hasPhoto: !!window.compressedImageBase64,
            integrityHash: finalIntegrityHash,
            moderation: {
                trustScore: 100,
                verificationsCount: 0,
                disputesCount: 0,
                votedUsers: []
            }
        });

        // Trigger streak recalculations internally inside global context modules
        if (window.triggerRewardCycle) window.triggerRewardCycle(currentFeed);

        mainInput.value = '';
        if (document.getElementById('charCount')) document.getElementById('charCount').textContent = '0/500';
        window.removeImage();
        window.recordedAudioBlob = null;

        showToast("Record successfully written onto the decentralized timeline structure.", "success");

    } catch (e) {
        console.error("Firebase Database Error: ", e);
        showToast("Database error. Check Firestore security rules.", "error");
    } finally {
        postButton.disabled = false;
        postButton.innerText = "Publish to Decentralized Ledger";
    }
}
window.postNow = postNow;

export async function submitPeerVote(testimonyId, voteType) {
    if (!currentUser) {
        showToast("You must be logged in to audit this testimony.", "error");
        return;
    }

    const docRef = doc(db, "testimonies", testimonyId);

    try {
        await runTransaction(db, async (transaction) => {
            const sfDoc = await transaction.get(docRef);
            if (!sfDoc.exists()) throw new Error("Document is missing from the database.");

            const data = sfDoc.data();
            const moderation = data.moderation || { trustScore: 100, verificationsCount: 0, disputesCount: 0, votedUsers: [] };

            if (moderation.votedUsers && moderation.votedUsers.includes(currentUser.uid)) {
                throw new Error("You have already audited this node.");
            }

            let newVerifications = moderation.verificationsCount || 0;
            let newDisputes = moderation.disputesCount || 0;

            if (voteType === 'verify') newVerifications += 1;
            if (voteType === 'dispute') newDisputes += 1;

            const totalVotes = newVerifications + newDisputes;
            const newTrustScore = totalVotes > 0 ? Math.round((newVerifications / totalVotes) * 100) : 100;

            transaction.update(docRef, {
                'moderation.verificationsCount': newVerifications,
                'moderation.disputesCount': newDisputes,
                'moderation.trustScore': newTrustScore,
                'moderation.votedUsers': [...(moderation.votedUsers || []), currentUser.uid]
            });
        });
        showToast("Ledger audit successfully updated!", "success");
    } catch (err) {
        showToast(err.message || err, "error");
    }
}
window.submitPeerVote = submitPeerVote;

export function listenToLedgerFeed() {
    const feedContainer = document.getElementById('feed');
    if (!feedContainer) return;

    const selectedLang = document.getElementById('language-select')?.value || '+44';

    const q = query(
        collection(db, "testimonies"), 
        where("feedType", "==", currentFeed),
        where("languageCode", "==", selectedLang),
        orderBy("timestamp", "desc")
    );

    if (activeFeedListener) activeFeedListener();

    activeFeedListener = onSnapshot(q, (snapshot) => {
        feedContainer.innerHTML = ''; 

        if (snapshot.empty) {
            feedContainer.innerHTML = `
                <div class="glass rounded-3xl p-8 text-center text-zinc-500 text-sm border border-zinc-900 bg-[#090f1d]/20">
                    No verified testimonies logged onto this ledger sequence yet.
                </div>`;
            return;
        }

        snapshot.forEach((doc) => {
            const id = doc.id;
            const data = doc.data();
            const card = document.createElement('div');
            card.className = 'glass rounded-3xl p-5 border border-zinc-900 bg-[#090f1d]/40 space-y-4 post-card';

            const modData = data.moderation || { trustScore: 100, verificationsCount: 0, disputesCount: 0 };
            const assetHash = data.integrityHash || "VERIFIED TEXT ENTRY";

            let audioPlaybackElement = data.audioData ? `
                <div class="bg-zinc-900/80 rounded-2xl p-3 border border-zinc-800 flex flex-col gap-1.5 mt-2">
                    <span class="text-[10px] text-emerald-400 font-mono font-bold tracking-wider">🔒 AUDIO TESTIMONY DECRYPTED</span>
                    <audio src="${data.audioData}" controls class="w-full h-8 accent-emerald-500"></audio>
                </div>` : '';

            let imagePlaybackElement = data.imageData ? `
                <div class="rounded-2xl overflow-hidden border border-zinc-800 mt-2 max-h-64 bg-zinc-950">
                    <img src="${data.imageData}" alt="Witness Evidence" class="w-full h-full object-cover">
                </div>` : '';

            card.innerHTML = `
                <div class="flex justify-between items-start">
                    <div class="flex items-center gap-2">
                        <span class="px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-800 text-[10px] font-mono font-bold text-zinc-400">${data.languageCode}</span>
                        <span class="text-[11px] text-zinc-500 font-bold">${data.userName || 'Anonymous Witness'}</span>
                    </div>
                    <div class="flex items-center gap-1.5">
                        <span class="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                        <span class="text-[10px] font-mono text-emerald-400 font-bold tracking-widest">TRUST: ${modData.trustScore}%</span>
                    </div>
                </div>
                <p class="text-zinc-200 text-sm leading-relaxed whitespace-pre-wrap">${data.witnessText}</p>
                ${audioPlaybackElement}
                ${imagePlaybackElement}
                <div class="pt-2 border-t border-zinc-900 flex flex-col sm:flex-row justify-between items-center gap-3">
                    <span class="text-[9px] font-mono text-zinc-600 truncate max-w-[200px]">HASH: ${assetHash}</span>
                    <div class="flex items-center gap-2 w-full sm:w-auto">
                        <button onclick="window.submitPeerVote('${id}', 'verify')" class="flex-1 sm:flex-none px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-xl text-[11px] font-bold transition-all border border-emerald-500/20">
                            ✅ Agree (${modData.verificationsCount || 0})
                        </button>
                        <button onclick="window.submitPeerVote('${id}', 'dispute')" class="flex-1 sm:flex-none px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl text-[11px] font-bold transition-all border border-red-500/20">
                            ⚠️ Dispute (${modData.disputesCount || 0})
                        </button>
                    </div>
                </div>
            `;
            feedContainer.appendChild(card);
        });
    });
}
window.listenToLedgerFeed = listenToLedgerFeed;

export function switchFeed(feed) {
    currentFeed = feed;
    
    const tabTrue = document.getElementById('tab-true-witness');
    const tabCitizen = document.getElementById('tab-citizen-talk');
    
    if (tabTrue && tabCitizen) {
        if (feed === 'true-witness') {
            tabTrue.className = "bg-emerald-500 text-black py-4 rounded-3xl flex flex-col items-center justify-center gap-1 font-bold text-sm transition-all shadow-lg shadow-emerald-950/20";
            tabCitizen.className = "bg-zinc-900/60 border border-zinc-800 text-zinc-400 hover:bg-zinc-800 py-4 rounded-3xl flex flex-col items-center justify-center gap-1 font-semibold text-sm transition-all";
            document.getElementById('composerTitle').textContent = "True Witness Ledger Dispatch";
        } else {
            tabCitizen.className = "bg-emerald-500 text-black py-4 rounded-3xl flex flex-col items-center justify-center gap-1 font-bold text-sm transition-all shadow-lg shadow-emerald-950/20";
            tabTrue.className = "bg-zinc-900/60 border border-zinc-800 text-zinc-400 hover:bg-zinc-800 py-4 rounded-3xl flex flex-col items-center justify-center gap-1 font-semibold text-sm transition-all";
            document.getElementById('composerTitle').textContent = "Citizen Talk Public Entry";
        }
    }
    listenToLedgerFeed();
}
window.switchFeed = switchFeed;
