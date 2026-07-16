/**
 * VocalWitness Engine - Two-Lungs Architecture
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
    }

    async startVoiceRecording(durationLimit = 300000) {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: 'audio/webm' });
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) this.audioChunks.push(event.data);
            };

            this.mediaRecorder.onstop = () => {
                this.currentAudioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                console.log("✅ Recording stopped. Blob size:", this.currentAudioBlob.size);
            };

            this.mediaRecorder.start();
            console.log("🎤 Recording started...");
        } catch (err) {
            console.error("Microphone access failed:", err);
            throw err;
        }
    }

    stopVoiceRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
            this.mediaRecorder.stop();
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
            }
        }
    }

    // New: Toggle for easier use from main.js
    toggleVoiceRecording(btn) {
        const isRecording = this.mediaRecorder && this.mediaRecorder.state === "recording";
        if (!isRecording) {
            this.startVoiceRecording();
        } else {
            this.stopVoiceRecording();
        }
    }

    // New: Safe pending media storage
    setPendingImage(file, hash, exif = null) {
        this.pendingImage = file;
        this.pendingImageHash = hash;
        this.pendingExif = exif;
    }

    getPendingMedia() {
        return {
            imageUrl: null, // will be set during upload
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
    }

    async generateAudioHash(blob) {
        if (!blob) return null;
        return "audio_hash_" + Date.now();
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
