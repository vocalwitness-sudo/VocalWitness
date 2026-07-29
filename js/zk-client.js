// js/zk-client.js - Main Thread Worker Wrapper for ZK Proofs
import { showToast } from './utils.js';

export function generateZKProofAsync(inputs) {
    return new Promise((resolve, reject) => {
        // Check if Web Workers are supported
        if (!window.Worker) {
            const errorMsg = "Web Workers are not supported in this browser environment.";
            if (typeof showToast === 'function') showToast(errorMsg, 'error');
            return reject(new Error(errorMsg));
        }

        // Initialize as a classic Worker to support importScripts inside js/zk-worker.js
        const worker = new Worker('/js/zk-worker.js');

        // Set safety timeout (60 seconds) to allow WASM computation on slower devices
        const timeout = setTimeout(() => {
            worker.terminate();
            const timeoutError = "ZK proof generation timed out. Please try again.";
            if (typeof showToast === 'function') showToast(timeoutError, 'error');
            reject(new Error(timeoutError));
        }, 60000);

        // Cleanup handler for premature page exits
        const unloadHandler = () => {
            clearTimeout(timeout);
            worker.terminate();
        };
        window.addEventListener('beforeunload', unloadHandler, { once: true });

        // Listen for messages from the worker
        worker.onmessage = (e) => {
            clearTimeout(timeout);
            window.removeEventListener('beforeunload', unloadHandler);
            worker.terminate();

            const { success, proof, publicSignals, error, note } = e.data;

            if (success) {
                if (note && typeof showToast === 'function') {
                    showToast(note, 'info');
                }
                resolve({ proof, publicSignals });
            } else {
                const failMsg = error || "Unknown worker error during proof generation.";
                if (typeof showToast === 'function') showToast(failMsg, 'error');
                reject(new Error(failMsg));
            }
        };

        // Handle script loading or runtime syntax errors inside the worker
        worker.onerror = (err) => {
            clearTimeout(timeout);
            window.removeEventListener('beforeunload', unloadHandler);
            worker.terminate();
            console.error("ZK Worker script execution error:", err);
            const errDetail = err.message || "Failed to execute ZK worker script.";
            if (typeof showToast === 'function') showToast(errDetail, 'error');
            reject(new Error(errDetail));
        };

        // Send payload data to the worker
        worker.postMessage(inputs);
    });
}
