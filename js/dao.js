// js/dao.js - Quadratic Voting for Stewards
import { db, auth } from './firebase-config.js';
import { collection, addDoc, getDoc, updateDoc, doc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { showToast } from './utils.js';
import { getCurrentUserTier, ROLES } from './tier.js';

let userVotesThisProposal = {}; // Track votes per user per proposal (in-memory for session)

export async function createStewardProposal(title, description) {
    if (!auth.currentUser) return showToast("Sign in required", "error");

    const tier = await getCurrentUserTier();
    if (tier !== ROLES.STEWARD) return showToast("Only Stewards can propose", "error");

    await addDoc(collection(db, "dao_proposals"), {
        title,
        description,
        createdBy: auth.currentUser.uid,
        createdAt: new Date().toISOString(),
        status: "active",
        totalVotesFor: 0,
        totalVotesAgainst: 0,
        voteLog: {} // { userId: { for: 3, against: 0 } }
    });

    showToast("Proposal created for Steward DAO", "success");
}

export async function castQuadraticVote(proposalId, voteDirection, strength) {
    if (!auth.currentUser) return showToast("Sign in required", "error");

    const proposalRef = doc(db, "dao_proposals", proposalId);
    const proposalSnap = await getDoc(proposalRef);
    const data = proposalSnap.data();

    const userId = auth.currentUser.uid;
    const cost = strength * strength; // Quadratic cost

    // Prevent overspending
    const currentUserVotes = data.voteLog[userId] || { for: 0, against: 0 };
    const totalSpent = currentUserVotes.for + currentUserVotes.against;

    if (totalSpent + cost > 10) { // Max 10 credits per proposal
        return showToast("You have reached max vote strength for this proposal", "error");
    }

    const updateData = voteDirection === 'for' 
        ? { totalVotesFor: data.totalVotesFor + strength }
        : { totalVotesAgainst: data.totalVotesAgainst + strength };

    await updateDoc(proposalRef, {
        ...updateData,
        [`voteLog.${userId}.${voteDirection}`]: (currentUserVotes[voteDirection] || 0) + strength
    });

    showToast(`Voted ${voteDirection} with strength ${strength} (cost: ${cost})`, "success");
}

// Check if proposal passed (60% majority after quadratic votes)
export function hasProposalPassed(proposal) {
    const total = proposal.totalVotesFor + proposal.totalVotesAgainst;
    if (total === 0) return false;
    return (proposal.totalVotesFor / total) > 0.6;
}
