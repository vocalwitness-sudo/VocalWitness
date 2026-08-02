template MerkleProof(levels) {
    signal input leaf;
    signal input pathElements[levels];
    signal input pathIndices[levels];
    signal output root;

    signal cur[levels + 1];
    // Declare signals outside/at top of template scope
    signal left[levels];
    signal right[levels];

    cur[0] <== leaf;

    component hashers[levels];

    for (var i = 0; i < levels; i++) {
        // Force pathIndices to be 0 or 1
        pathIndices[i] * (pathIndices[i] - 1) === 0;

        left[i]  <== (1 - pathIndices[i]) * cur[i] + pathIndices[i] * pathElements[i];
        right[i] <== pathIndices[i] * cur[i] + (1 - pathIndices[i]) * pathElements[i];

        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== left[i];
        hashers[i].inputs[1] <== right[i];
        cur[i + 1] <== hashers[i].out;
    }

    root <== cur[levels];
}
