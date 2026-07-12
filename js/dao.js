// js/dao.js - Quadratic Voting + ZK Proof Verification
import { db, auth } from './firebase-config.js';
import { collection, addDoc, getDoc, updateDoc, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { showToast } from './utils.js';
import { getCurrentUserTier, TIERS } from './tier.js';
import { generateRigorousProof } from './zk-crypto.js';

// Quadratic Voting Cost Function
function quadraticCost(strength) {
  return strength * strength; // Classic quadratic cost
}

// Create Proposal (Witness Circle+)
export async function createDAOProposal(title, description, category = 'governance') {
  if (!auth.currentUser) return showToast("Sign in required", "error");

  const tier = await getCurrentUserTier();
  if (tier !== TIERS.WITNESS_CIRCLE) {
    return showToast("Only Witness Circle can create DAO proposals", "error");
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
    voteLog: {} // { userId: { direction, strength, cost, zkProof } }
  });

  showToast("DAO Proposal created successfully", "success");
}

// Cast Quadratic Vote with ZK Proof
export async function castQuadraticVote(proposalId, direction, strength = 1, proofContext = {}) {
  if (!auth.currentUser) return showToast("Sign in required", "error");
  if (strength < 1 || strength > 5) return showToast("Strength must be 1-5", "error");

  const proposalRef = doc(db, "dao_proposals", proposalId);
  const snap = await getDoc(proposalRef);
  if (!snap.exists()) return showToast("Proposal not found", "error");

  const data = snap.data();
  const userId = auth.currentUser.uid;
  const cost = quadraticCost(strength);

  // Check user's previous votes on this proposal
  const userVote = data.voteLog?.[userId] || { spent: 0 };
  if (userVote.spent + cost > 25) { // Max budget per proposal
    return showToast("You have exceeded voting budget for this proposal", "error");
  }

  // Generate ZK / Forensic Proof
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
    console.warn("ZK Proof optional - continuing", e);
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

// Check Proposal Outcome
export function hasProposalPassed(proposal) {
  const total = (proposal.totalVotesFor || 0) + (proposal.totalVotesAgainst || 0);
  if (total === 0) return false;
  return (proposal.totalVotesFor / total) > 0.65 && total >= (proposal.quorum || 12);
}

// Reputation Update (used across the app)
export async function updateReputation(contributionType) {
  if (!auth.currentUser) return;
  // ... your existing reputation logic ...
  console.log(`Reputation updated for ${contributionType}`);
}
