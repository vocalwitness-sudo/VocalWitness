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
  }

  // ==========================================
  // 1. DIGITAL CAMPFIRES: Segmented Feed Logic
  // ==========================================
  /**
   * Filters the UI feed based on user's chosen "Campfire" mode
   * @param {string} mode - 'citizen-talk', 'true-witness', or a specific language code (e.g. '+252')
   */
  filterFeedMode(mode) {
    console.log(`Switching campfire feed to: ${mode}`);
    const feedCards = document.querySelectorAll('.testimony-card');
    
    feedCards.forEach(card => {
      const cardMode = card.getAttribute('data-mode');
      const cardLang = card.getAttribute('data-lang');

      if (mode === 'citizen-talk') {
        // Public feed shows all base entries
        card.style.display = 'block';
      } else if (mode === 'true-witness' && cardMode === 'true-witness') {
        // Show high-integrity premium verification updates only
        card.style.display = 'block';
      } else if (cardLang === mode) {
        // Filter by specific language/country code community
        card.style.display = 'block';
      } else {
        card.style.display = 'none';
      }
    });
  }

  // ==========================================
  // 2. THE TRUST CURRENCY: Voice Integrity Ledger
  // ==========================================
  /**
   * Starts the browser Web Audio API recording session
   */
  async startVoiceRecording() {
    this.audioChunks = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Using audio/webm as it is widely supported across modern mobile browsers
      this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        // Compressed audio blob ready for mobile networks
        this.currentAudioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        console.log("Voice recording captured successfully.");
      };

      this.mediaRecorder.start();
    } catch (err) {
      console.error("Error accessing microphone: ", err);
      alert("Microphone access is required to record testimony.");
    }
  }

  /**
   * Stops active recording
   */
  stopVoiceRecording() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
  }

  /**
   * Generates a unique SHA-256 cryptographic hash of the voice asset
   * This proves the file has not been altered or tampered with post-upload
   */
  async generateAudioHash(blob) {
    const arrayBuffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Bundles the audio asset with its verified metadata payload
   */
  async packageAndUploadTestimony(userId, selectedLanguageCode, feedType = 'citizen-talk') {
    if (!this.currentAudioBlob) {
      throw new Error("No voice recording found to upload.");
    }

    // Generate integrity marker before sending over network
    const integrityHash = await this.generateAudioHash(this.currentAudioBlob);
    const timestamp = new Date().toISOString();
    const storageRefPath = `testimonies/${userId}_${Date.now()}.webm`;

    // 1. Upload file to Firebase Storage via v10 modular function patterns
    const storageReference = ref(this.storage, storageRefPath);
    const uploadResult = await uploadBytes(storageReference, this.currentAudioBlob);
    const downloadURL = await getDownloadURL(uploadResult.ref);

    // 2. Construct the tamper-proof ledger document
    const testimonyPayload = {
      authorId: userId,
      audioUrl: downloadURL,
      storagePath: storageRefPath,
      timestamp: timestamp,
      languageCode: selectedLanguageCode, // Values like '+234', '+255', '+252'
      feedVisibility: feedType,           // 'citizen-talk' or 'true-witness'
      integrityHash: integrityHash,       // Immutability proof
      moderation: {
        trustScore: 100,
        verificationsCount: 0,
        disputesCount: 0,
        votedUsers: []                    // Prevents double voting
      }
    };

    // 3. Save to Firestore collection using addDoc()
    const targetCollection = collection(this.db, 'testimonies');
    const docRef = await addDoc(targetCollection, testimonyPayload);
    return docRef.id;
  }

  // ==========================================
  // 3. DEMOCRATIC MODERATION: Peer Ledger Auditing
  // ==========================================
  /**
   * Updates the truth ledger based on peer votes directly from the UI
   * @param {string} testimonyId - The Firestore document reference ID
   * @param {string} userId - The current user voting
   * @param {string} voteType - 'verify' or 'dispute'
   */
  async submitPeerVote(testimonyId, userId, voteType) {
    const docRef = doc(this.db, 'testimonies', testimonyId);
    
    return runTransaction(this.db, async (transaction) => {
      const sfDoc = await transaction.get(docRef);
      if (!sfDoc.exists()) {
        throw new Error("Document does not exist!");
      }

      const data = sfDoc.data();
      const moderation = data.moderation || { trustScore: 100, verificationsCount: 0, disputesCount: 0, votedUsers: [] };

      // Prevent a user from voting multiple times on the same record
      if (moderation.votedUsers.includes(userId)) {
        throw new Error("You have already audited this testimony.");
      }

      let newVerifications = moderation.verificationsCount || 0;
      let newDisputes = moderation.disputesCount || 0;

      if (voteType === 'verify') {
        newVerifications += 1;
      } else if (voteType === 'dispute') {
        newDisputes += 1;
      }

      // Calculate dynamic community trust percentage
      const totalVotes = newVerifications + newDisputes;
      const newTrustScore = totalVotes > 0 ? Math.round((newVerifications / totalVotes) * 100) : 100;

      // Update the ledger immutably inside the transaction block
      transaction.update(docRef, {
        'moderation.verificationsCount': newVerifications,
        'moderation.disputesCount': newDisputes,
        'moderation.trustScore': newTrustScore,
        'moderation.votedUsers': [...moderation.votedUsers, userId]
      });

      return { trustScore: newTrustScore, totalVotes };
    });
  }
}
