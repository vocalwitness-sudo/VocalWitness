/**
 * VocalWitness Core Engine - Unified Business Logic
 */
import { collection, addDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js";
import { generateSha256Hash } from './utils.js';

export class VocalWitnessEngine {
    constructor(db, storage) {
        this.db = db;
        this.storage = storage;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.currentAudioBlob = null;
    }

    // ==================== VOICE RECORDING ====================
    async startVoiceRecording(durationLimit = 180000) { // 3 minutes default
        this.audioChunks = [];
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: { 
                    echoCancellation: true,
                    noiseSuppression: true 
                } 
            });
            
            this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            
            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) this.audioChunks.push(e.data);
            };

            this.mediaRecorder.onstop = () => {
                this.currentAudioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                stream.getTracks().forEach(track => track.stop());
                console.log("🎤 Voice recording completed");
            };

            this.mediaRecorder.start();
            console.log("🎙️ Recording started...");

            // Auto-stop after duration
            setTimeout(() => this.stopVoiceRecording(), durationLimit);

        } catch (err) {
            console.error("Microphone error:", err);
            alert("Microphone access is required for voice testimony.");
        }
    }

    stopVoiceRecording() {
        if (this.mediaRecorder?.state === "recording") {
            this.mediaRecorder.stop();
        }
    }

    // ==================== UPLOAD TESTIMONY ====================
    async uploadTestimony(userId = "anonymous", languageCode = "en", feedType = "citizen-talk") {
        if (!this.currentAudioBlob) {
            throw new Error("No audio recorded");
        }

        try {
            const hash = await generateSha256Hash(this.currentAudioBlob);
            const storageRef = ref(this.storage, `testimonies/${userId}_${Date.now()}.webm`);
            
            await uploadBytes(storageRef, this.currentAudioBlob);
            const audioUrl = await getDownloadURL(storageRef);

            const payload = {
                authorId: userId,
                audioUrl,
                timestamp: new Date().toISOString(),
                languageCode,
                feedVisibility: feedType,
                integrityHash: hash,
                moderation: { 
                    trustScore: 100, 
                    verificationsCount: 0, 
                    disputesCount: 0 
                }
            };

            const docRef = await addDoc(collection(this.db, "testimonies"), payload);
            console.log("✅ Testimony uploaded successfully:", docRef.id);
            return docRef;
        } catch (error) {
            console.error("Upload failed:", error);
            throw error;
        }
    }

    // ZK Verification Stub (for future expansion)
    async startZKVerification(identityData) {
        return new Promise((resolve) => {
            console.log("🔐 Starting ZK Proof generation...");
            setTimeout(() => {
                resolve({
                    success: true,
                    proof: "zk_proof_simulated_" + Date.now(),
                    timestamp: new Date().toISOString()
                });
            }, 1500);
        });
    }
}
