/**
 * VocalWitness Core Engine
 * Unified with Witness Token support
 */
import {
    collection,
    doc,
    getDoc,
    addDoc,
    setDoc,
    runTransaction
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

import {
    ref,
    uploadBytes,
    getDownloadURL
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js";

import { generateSha256Hash } from './utils.js';

export class VocalWitnessEngine {
    constructor(db, storage) {
        this.db = db;
        this.storage = storage;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.currentAudioBlob = null;
        this.recordingTimeout = null;
    }

    // ==================== VOICE RECORDING ====================
    async startVoiceRecording(feedType = 'citizen-talk') {
        this.audioChunks = [];
        const durationLimit = (feedType === 'witness-voice') ? 300000 : 180000;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: { echoCancellation: true, noiseSuppression: true } 
            });

            this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            this.recordingTimeout = setTimeout(() => this.stopVoiceRecording(), durationLimit);

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) this.audioChunks.push(event.data);
            };

            this.mediaRecorder.onstop = () => {
                this.currentAudioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                clearTimeout(this.recordingTimeout);
            };

            this.mediaRecorder.start();
            console.log("🎙️ Recording started...");
        } catch (err) {
            console.error("Microphone error:", err);
            alert("Microphone access is required for voice testimony.");
        }
    }

    stopVoiceRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
            clearTimeout(this.recordingTimeout);
        }
    }

    // ==================== WITNESS TOKEN ====================
    async createWitnessToken(uid) {
        const token = crypto.randomUUID();
        await setDoc(doc(this.db, "verifiable_docs", token), {
            ownerId: uid,
            timestamp: new Date().toISOString(),
            verified: true,
            status: "active"
        });
        return token;
    }

    // ==================== UPLOAD TESTIMONY ====================
    async packageAndUploadTestimony(userId, selectedLanguageCode = "en", feedType = 'citizen-talk') {
        if (!this.currentAudioBlob) throw new Error("No recording available.");

        const integrityHash = await generateSha256Hash(this.currentAudioBlob);
        const storageRefPath = `testimonies/${userId}_${Date.now()}.webm`;
        const storageReference = ref(this.storage, storageRefPath);

        await uploadBytes(storageReference, this.currentAudioBlob);
        const downloadURL = await getDownloadURL(storageReference);

        const testimonyPayload = {
            authorId: userId,
            audioUrl: downloadURL,
            timestamp: new Date().toISOString(),
            languageCode: selectedLanguageCode,
            feedVisibility: feedType,
            integrityHash: integrityHash,
            moderation: { 
                trustScore: 100, 
                verificationsCount: 0, 
                disputesCount: 0 
            }
        };

        return await addDoc(collection(this.db, 'testimonies'), testimonyPayload);
    }

    // Peer voting (kept from your second version)
    async submitPeerVote(testimonyId, userId, voteType) {
        // ... your existing logic (optional for now)
        console.log(`Vote ${voteType} submitted for ${testimonyId}`);
    }
}
