/**
 * VocalWitness Engine - Two-Lungs Architecture
 * Production version – reliable blob finalization + pause/resume + waveform
 */

export class BaseEngine {
    constructor(db, storage) {
        this.db = db;
        this.storage = storage;

        // Recorder state
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.currentAudioBlob = null;
        this.stream = null;

        // Stop promise (prevents race conditions)
        this._stopPromise = null;
        this._stopResolve = null;
        this._durationTimer = null;

        // Timer
        this._recordingStartedAt = null;
        this._totalPausedMs = 0;
        this._pausedAt = null;

        // Waveform
        this._audioCtx = null;
        this._analyser = null;

        // Pending image (legacy helpers)
        this.pendingImage = null;
        this.pendingImageHash = null;
        this.pendingExif = null;
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
            if (MediaRecorder.isTypeSupported(type)) return type;
        }
        return '';
    }

    // ---------- Internal cleanup ----------
    _cleanupAudioGraph() {
        if (this._audioCtx) {
            this._audioCtx.close().catch(() => {});
            this._audioCtx = null;
            this._analyser = null;
        }
    }

    _cleanupStream() {
        if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
            this.stream = null;
        }
    }

    _resetTimerState() {
        this._recordingStartedAt = null;
        this._totalPausedMs = 0;
        this._pausedAt = null;
    }

    // ---------- Start with retry ----------
    async startVoiceRecording(durationLimit = 300000, maxRetries = 3) {
        // Clean any previous session
        await this.stopVoiceRecording(true);

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

                // Collect non-empty chunks
                this.mediaRecorder.ondataavailable = (event) => {
                    if (event.data && event.data.size > 0) {
                        this.audioChunks.push(event.data);
                    }
                };

                // Finalize blob
                this.mediaRecorder.onstop = () => {
                    this.currentAudioBlob = new Blob(this.audioChunks, {
                        type: this.mediaRecorder?.mimeType || 'audio/webm'
                    });
                    console.log("✅ Recording stopped. Blob size:", this.currentAudioBlob.size, "bytes");

                    if (this._stopResolve) {
                        this._stopResolve(this.currentAudioBlob);
                        this._stopResolve = null;
                        this._stopPromise = null;
                    }
                };

                this.mediaRecorder.onerror = (e) => {
                    console.error("MediaRecorder error:", e);
                };

                // Live waveform via Web Audio API
                try {
                    const AudioContext = window.AudioContext || window.webkitAudioContext;
                    this._audioCtx = new AudioContext();
                    const source = this._audioCtx.createMediaStreamSource(this.stream);
                    this._analyser = this._audioCtx.createAnalyser();
                    this._analyser.fftSize = 256;
                    source.connect(this._analyser);
                } catch (e) {
                    console.warn("AnalyserNode unavailable:", e);
                    this._analyser = null;
                }

                // Timer baseline
                this._recordingStartedAt = Date.now();
                this._totalPausedMs = 0;
                this._pausedAt = null;

                // Start with timeslice (critical for non-empty final blob)
                this.mediaRecorder.start(1000);
                console.log("🎤 Recording started...");

                // Auto-stop
                if (durationLimit > 0) {
                    this._durationTimer = setTimeout(() => {
                        console.log("⏱️ Duration limit reached – stopping recording");
                        this.stopVoiceRecording();
                    }, durationLimit);
                }

                return; // success
            } catch (err) {
                lastError = err;
                console.warn(`Microphone attempt ${attempt} failed:`, err.message || err);

                this._cleanupStream();
                this._cleanupAudioGraph();

                if (attempt < maxRetries) {
                    await new Promise(r => setTimeout(r, 600 * attempt));
                }
            }
        }

        console.error("Microphone access failed after retries:", lastError);
        throw lastError || new Error("Could not access microphone");
    }

    /**
     * Stop recording and return a Promise that resolves with the final Blob.
     */
    stopVoiceRecording(silent = false) {
        if (this._durationTimer) {
            clearTimeout(this._durationTimer);
            this._durationTimer = null;
        }

        if (!this.mediaRecorder || this.mediaRecorder.state === "inactive") {
            this._cleanupStream();
            this._cleanupAudioGraph();
            this._resetTimerState();
            return Promise.resolve(this.currentAudioBlob);
        }

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

        // Stop tracks immediately
        this._cleanupStream();
        this._cleanupAudioGraph();
        this._resetTimerState();

        if (!silent) {
            console.log("🛑 Stop requested – waiting for final blob...");
        }

        return this._stopPromise;
    }

    // ---------- Pause / Resume ----------
    get isPaused() {
        return this.mediaRecorder?.state === 'paused';
    }

    pauseVoiceRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.pause();
            this._pausedAt = Date.now();
            console.log('⏸ Recording paused');
        }
    }

    resumeVoiceRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
            this.mediaRecorder.resume();
            if (this._pausedAt) {
                this._totalPausedMs += Date.now() - this._pausedAt;
                this._pausedAt = null;
            }
            console.log('▶️ Recording resumed');
        }
    }

    // ---------- Timer ----------
    getElapsedMs() {
        if (!this._recordingStartedAt) return 0;
        const now = (this.isPaused && this._pausedAt) ? this._pausedAt : Date.now();
        return Math.max(0, now - this._recordingStartedAt - (this._totalPausedMs || 0));
    }

    // ---------- Waveform ----------
    getWaveformData() {
        if (!this._analyser) return null;
        const data = new Uint8Array(this._analyser.frequencyBinCount);
        this._analyser.getByteFrequencyData(data);
        return data;
    }

    // ---------- Convenience toggle ----------
    async toggleVoiceRecording(btn) {
        const isActive = this.mediaRecorder &&
            (this.mediaRecorder.state === 'recording' || this.mediaRecorder.state === 'paused');

        if (!isActive) {
            await this.startVoiceRecording();
            if (btn) btn.classList.add('recording-active', 'animate-pulse');
        } else {
            const blob = await this.stopVoiceRecording();
            if (btn) btn.classList.remove('recording-active', 'animate-pulse');
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
        return "audio_hash_" + Date.now() + "_" + blob.size;
    }
}

// Citizen Talk Engine
export class CitizenTalkEngine extends BaseEngine {
    constructor(db, storage) {
        super(db, storage);
    }
}

// Witness Voice Engine
export class WitnessVoiceEngine extends BaseEngine {
    constructor(db, storage) {
        super(db, storage);
    }
}
