pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";

// Simple binary Merkle proof (depth 10 is enough for start)
template MerkleProof(levels) {
    signal input leaf;
    signal input pathElements[levels];
    signal input pathIndices[levels];   // 0 or 1
    signal output root;

    signal hashes[levels + 1];
    hashes[0] <== leaf;

    component hashers[levels];
    component mux[levels];

    for (var i = 0; i < levels; i++) {
        // Force pathIndices to be binary
        pathIndices[i] * (1 - pathIndices[i]) === 0;

        // Select left / right
        mux[i] = MultiMux1(1);          // we only need 1 selector
        mux[i].c[0][0] <== hashes[i];
        mux[i].c[0][1] <== pathElements[i];
        mux[i].s <== pathIndices[i];

        // Actually we need both orders for Poseidon
        // Better explicit way:
        signal left;
        signal right;
        left  <== (1 - pathIndices[i]) * hashes[i] + pathIndices[i] * pathElements[i];
        right <== pathIndices[i] * hashes[i] + (1 - pathIndices[i]) * pathElements[i];

        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== left;
        hashers[i].inputs[1] <== right;
        hashes[i + 1] <== hashers[i].out;
    }

    root <== hashes[levels];
}

template VocalWitness(levels) {
    // ===== Private inputs =====
    signal input secret;          // user's private identity secret
    signal input nullifier;       // random value used only once
    signal input trustScore;
    signal input postCount;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    // ===== Public inputs =====
    signal input merkleRoot;
    signal input minTrustScore;
    signal input minPosts;

    // ===== Public outputs =====
    signal output nullifierHash;  // this is what we store / check against double-spend
    signal output commitment;     // public commitment of the witness

    // 1. Commitment = Poseidon(secret, nullifier)
    component commitmentHasher = Poseidon(2);
    commitmentHasher.inputs[0] <== secret;
    commitmentHasher.inputs[1] <== nullifier;
    commitment <== commitmentHasher.out;

    // 2. Nullifier Hash = Poseidon(nullifier)  ← prevents reuse
    component nullifierHasher = Poseidon(1);
    nullifierHasher.inputs[0] <== nullifier;
    nullifierHash <== nullifierHasher.out;

    // 3. Merkle membership proof of the commitment
    component merkle = MerkleProof(levels);
    merkle.leaf <== commitment;
    for (var i = 0; i < levels; i++) {
        merkle.pathElements[i] <== pathElements[i];
        merkle.pathIndices[i] <== pathIndices[i];
    }
    merkle.root === merkleRoot;

    // 4. Selective disclosure (trust & posts)
    component trustCheck = GreaterEqThan(32);
    trustCheck.in[0] <== trustScore;
    trustCheck.in[1] <== minTrustScore;
    trustCheck.out === 1;

    component postsCheck = GreaterEqThan(32);
    postsCheck.in[0] <== postCount;
    postsCheck.in[1] <== minPosts;
    postsCheck.out === 1;
}

// Depth 10 is a good starting point (fast compile + enough capacity)
component main {public [merkleRoot, minTrustScore, minPosts]} = VocalWitness(10);
