// js/zk-worker.js - Optimized Web Worker Execution Thread

try {
    importScripts('https://cdn.jsdelivr.net/npm/snarkjs@0.7.0/build/snarkjs.min.js');
} catch (err) {
    console.warn("importScripts failed, relying on module/global context:", err);
}

// In-memory cache for WebAssembly and Proving Keys
let cachedWasmBuffer = null;
let cachedZkeyBuffer = null;

async function loadCircuitAssets(baseUrl) {
    if (!cachedWasmBuffer) {
        self.postMessage({ type: 'STATUS_UPDATE', message: 'Downloading WASM circuit binaries...' });
        const res = await fetch(`${baseUrl}/circuits/witness.wasm`);
        if (!res.ok) throw new Error(`Failed to load WASM circuit: HTTP ${res.status}`);
        cachedWasmBuffer = new Uint8Array(await res.arrayBuffer());
    }

    if (!cachedZkeyBuffer) {
        self.postMessage({ type: 'STATUS_UPDATE', message: 'Downloading Proving Key (zkey)...' });
        const res = await fetch(`${baseUrl}/circuits/witness_final.zkey`);
        if (!res.ok) throw new Error(`Failed to load zkey binary: HTTP ${res.status}`);
        cachedZkeyBuffer = new Uint8Array(await res.arrayBuffer());
    }
}

self.onmessage = async (event) => {
    const { useMock, threads, canMultithread, ...proofPayload } = event.data;

    try {
        if (useMock) {
            self.postMessage({
                success: true,
                proof: { pi_a: ['mock_a'], pi_b: [['mock_b']], pi_c: ['mock_c'] },
                publicSignals: ['1', '0', '0'],
                note: 'Mock proof generated successfully'
            });
            return;
        }

        const snarkEngine = self.snarkjs || (typeof snarkjs !== 'undefined' ? snarkjs : null);

        if (!snarkEngine) {
            throw new Error('SnarkJS library failed to initialize inside worker context.');
        }

        const baseUrl = self.location.origin;
        await loadCircuitAssets(baseUrl);

        self.postMessage({ type: 'STATUS_UPDATE', message: 'Generating cryptographic proof via Groth16...' });

        const { proof, publicSignals } = await snarkEngine.groth16.fullProve(
            proofPayload,
            cachedWasmBuffer,
            cachedZkeyBuffer
        );

        self.postMessage({
            success: true,
            proof: proof,
            publicSignals: publicSignals
        });

    } catch (error) {
        self.postMessage({
            success: false,
            error: error.message || 'Error occurred during zero-knowledge proof generation'
        });
    }
};
