// js/zk-client.js - Main Thread Worker Wrapper for ZK Proofs
import { showToast } from './utils.js';

export function generateZKProofAsync(inputs) {
    return new Promise((resolve, reject) => {
        // Check if Web Workers are supported
        if (!window.Worker) {
            return reject(new Error("Web Workers are not supported in this browser."));
        }

        // Initialize the worker
        const worker = new Worker('/js/zk-worker.js', { type: 'module' });

        // Set a safety timeout (e.g., 30 seconds) in case the worker hangs
        const timeout = setTimeout(() => {
            worker.terminate();
            reject(new Error("ZK proof generation timed out."));
        }, 30000);

        // Listen for messages from the worker
        worker.onmessage = (e) => {
            clearTimeout(timeout);
            worker.terminate();

            const { success, proof, publicSignals, error } = e.data;
            if (success) {
                resolve({ proof, publicSignals });
            } else {
                reject(new Error(error || "Unknown worker error during proof generation."));
            }
        };

        // Handle worker-level script loading or syntax errors
        worker.onerror = (err) => {
            clearTimeout(timeout);
            worker.terminate();
            console.error("Worker script error:", err);
            reject(new Error("Failed to execute ZK worker script."));
        };

        // Send payload data to the worker
        worker.postMessage(inputs);
    });
}
