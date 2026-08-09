// js/zk-worker.js - Web Worker Script
// Import SnarkJS inside the worker context
importScripts('https://cdn.jsdelivr.net/npm/snarkjs@0.7.0/build/snarkjs.min.js');

self.onmessage = async (event) => {
    const { useMock, threads, canMultithread, ...proofPayload } = event.data;

    try {
        self.postMessage({ type: 'STATUS_UPDATE', message: 'Initializing zero-knowledge execution environment...' });

        if (useMock) {
            // Fast mock response for local testing
            self.postMessage({
                success: true,
                proof: { pi_a: ['mock_a'], pi_b: [['mock_b']], pi_c: ['mock_c'] },
                publicSignals: ['1', '0', '0'],
                note: 'Mock proof generated successfully'
            });
            return;
        }

        // Real Groth16 proof generation using SnarkJS
        self.postMessage({ type: 'STATUS_UPDATE', message: 'Generating Groth16 witness proof...' });

        const wasmPath = '/circuits/witness.wasm';
        const zkeyPath = '/circuits/witness_final.zkey';

        const { proof, publicSignals } = await snarkjs.groth16.fullProve(
            proofPayload,
            wasmPath,
            zkeyPath
        );

        self.postMessage({
            success: true,
            proof: proof,
            publicSignals: publicSignals
        });

    } catch (error) {
        self.postMessage({
            success: false,
            error: error.message || 'Error occurred inside ZK worker thread'
        });
    }
};
