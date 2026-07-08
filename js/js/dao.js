// js/dao.js - Steward DAO Voting System
import { db, auth } from './firebase-config.js';
import { collection, addDoc, getDocs, doc, updateDoc, query, where } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { showToast } from './utils.js';
import { getCurrentUserTier, ROLES } from './tier.js';

export async function createStewardProposal(title, description) {
    if (!auth.currentUser) {
        showToast("Sign in to create proposal", "error");
        return;
    }

    const tier = await getCurrentUserTier();
    if (tier !== ROLES.STEWARD) {
        showToast("Only Stewards can create proposals", "error");
        return;
    }

    try {
        await addDoc(collection(db, "dao_proposals"), {
            title,
            description,
            createdBy: auth.currentUser.uid,
            createdAt: new Date().toISOString(),
            status: "active",
            votesFor: 0,
            votesAgainst: 0,
            voters: []
        });

        showToast("Proposal submitted to Steward DAO", "success");
    } catch (err) {
        showToast("Failed to create proposal", "error");
    }
}

export async function voteOnProposal(proposalId, voteType) { // 'for' or 'against'
    if (!auth.currentUser) return;

    const proposalRef = doc(db, "dao_proposals", proposalId);
    const proposalSnap = await getDoc(proposalRef);
    const data = proposalSnap.data();

    if (data.voters.includes(auth.currentUser.uid)) {
        showToast("You already voted", "error");
        return;
    }

    const updateData = voteType === 'for' 
        ? { votesFor: data.votesFor + 1 } 
        : { votesAgainst: data.votesAgainst + 1 };

    await updateDoc(proposalRef, {
        ...updateData,
        voters: [...data.voters, auth.currentUser.uid]
    });

    showToast(`Vote recorded: ${voteType.toUpperCase()}`, "success");
}

// Check if proposal passed
export function hasProposalPassed(proposal) {
    const totalVotes = proposal.votesFor + proposal.votesAgainst;
    if (totalVotes === 0) return false;
    return (proposal.votesFor / totalVotes) > 0.6; // 60% majority
}
