// js/engine.js
/**
 * VocalWitness Core Engine - Unified Business Logic
 */
import { collection, addDoc, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
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

    async startVoiceRecording(durationLimit = 120000) {
        this.audioChunks = [];
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) this.audioChunks.push(e.data);
            };

            this.mediaRecorder.onstop = () => {
                this.currentAudioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                stream.getTracks().forEach(track => track.stop());
            };

            this.mediaRecorder.start();
            setTimeout(() => this.stopVoiceRecording(), durationLimit);
        } catch (err) {
            console.error(err);
            alert("Microphone access required.");
        }
    }

    stopVoiceRecording() {
        if (this.mediaRecorder?.state === "recording") {
            this.mediaRecorder.stop();
        }
    }

    async uploadTestimony(userId, languageCode = "en", feedType = "citizen-talk") {
        if (!this.currentAudioBlob) throw new Error("No audio recorded");

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
            moderation: { trustScore: 100, verificationsCount: 0, disputesCount: 0 }
        };

        return await addDoc(collection(this.db, "testimonies"), payload);
    }
}
