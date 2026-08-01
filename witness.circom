pragma circom 2.1.0;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/mux1.circom";
include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/pedersen.circom";

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
    // Private inputs
    signal input secret;
    signal input nullifier;
    signal input trustScore;
    signal input postCount;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    // Public inputs
    signal input isValidWitness;
    signal input merkleRoot;
    signal input minTrustScore;
    signal input minPosts;
    signal input commitment;

    // Outputs
    signal output nullifierHash;
    signal output valid;

    // 1. Pedersen Commitment
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

    // 2. Merkle Proof
    component merkle = MerkleProof(levels);
    merkle.leaf <== commitment;
    for (var i = 0; i < levels; i++) {
        merkle.pathElements[i] <== pathElements[i];
        merkle.pathIndices[i] <== pathIndices[i];
    }
    merkle.root === merkleRoot;

    // 3. Selective disclosures
    component trustGte = GreaterEqThan(8);
    trustGte.in[0] <== trustScore;
    trustGte.in[1] <== minTrustScore;
    trustGte.out === 1;

    component postsGte = GreaterEqThan(32);
    postsGte.in[0] <== postCount;
    postsGte.in[1] <== minPosts;
    postsGte.out === 1;

    // 4. Nullifier
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
