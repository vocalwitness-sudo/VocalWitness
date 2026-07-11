// js/dao.js - Reputation System + Quadratic Voting for Stewards
import { db, auth } from './firebase-config.js';
import { collection, addDoc, getDoc, updateDoc, doc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { showToast } from './utils.js';
import { getCurrentUserTier, WITNESS_POSITIONS, TIERS } from './tier.js';

let userVotesThisProposal = {}; // Track votes per user per proposal (in-memory for session)

// ====================== REPUTATION & WITNESS CIRCLE ======================
export async function updateReputation(contributionType) {
  if (!auth.currentUser) {
    showToast("Sign in to earn reputation", "error");
    return;
  }

  const userRef = doc(db, "users", auth.currentUser.uid);
  const userSnap = await getDoc(userRef);
  let userData = userSnap.data() || {};

  const pointsMap = {
    'testimony': 15,
    'photo_forensic': 10,
    'voice': 12,
    'verification': 25,
    'circle_help': 20,
    'escalate': 8
  };

  const points = pointsMap[contributionType] || 5;
  const currentRep = (userData.reputation || 0) + points;

  await updateDoc(userRef, {
    reputation: currentRep,
    lastContribution: new Date().toISOString()
  });

  const newPosition = getWitnessPosition(currentRep);
  
  showToast(`+${points} Reputation • Total: ${currentRep}`, "success");

  if (userData.zkVerified && newPosition) {
    showToast(`🎖️ Witness Circle Progress: ${newPosition.name}`, "success");
  }

  if (typeof window.updateTierBadge === 'function') {
    window.updateTierBadge();
  }

  return currentRep;
}

function getWitnessPosition(rep) {
  if (rep >= 300) return WITNESS_POSITIONS.ARCHITECT;
  if (rep >= 150) return WITNESS_POSITIONS.ELDER_STEWARD;
  if (rep >= 75) return WITNESS_POSITIONS.STEWARD;
  if (rep >= 30) return WITNESS_POSITIONS.VERIFIED_WITNESS;
  return null;
}

export async function recordTestimonyContribution() {
  return await updateReputation('testimony');
}

export async function grantZKVerification() {
  if (!auth.currentUser) return;
  
  const userRef = doc(db, "users", auth.currentUser.uid);
  await updateDoc(userRef, {
    zkVerified: true,
    zkVerifiedAt: new Date().toISOString()
  });
  
  showToast("🔐 ZK Verified — Welcome to the True Witness Circle!", "success");
  
  if (typeof window.updateTierBadge === 'function') {
    window.updateTierBadge();
  }
}

// ====================== QUADRATIC VOTING (Original) ======================
export async function createStewardProposal(title, description) {
    if (!auth.currentUser) return showToast("Sign in required", "error");
    
    const tier = await getCurrentUserTier();
    if (tier !== TIERS.WITNESS_CIRCLE) {
      return showToast("Only Witness Circle members (Stewards+) can propose", "error");
    }

    await addDoc(collection(db, "dao_proposals"), {
        title,
        description,
        createdBy: auth.currentUser.uid,
        createdAt: new Date().toISOString(),
        status: "active",
        totalVotesFor: 0,
        totalVotesAgainst: 0,
        voteLog: {}
    });
    showToast("Proposal created for Steward DAO", "success");
}

export async function castQuadraticVote(proposalId, voteDirection, strength) {
    if (!auth.currentUser) return showToast("Sign in required", "error");

    const proposalRef = doc(db, "dao_proposals", proposalId);
    const proposalSnap = await getDoc(proposalRef);
    const data = proposalSnap.data();

    const userId = auth.currentUser.uid;
    const cost = strength * strength;

    const currentUserVotes = data.voteLog[userId] || { for: 0, against: 0 };
    const totalSpent = currentUserVotes.for + currentUserVotes.against;

    if (totalSpent + cost > 10) {
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

export function hasProposalPassed(proposal) {
    const total = proposal.totalVotesFor + proposal.totalVotesAgainst;
    if (total === 0) return false;
    return (proposal.totalVotesFor / total) > 0.6;
}
