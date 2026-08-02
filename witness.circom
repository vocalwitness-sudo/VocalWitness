pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";

template MerkleProof(levels) {
    signal input leaf;
    signal input pathElements[levels];
    signal input pathIndices[levels];
    signal output root;

    signal cur[levels + 1];
    signal left[levels];
    signal right[levels];

    // Intermediate terms to keep constraints quadratic
    signal term1[levels];
    signal term2[levels];

    cur[0] <== leaf;

    component hashers[levels];

    for (var i = 0; i < levels; i++) {
        // Force pathIndices to be binary (0 or 1)
        pathIndices[i] * (pathIndices[i] - 1) === 0;

        // Break expression into quadratic operations:
        // left = cur[i] + pathIndices[i] * (pathElements[i] - cur[i])
        term1[i] <== pathIndices[i] * (pathElements[i] - cur[i]);
        left[i]  <== cur[i] + term1[i];

        // right = pathElements[i] + pathIndices[i] * (cur[i] - pathElements[i])
        term2[i] <== pathIndices[i] * (cur[i] - pathElements[i]);
        right[i] <== pathElements[i] + term2[i];

        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== left[i];
        hashers[i].inputs[1] <== right[i];
        cur[i + 1] <== hashers[i].out;
    }

    root <== cur[levels];
}

template VocalWitness(levels) {
    // Private inputs
    signal input secret;
    signal input nullifier;
    signal input trustScore;
    signal input postCount;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    // Public inputs
    signal input merkleRoot;
    signal input minTrustScore;
    signal input minPosts;

    // Public outputs
    signal output nullifierHash;
    signal output commitment;

    // 1. Commitment
    component commitHash = Poseidon(2);
    commitHash.inputs[0] <== secret;
    commitHash.inputs[1] <== nullifier;
    commitment <== commitHash.out;

    // 2. Nullifier Hash
    component nullHash = Poseidon(1);
    nullHash.inputs[0] <== nullifier;
    nullifierHash <== nullHash.out;

    // 3. Merkle membership
    component merkle = MerkleProof(levels);
    merkle.leaf <== commitment;
    for (var i = 0; i < levels; i++) {
        merkle.pathElements[i] <== pathElements[i];
        merkle.pathIndices[i] <== pathIndices[i];
    }
    merkle.root === merkleRoot;

    // 4. Threshold checks
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
