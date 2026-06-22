pragma circom 2.1.0;

include "node_modules/circomlib/circuits/pedersen.circom";
include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/mux1.circom";
include "node_modules/circomlib/circuits/bitify.circom";

// Merkle Proof Template
template MerkleProof(levels) {
    signal input leaf;
    signal input pathElements[levels];
    signal input pathIndices[levels];
    signal output root;

    signal nodes[levels + 1];
    nodes[0] <== leaf;

    component hashers[levels];
    component muxes[levels];

    for (var i = 0; i < levels; i++) {
        pathIndices[i] * (1 - pathIndices[i]) === 0;

        muxes[i] = MultiMux1(2);
        muxes[i].c[0][0] <== nodes[i];
        muxes[i].c[0][1] <== pathElements[i];
        muxes[i].c[1][0] <== pathElements[i];
        muxes[i].c[1][1] <== nodes[i];
        muxes[i].s <== pathIndices[i];

        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== muxes[i].out[0];
        hashers[i].inputs[1] <== muxes[i].out[1];
        nodes[i + 1] <== hashers[i].out;
    }
    root <== nodes[levels];
}

// Advanced VocalWitness Registry Circuit
template VocalWitnessRegistry(levels) {
    // Private
    signal input secret;
    signal input nullifier;
    signal input trustScore;           // Hidden
    signal input postCount;            // Hidden number of posts

    // Public
    signal input isValidWitness;
    signal input merkleRoot;
    signal input minTrustScore;        // e.g. 60
    signal input minPosts;             // e.g. 5
    signal input commitment;           // Pedersen commitment

    // Outputs
    signal output nullifierHash;
    signal output valid;

    // ====================== PEDERSEN COMMITMENT ======================
    component pedersen = Pedersen(2);
    component secretBits = Num2Bits(254);
    component nullBits = Num2Bits(254);
    
    secretBits.in <== secret;
    nullBits.in <== nullifier;

    for (var i = 0; i < 254; i++) {
        pedersen.in[0][i] <== secretBits.out[i];
        pedersen.in[1][i] <== nullBits.out[i];
    }
    pedersen.out[0] === commitment;

    // ====================== MERKLE PROOF (Registry Membership) ======================
    component merkle = MerkleProof(levels);
    merkle.leaf <== commitment;
    // pathElements and pathIndices provided by prover (from off-chain tree)

    merkle.root === merkleRoot;

    // ====================== SELECTIVE DISCLOSURES ======================
    // 1. Trust Score >= minTrustScore
    component trustGte = GreaterEqThan(8);
    trustGte.in[0] <== trustScore;
    trustGte.in[1] <== minTrustScore;
    trustGte.out === 1;

    // 2. Post Count >= minPosts
    component postsGte = GreaterEqThan(32);
    postsGte.in[0] <== postCount;
    postsGte.in[1] <== minPosts;
    postsGte.out === 1;

    // ====================== NULLIFIER & VALIDITY ======================
    component nullHasher = Pedersen(1);
    component nBits = Num2Bits(254);
    nBits.in <== nullifier;
    for (var i = 0; i < 254; i++) {
        nullHasher.in[0][i] <== nBits.out[i];
    }
    nullifierHash <== nullHasher.out[0];

    valid <== isValidWitness;
}

component main {public [
    isValidWitness, 
    merkleRoot, 
    minTrustScore, 
    minPosts, 
    commitment
]} = VocalWitnessRegistry(20);
