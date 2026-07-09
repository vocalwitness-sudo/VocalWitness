/**
 * VocalWitness Core Engine - Clean & Reliable Version
 */
import { generateSha256Hash } from './utils.js';
import { db, auth } from './firebase-config.js';   
    ref,
    uploadBytes,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js";

export class VocalWitnessEngine {
    constructor(db) {
        this.db = db;                    // Only need db for now
        this.storage = null;             // Will be set if needed
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.currentAudioBlob = null;
        this.recordingTimeout = null;
        this.mediaStream = null;         // For proper cleanup
    }

    setStorage(storage) {
        this.storage = storage;
    }

    // ==================== VOICE RECORDING ====================
    async startVoiceRecording(maxDurationMs = 180000) {
        this.audioChunks = [];
        
        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 44100
                }
            });

            this.mediaRecorder = new MediaRecorder(this.mediaStream, {
                mimeType: 'audio/webm;codecs=opus'
            });

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) this.audioChunks.push(event.data);
            };

            this.mediaRecorder.onstop = () => {
                this.currentAudioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                this.cleanupStream();
                console.log("🎙️ Recording stopped. Blob size:", this.currentAudioBlob.size);
            };

            this.mediaRecorder.start();
            
            // Auto-stop after max duration
            this.recordingTimeout = setTimeout(() => {
                this.stopVoiceRecording();
            }, maxDurationMs);

            console.log(`🎙️ Recording started (max ${maxDurationMs/1000}s)`);
            return true;

        } catch (err) {
            console.error("Microphone access error:", err);
            this.cleanupStream();
            throw new Error("Microphone permission denied or not available.");
        }
    }

    stopVoiceRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
        if (this.recordingTimeout) {
            clearTimeout(this.recordingTimeout);
            this.recordingTimeout = null;
        }
    }

    cleanupStream() {
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
    }

    // ==================== UPLOAD FORENSIC MEDIA ====================
    async uploadCurrentAudio(userId) {
        if (!this.currentAudioBlob) throw new Error("No audio recorded");
        if (!this.storage) throw new Error("Storage not initialized");

        try {
            const hash = await generateSha256Hash(this.currentAudioBlob);
            
            const storageRef = ref(this.storage, `testimonies/${userId}_${Date.now()}.webm`);
            await uploadBytes(storageRef, this.currentAudioBlob);
            const audioUrl = await getDownloadURL(storageRef);

            return {
                audioUrl,
                audioHash: hash
            };
        } catch (err) {
            console.error("Audio upload failed:", err);
            throw err;
        }
    }

    // Reset for next recording
    reset() {
        this.stopVoiceRecording();
        this.currentAudioBlob = null;
        this.audioChunks = [];
    }
}
