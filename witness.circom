pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";

// Clean Merkle Proof (depth 8 is fast and practical for now)
template MerkleProof(levels) {
    signal input leaf;
    signal input pathElements[levels];
    signal input pathIndices[levels];
    signal output root;

    signal cur[levels + 1];
    cur[0] <== leaf;

    component hashers[levels];

    for (var i = 0; i < levels; i++) {
        // Force pathIndices to be 0 or 1
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

    // 1. Commitment = Poseidon(secret, nullifier)
    component commitHash = Poseidon(2);
    commitHash.inputs[0] <== secret;
    commitHash.inputs[1] <== nullifier;
    commitment <== commitHash.out;

    // 2. Nullifier Hash (prevents reuse)
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

    // 4. Trust & post count checks
    component trustCheck = GreaterEqThan(32);
    trustCheck.in[0] <== trustScore;
    trustCheck.in[1] <== minTrustScore;
    trustCheck.out === 1;

    component postsCheck = GreaterEqThan(32);
    postsCheck.in[0] <== postCount;
    postsCheck.in[1] <== minPosts;
    postsCheck.out === 1;
}

// Depth 8 is very safe for GitHub Actions (fast compile)
component main {public [merkleRoot, minTrustScore, minPosts]} = VocalWitness(8);
