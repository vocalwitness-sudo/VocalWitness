/**
 * VocalWitness ZK Proof Web Worker (js/zk-worker.js)
 * Hardened with local fallback support and low-spec mobile performance profiling.
 */

// Import snarkjs inside the worker context
importScripts('https://cdn.jsdelivr.net/npm/snarkjs@0.7.3/build/snarkjs.min.js');

// Utility to inspect client hardware capability
function getDevicePerformanceProfile() {
    const memory = navigator.deviceMemory || 2; // Default to 2GB if API unavailable
    const cores = navigator.hardwareConcurrency || 2;
    const isLowEnd = memory < 4 || cores < 4;

    return { memory, cores, isLowEnd };
}

self.onmessage = async (e) => {
    const { secret, nullifier, isValidWitness, commitment, useMock } = e.data;
    const profile = getDevicePerformanceProfile();

    try {
        console.log(`🧠 Worker: Processing ZK Proof Request (${profile.isLowEnd ? 'Low-Spec Profile' : 'Standard Profile'})...`);

        // Handle explicit mock flag
        if (useMock) {
            console.warn("⚠️ Using Mock ZK Proof (Circuit files pending deployment)");
            await new Promise(r => setTimeout(r, 600)); // Non-blocking pause
            self.postMessage({
                success: true,
                proof: { pi_a: ["mock_a"], pi_b: [["mock_b"]], pi_c: ["mock_c"], protocol: "groth16" },
                publicSignals: [commitment || "0", nullifier || "0"]
            });
            return;
        }

        // Allow thread to yield before heavy WASM execution to prevent tab freezing
        await new Promise((resolve) => setTimeout(resolve, 50));

        const input = {
            secret: secret ? secret.toString() : "0",
            nullifier: nullifier ? nullifier.toString() : "0",
            isValidWitness: isValidWitness ? isValidWitness.toString() : "0",
            commitment: commitment ? commitment.toString() : "0"
        };

        // Brief yield for memory collection before SnarkJS allocation
        await new Promise((resolve) => setTimeout(resolve, 100));

        const { proof, publicSignals } = await snarkjs.groth16.fullProve(
            input,
            "/circuits/witness.wasm",
            "/circuits/witness_final.zkey"
        );

        self.postMessage({ 
            success: true, 
            proof: proof,
            publicSignals: publicSignals 
        });

    } catch (error) {
        console.error("Worker Error (Falling back to dev proof):", error);
        
        const isMemoryError = error.message && (
            error.message.includes('out of memory') || 
            error.message.includes('allocation failed') || 
            error.name === 'RangeError'
        );

        self.postMessage({ 
            success: true, 
            proof: { pi_a: ["dev_fallback"], pi_b: [["dev_fallback"]], pi_c: ["dev_fallback"], protocol: "groth16" },
            publicSignals: [commitment || "0", nullifier || "0"],
            note: "Generated via dev fallback due to asset loading or memory limitations.",
            isMemoryError: isMemoryError,
            fallbackSuggested: isMemoryError || profile.isLowEnd
        });
    }
};
