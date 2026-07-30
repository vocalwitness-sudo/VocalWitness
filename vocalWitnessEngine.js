/**
 * VocalWitness Engine - Two-Lungs Architecture
 * Hardened with retry logic + reliable blob finalization
 */

export class BaseEngine {
    constructor(db, storage) {
        this.db = db;
        this.storage = storage;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.currentAudioBlob = null;
        this.stream = null;
        this.pendingImage = null;
        this.pendingImageHash = null;
        this.pendingExif = null;
        this._stopPromise = null;
        this._stopResolve = null;
        this._durationTimer = null;
    }

    // ---------- MIME type helper ----------
    _getSupportedMimeType() {
        const types = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/ogg;codecs=opus',
            'audio/mp4'
        ];
        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) {
                return type;
            }
        }
        return ''; // let browser choose
    }

    // ---------- Start with retry ----------
    async startVoiceRecording(durationLimit = 300000, maxRetries = 3) {
        // Clean previous session if any
        this.stopVoiceRecording(true);

        let lastError = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`🎤 Requesting microphone (attempt ${attempt}/${maxRetries})...`);

                this.stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    }
                });

                const mimeType = this._getSupportedMimeType();
                const options = mimeType ? { mimeType } : {};

                this.mediaRecorder = new MediaRecorder(this.stream, options);
                this.audioChunks = [];
                this.currentAudioBlob = null;

                // Collect chunks
                this.mediaRecorder.ondataavailable = (event) => {
                    if (event.data && event.data.size > 0) {
                        this.audioChunks.push(event.data);
                    }
                };

                // Finalize blob when stopped
                this.mediaRecorder.onstop = () => {
                    this.currentAudioBlob = new Blob(this.audioChunks, {
                        type: this.mediaRecorder.mimeType || 'audio/webm'
                    });
                    console.log("✅ Recording stopped. Blob size:", this.currentAudioBlob.size, "bytes");

                    // Resolve any waiting promise
                    if (this._stopResolve) {
                        this._stopResolve(this.currentAudioBlob);
                        this._stopResolve = null;
                        this._stopPromise = null;
                    }
                };

                this.mediaRecorder.onerror = (e) => {
                    console.error("MediaRecorder error:", e);
                };

                // Start collecting data every 1 second (more reliable than one big chunk)
                this.mediaRecorder.start(1000);
                console.log("🎤 Recording started...");

                // Auto-stop after durationLimit
                if (durationLimit > 0) {
                    this._durationTimer = setTimeout(() => {
                        console.log("⏱️ Duration limit reached – stopping recording");
                        this.stopVoiceRecording();
                    }, durationLimit);
                }

                return; // success – exit retry loop
            } catch (err) {
                lastError = err;
                console.warn(`Microphone attempt ${attempt} failed:`, err.message || err);

                // Clean up partial stream
                if (this.stream) {
                    this.stream.getTracks().forEach(t => t.stop());
                    this.stream = null;
                }

                if (attempt < maxRetries) {
                    // short delay before retry
                    await new Promise(r => setTimeout(r, 600 * attempt));
                }
            }
        }

        // All retries failed
        console.error("Microphone access failed after retries:", lastError);
        throw lastError || new Error("Could not access microphone");
    }

    /**
     * Stop recording and return a Promise that resolves with the final Blob.
     * This prevents the race condition where upload runs before onstop fires.
     */
    stopVoiceRecording(silent = false) {
        if (this._durationTimer) {
            clearTimeout(this._durationTimer);
            this._durationTimer = null;
        }

        if (!this.mediaRecorder || this.mediaRecorder.state === "inactive") {
            return Promise.resolve(this.currentAudioBlob);
        }

        // Create a promise that will be resolved inside onstop
        this._stopPromise = new Promise((resolve) => {
            this._stopResolve = resolve;
        });

        try {
            this.mediaRecorder.stop();
        } catch (e) {
            console.warn("Error stopping MediaRecorder:", e);
            if (this._stopResolve) {
                this._stopResolve(this.currentAudioBlob);
                this._stopResolve = null;
            }
        }

        // Always stop the tracks
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }

        if (!silent) {
            console.log("🛑 Stop requested – waiting for final blob...");
        }

        return this._stopPromise;
    }

    // Convenience toggle used by UI
    async toggleVoiceRecording(btn) {
        const isRecording = this.mediaRecorder && this.mediaRecorder.state === "recording";

        if (!isRecording) {
            try {
                await this.startVoiceRecording();
                if (btn) {
                    btn.classList.add('recording-active', 'animate-pulse');
                }
            } catch (err) {
                throw err; // let caller show toast
            }
        } else {
            const blob = await this.stopVoiceRecording();
            if (btn) {
                btn.classList.remove('recording-active', 'animate-pulse');
            }
            return blob;
        }
    }

    // ---------- Pending media helpers ----------
    setPendingImage(file, hash, exif = null) {
        this.pendingImage = file;
        this.pendingImageHash = hash;
        this.pendingExif = exif;
    }

    getPendingMedia() {
        return {
            imageUrl: null,
            audioUrl: null,
            imageHash: this.pendingImageHash,
            audioHash: null,
            exif: this.pendingExif
        };
    }

    clearPendingMedia() {
        this.pendingImage = null;
        this.pendingImageHash = null;
        this.pendingExif = null;
        this.currentAudioBlob = null;
        this.audioChunks = [];
    }

    async generateAudioHash(blob) {
        if (!blob || blob.size === 0) return null;
        // Real hash should come from utils.generateSha256Hash – this is just a fallback
        return "audio_hash_" + Date.now() + "_" + blob.size;
    }
}

// Citizen Talk Engine
export class CitizenTalkEngine extends BaseEngine {
    constructor(db, storage) {
        super(db, storage);
    }
}

// Truth Witness Engine
export class TruthWitnessEngine extends BaseEngine {
    constructor(db, storage) {
        super(db, storage);
    }
}
