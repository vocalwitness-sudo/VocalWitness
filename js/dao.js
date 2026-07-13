// js/dao.js - Quadratic Voting + Reputation System
import { db, auth } from './firebase-config.js';
import { collection, addDoc, getDoc, updateDoc, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { showToast } from './utils.js';
import { getCurrentUserTier, TIERS } from './tier.js';
import { generateRigorousProof } from './zk-crypto.js';

// Quadratic Voting Cost
function quadraticCost(strength) {
    return strength * strength;
}

// Record Testimony Contribution (used in publishTestimony)
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

// Create DAO Proposal (Witness Circle only)
export async function createDAOProposal(title, description, category = 'governance') {
    if (!auth.currentUser) return showToast("Sign in required", "error");

    const tier = await getCurrentUserTier();
    if (tier !== TIERS.WITNESS_CIRCLE) {
        return showToast("Only Witness Circle members can create proposals", "error");
    }

    await addDoc(collection(db, "dao_proposals"), {
        title,
        description,
        category,
        createdBy: auth.currentUser.uid,
        createdAt: serverTimestamp(),
        status: "active",
        totalVotesFor: 0,
        totalVotesAgainst: 0,
        totalVotingPowerSpent: 0,
        quorum: 12,
        voteLog: {}
    });

    showToast("✅ DAO Proposal created", "success");
}

// Cast Quadratic Vote
export async function castQuadraticVote(proposalId, direction, strength = 1, proofContext = {}) {
    if (!auth.currentUser) return showToast("Sign in required", "error");
    if (strength < 1 || strength > 5) return showToast("Strength must be between 1-5", "error");

    const proposalRef = doc(db, "dao_proposals", proposalId);
    const snap = await getDoc(proposalRef);
    if (!snap.exists()) return showToast("Proposal not found", "error");

    const data = snap.data();
    const userId = auth.currentUser.uid;
    const cost = quadraticCost(strength);

    const userVote = data.voteLog?.[userId] || { spent: 0 };
    if (userVote.spent + cost > 25) {
        return showToast("Exceeded voting budget for this proposal", "error");
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
        console.warn("ZK Proof generation skipped", e);
    }

    const updateData = direction === 'for'
        ? { totalVotesFor: (data.totalVotesFor || 0) + strength }
        : { totalVotesAgainst: (data.totalVotesAgainst || 0) + strength };

    await updateDoc(proposalRef, {
        ...updateData,
        totalVotingPowerSpent: (data.totalVotingPowerSpent || 0) + cost,
        [`voteLog.${userId}`]: {
            direction,
            strength,
            cost,
            zkProof: zkProof ? zkProof.hash : null,
            timestamp: serverTimestamp()
        }
    });

    showToast(`Voted ${direction.toUpperCase()} with strength ${strength} (cost: ${cost})`, "success");
}

// Helper
export function hasProposalPassed(proposal) {
    const total = (proposal.totalVotesFor || 0) + (proposal.totalVotesAgainst || 0);
    if (total === 0) return false;
    return (proposal.totalVotesFor / total) > 0.65 && total >= (proposal.quorum || 12);
}
