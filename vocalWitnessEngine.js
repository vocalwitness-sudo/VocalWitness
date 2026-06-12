/**
 * VocalWitness Engine - Core Frontend Architecture Module
 * Upgraded with Scalable Sub-collection Ledger
 */

import { 
    collection, 
    doc, 
    getDoc, 
    addDoc, 
    runTransaction,
    setDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { 
    ref, 
    uploadBytes, 
    getDownloadURL 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

export class VocalWitnessEngine {
    constructor(firebaseFirestore, firebaseStorage) {
        this.db = firebaseFirestore;
        this.storage = firebaseStorage;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.currentAudioBlob = null;
        this.recordingTimeout = null;
    }

    async validateWitnessAccess(userId) {
        const userRef = doc(this.db, 'users', userId);
        const userDoc = await getDoc(userRef);
        if (!userDoc.exists() || !userDoc.data().isWitnessVerified) {
            throw new Error("Witness Voice access requires verified identity.");
        }
    }

    async startVoiceRecording(feedType) {
        this.audioChunks = [];
        const durationLimit = (feedType === 'witness-voice') ? 300000 : 120000;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

            this.recordingTimeout = setTimeout(() => {
                if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
                    this.stopVoiceRecording();
                }
            }, durationLimit);

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) this.audioChunks.push(event.data);
            };

            this.mediaRecorder.onstop = () => {
                this.currentAudioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                clearTimeout(this.recordingTimeout);
            };

            this.mediaRecorder.start();
        } catch (err) {
            console.error("Microphone access denied: ", err);
            alert("Microphone access is required to record testimony.");
        }
    }

    stopVoiceRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
            clearTimeout(this.recordingTimeout);
        }
    }

    async generateAudioHash(blob) {
        const arrayBuffer = await blob.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
        return Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async packageAndUploadTestimony(userId, selectedLanguageCode, feedType = 'citizen-talk') {
        if (!this.currentAudioBlob) throw new Error("No recording available.");

        const integrityHash = await this.generateAudioHash(this.currentAudioBlob);
        const storageRefPath = `testimonies/${userId}_${Date.now()}.webm`;

        const storageReference = ref(this.storage, storageRefPath);
        const uploadResult = await uploadBytes(storageReference, this.currentAudioBlob);
        const downloadURL = await getDownloadURL(uploadResult.ref);

        const testimonyPayload = {
            authorId: userId,
            audioUrl: downloadURL,
            timestamp: new Date().toISOString(),
            languageCode: selectedLanguageCode,
            feedVisibility: feedType,
            integrityHash: integrityHash,
            moderation: { trustScore: 100, verificationsCount: 0, disputesCount: 0 }
        };

        return await addDoc(collection(this.db, 'testimonies'), testimonyPayload);
    }

    async submitPeerVote(testimonyId, userId, voteType) {
        const testimonyRef = doc(this.db, 'testimonies', testimonyId);
        const voteRef = doc(this.db, 'testimonies', testimonyId, 'votes', userId);

        return runTransaction(this.db, async (transaction) => {
            const testimonyDoc = await transaction.get(testimonyRef);
            const voteDoc = await transaction.get(voteRef);

            if (!testimonyDoc.exists()) throw new Error("Testimony not found.");
            if (voteDoc.exists()) throw new Error("User has already voted.");

            const data = testimonyDoc.data();
            const mod = data.moderation;

            const newVerifications = (voteType === 'verify') ? mod.verificationsCount + 1 : mod.verificationsCount;
            const newDisputes = (voteType === 'dispute') ? mod.disputesCount + 1 : mod.disputesCount;
            const total = newVerifications + newDisputes;

            transaction.update(testimonyRef, {
                'moderation.verificationsCount': newVerifications,
                'moderation.disputesCount': newDisputes,
                'moderation.trustScore': Math.round((newVerifications / total) * 100)
            });

            transaction.set(voteRef, { 
                voteType: voteType, 
                timestamp: new Date().toISOString() 
            });
        });
    }
}
