pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";

template MerkleProof(levels) {
    signal input leaf;
    signal input pathElements[levels];
    signal input pathIndices[levels];
    signal output root;

    signal cur[levels + 1];
    cur[0] <== leaf;

    component hashers[levels];

    for (var i = 0; i < levels; i++) {
        // Force binary
        pathIndices[i] * (pathIndices[i] - 1) === 0;

        signal left;
        signal right;

        left  <== (1 - pathIndices[i]) * cur[i] + pathIndices[i] * pathElements[i];
        right <== pathIndices[i] * cur[i] + (1 - pathIndices[i]) * pathElements[i];

        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== left;
        hashers[i].inputs[1] <== right;
        cur[i + 1] <== hashers[i].out;
    }

    root <== cur[levels];
}

template VocalWitness(levels) {
    signal input secret;
    signal input nullifier;
    signal input trustScore;
    signal input postCount;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    signal input merkleRoot;
    signal input minTrustScore;
    signal input minPosts;

    signal output nullifierHash;
    signal output commitment;

    // Commitment
    component commitHash = Poseidon(2);
    commitHash.inputs[0] <== secret;
    commitHash.inputs[1] <== nullifier;
    commitment <== commitHash.out;

    // Nullifier hash
    component nullHash = Poseidon(1);
    nullHash.inputs[0] <== nullifier;
    nullifierHash <== nullHash.out;

    // Merkle proof
    component merkle = MerkleProof(levels);
    merkle.leaf <== commitment;
    for (var i = 0; i < levels; i++) {
        merkle.pathElements[i] <== pathElements[i];
        merkle.pathIndices[i] <== pathIndices[i];
    }
    merkle.root === merkleRoot;

    // Threshold checks
    component trustCheck = GreaterEqThan(32);
    trustCheck.in[0] <== trustScore;
    trustCheck.in[1] <== minTrustScore;
    trustCheck.out === 1;

    component postsCheck = GreaterEqThan(32);
    postsCheck.in[0] <== postCount;
    postsCheck.in[1] <== minPosts;
    postsCheck.out === 1;
}

component main {public [merkleRoot, minTrustScore, minPosts]} = VocalWitness(8);
