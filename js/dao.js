// js/dao.js - Enhanced Quadratic Voting & Governance
import { db, auth } from './firebase-config.js';
import { collection, addDoc, getDoc, updateDoc, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { showToast } from './utils.js';
import { getCurrentUserTier, TIERS } from './tier.js';
import { generateRigorousProof } from './zk-crypto.js';

// Quadratic Voting Cost Formula
function quadraticCost(strength) {
    return strength * strength;
}

// Record Testimony Contribution (awards credibility score)
export async function recordTestimonyContribution() {
    if (!auth.currentUser) return;

    try {
        const userRef = doc(db, "users", auth.currentUser.uid);
        const snap = await getDoc(userRef);

        if (snap.exists()) {
            const currentRep = snap.data().credibilityScore || 0;
            await updateDoc(userRef, {
                credibilityScore: currentRep + 15,
                lastContribution: serverTimestamp()
            });
            console.log("✅ +15 Reputation for testimony");
        }
    } catch (e) {
        console.warn("Reputation update failed:", e);
    }
}

// Create DAO Proposal (Witness Circle or Admin/Moderator)
export async function createDAOProposal(title, description, category = 'governance') {
    if (!auth.currentUser) return showToast("Sign in required", "error");

    try {
        const tier = await getCurrentUserTier();
        const userSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
        const userData = userSnap.data() || {};

        const canCreate = tier === TIERS.WITNESS_CIRCLE || ['admin', 'moderator'].includes(userData.role);

        if (!canCreate) {
            return showToast("Only Witness Circle members or Admins can create proposals", "error");
        }

        await addDoc(collection(db, "dao_proposals"), {
            title,
            description,
            category,
            createdBy: auth.currentUser.uid,
            creatorRole: userData.role || 'citizen',
            createdAt: serverTimestamp(),
            status: "active",
            totalVotesFor: 0,
            totalVotesAgainst: 0,
            totalVotingPowerSpent: 0,
            quorum: 12,
            voteLog: {}
        });

        showToast("✅ DAO Proposal created", "success");
    } catch (e) {
        console.error("Proposal creation error:", e);
        showToast("Failed to create proposal", "error");
    }
}

// Cast Quadratic Vote (with Sybil Protection & Voter Snapshot)
export async function castQuadraticVote(proposalId, direction, strength = 1, proofContext = {}) {
    if (!auth.currentUser) return showToast("Sign in required", "error");
    if (strength < 1 || strength > 5) return showToast("Strength must be between 1-5", "error");

    const userId = auth.currentUser.uid;

    // Fetch User Data for Sybil Protection
    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return showToast("User profile not found", "error");

    const userData = userSnap.data();

    // Sybil Protection Check
    if (!userData.isPhoneVerified && (userData.credibilityScore || 0) < 10) {
        return showToast("Account must be phone verified or have 10+ REP to vote", "error");
    }

    const proposalRef = doc(db, "dao_proposals", proposalId);
    const proposalSnap = await getDoc(proposalRef);
    if (!proposalSnap.exists()) return showToast("Proposal not found", "error");

    const data = proposalSnap.data();
    const cost = quadraticCost(strength);

    const userVote = data.voteLog?.[userId] || { spent: 0 };
    if ((userVote.spent || 0) + cost > 25) {
        return showToast("Exceeded voting budget (max 25 power points)", "error");
    }

    // Optional ZK Proof
    let zkProof = null;
    try {
        zkProof = await generateRigorousProof({
            action: "dao_vote",
            proposalId,
            direction,
            strength,
            context: proofContext
        });
    } catch (e) {
        console.warn("ZK Proof generation skipped:", e);
    }

    const currentTier = await getCurrentUserTier();

    const updateData = direction === 'for'
        ? { totalVotesFor: (data.totalVotesFor || 0) + strength }
        : { totalVotesAgainst: (data.totalVotesAgainst || 0) + strength };

    await updateDoc(proposalRef, {
        ...updateData,
        totalVotingPowerSpent: (data.totalVotingPowerSpent || 0) + cost,
        [`voteLog.${userId}`]: {
            direction,
            strength,
            cost: (userVote.spent || 0) + cost,
            voterTier: currentTier || 'CITIZEN',
            voterRole: userData.role || 'citizen',
            zkProof: zkProof ? zkProof.hash : null,
            timestamp: serverTimestamp()
        }
    });

    showToast(`Voted ${direction.toUpperCase()} (Cost: ${cost} power points)`, "success");
}

// Helper: Check if proposal passed
export function hasProposalPassed(proposal) {
    const total = (proposal.totalVotesFor || 0) + (proposal.totalVotesAgainst || 0);
    if (total === 0) return false;
    return (proposal.totalVotesFor / total) > 0.65 && total >= (proposal.quorum || 12);
}

// Re-initialize UI on language switch
window.addEventListener('languageChanged', () => {
    if (typeof initDAO === 'function') initDAO();
});
