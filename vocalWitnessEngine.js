/**
 * VocalWitness Engine - Core Frontend Architecture Module
 * Handles: Digital Campfires, Integrity Ledgers, and Democratic Moderation
 * Upgraded to Firebase v10 Modular SDK Standards
 */

import { 
    collection, 
    doc, 
    addDoc, 
    runTransaction 
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

  /**
   * Starts recording with enforced duration limits
   * @param {string} feedType - 'citizen-talk' (2m) or 'witness-voice' (5m)
   */
  async startVoiceRecording(feedType) {
    this.audioChunks = [];
    // Duration Logic: 120,000ms (2m) vs 300,000ms (5m)
    const durationLimit = (feedType === 'witness-voice') ? 300000 : 120000;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        // Example check inside your Engine's upload method
async function validateWitnessAccess(user) {
  const userRef = doc(this.db, 'users', user.uid);
  const userDoc = await getDoc(userRef);
  
  // Rule: Only users with 'isWitnessVerified: true' can access Witness Voice
  if (!userDoc.data().isWitnessVerified) {
    throw new Error("Witness Voice access requires verified identity.");
  }
}
      
      // Auto-stop safety timer
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

  /**
   * Generates a unique SHA-256 cryptographic hash of the voice asset
   */
  async generateAudioHash(blob) {
    const arrayBuffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Bundles the audio asset with its verified metadata
   */
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
      moderation: { trustScore: 100, verificationsCount: 0, disputesCount: 0, votedUsers: [] }
    };

    return await addDoc(collection(this.db, 'testimonies'), testimonyPayload);
  }

  /**
   * Updates the truth ledger based on peer votes
   */
  async submitPeerVote(testimonyId, userId, voteType) {
    const docRef = doc(this.db, 'testimonies', testimonyId);
    return runTransaction(this.db, async (transaction) => {
      const sfDoc = await transaction.get(docRef);
      if (!sfDoc.exists()) throw new Error("Document not found.");

      const data = sfDoc.data();
      const mod = data.moderation;
      if (mod.votedUsers.includes(userId)) throw new Error("Already audited.");

      const newVerifications = (voteType === 'verify') ? mod.verificationsCount + 1 : mod.verificationsCount;
      const newDisputes = (voteType === 'dispute') ? mod.disputesCount + 1 : mod.disputesCount;
      const total = newVerifications + newDisputes;

      transaction.update(docRef, {
        'moderation.verificationsCount': newVerifications,
        'moderation.disputesCount': newDisputes,
        'moderation.trustScore': Math.round((newVerifications / total) * 100),
        'moderation.votedUsers': [...mod.votedUsers, userId]
      });
    });
  }
}
