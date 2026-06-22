// js/zk-worker.js
importScripts('https://cdn.jsdelivr.net/npm/snarkjs@0.7.0/build/snarkjs.min.js');

self.onmessage = async (e) => {
    const { secret, nullifier, isValidWitness, commitment } = e.data;

    try {
        console.log("🧠 Worker: Starting ZK Proof Generation...");

        const input = {
            secret: secret.toString(),
            nullifier: nullifier.toString(),
            isValidWitness: isValidWitness.toString(),
            commitment: commitment.toString()
        };

        // Real proof generation (will use your circuit files when available)
        const { proof, publicSignals } = await snarkjs.groth16.fullProve(
            input,
            "/circuits/witness.wasm",      // ← Change when you upload real files
            "/circuits/witness_final.zkey"
        );

        self.postMessage({ 
            success: true, 
            proof: proof,
            publicSignals: publicSignals 
        });

    } catch (error) {
        console.error("Worker Error:", error);
        self.postMessage({ 
            success: false, 
            error: error.message || "Proof generation failed" 
        });
    }
};
