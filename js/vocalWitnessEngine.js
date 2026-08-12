/**
 * VocalWitness Engine – Two-Lungs Architecture
 * Production version (Cloudflare R2 Integration)
 *
 * - Reliable MediaRecorder finalization (timeslice + stop promise + safety timeout)
 * - Pause / resume with accurate elapsed time
 * - Live waveform (AnalyserNode)
 * - Real SHA-256 forensic hashing
 * - R2 Worker API uploads (UUID paths)
 * - Size & duration limits
 * - Single `testimonies` collection + targetFeed
 * - Client NEVER writes zkVerified (only Cloud Function after real proof)
 * - Image EXIF must be scrubbed before setPendingImage (use imageScrubber.js)
 */

import { auth } from './firebase-config.js';
import {
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const R2_UPLOAD_ENDPOINT = 'https://media.vocalwitness.com/upload';
const MAX_AUDIO_BYTES   = 8 * 1024 * 1024;   // 8 MB
const MAX_DURATION_MS   = 5 * 60 * 1000;     // 5 minutes
const TIMESLICE_MS      = 1000;
const STOP_SAFETY_MS    = 4000;
const MIC_MAX_RETRIES   = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
export async function blobToArrayBuffer(blob) {
  if (!blob) return null;
  return blob.arrayBuffer();
}

/**
 * Real SHA-256 of a Blob / ArrayBuffer / string
 */
export async function sha256(data) {
  let buffer;
  if (data instanceof Blob) {
    buffer = await data.arrayBuffer();
  } else if (data instanceof ArrayBuffer) {
    buffer = data;
  } else if (typeof data === 'string') {
    buffer = new TextEncoder().encode(data);
  } else {
    return null;
  }
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Direct upload to Cloudflare R2 worker endpoint with progress reporting.
 * Paths are UUID-based to avoid collisions and filename leaks.
 */
export async function uploadMediaAsset(file, folder, uid, onProgress = null) {
  if (!file || !uid) return null;

  const ext = (file.type || 'application/octet-stream')
    .split('/')[1]
    ?.split(';')[0] || 'bin';

  const path = `${folder}/${uid}/${crypto.randomUUID()}.${ext}`;

  return new Promise(async (resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `${R2_UPLOAD_ENDPOINT}?key=${encodeURIComponent(path)}`, true);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

    try {
      if (auth.currentUser) {
        const token = await auth.currentUser.getIdToken();
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }
    } catch (err) {
      console.warn('[Engine] Could not retrieve Auth Token for R2 Upload:', err);
    }

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable) {
          const percent = Math.round((evt.loaded / evt.total) * 100);
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          resolve(res.url || `https://media.vocalwitness.com/${path}`);
        } catch (_) {
          resolve(`https://media.vocalwitness.com/${path}`);
        }
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during asset upload.'));
    xhr.send(file);
  });
}

// ---------------------------------------------------------------------------
// BaseEngine
// ---------------------------------------------------------------------------
export class BaseEngine {
  constructor(db, storage = null) {
    this.db = db;
    this.storage = storage;

    // Recorder
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.currentAudioBlob = null;
    this.stream = null;

    // Stop coordination
    this._stopPromise = null;
    this._stopResolve = null;
    this._stopSafetyTimer = null;

    // Duration timer
    this._durationTimer = null;
    this._recordingStartedAt = null;
    this._totalPausedMs = 0;
    this._pausedAt = null;

    // Waveform
    this._audioCtx = null;
    this._analyser = null;

    // Pending image (must already be scrubbed)
    this.pendingImage = null;
    this.pendingImageHash = null;
    this.pendingExif = null;
  }

  _getSupportedMimeType() {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4'
    ];
    for (const t of candidates) {
      if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return '';
  }

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
    if (this._durationTimer) {
      clearTimeout(this._durationTimer);
      this._durationTimer = null;
    }
    this._recordingStartedAt = null;
    this._totalPausedMs = 0;
    this._pausedAt = null;
  }

  _clearStopSafety() {
    if (this._stopSafetyTimer) {
      clearTimeout(this._stopSafetyTimer);
      this._stopSafetyTimer = null;
    }
  }

  async startVoiceRecording(durationLimit = MAX_DURATION_MS, maxRetries = MIC_MAX_RETRIES) {
    await this.stopVoiceRecording(true);

    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
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

        this.mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) this.audioChunks.push(e.data);
        };

        this.mediaRecorder.onstop = () => {
          this._clearStopSafety();

          this.currentAudioBlob = new Blob(this.audioChunks, {
            type: this.mediaRecorder?.mimeType || 'audio/webm'
          });

          this._cleanupStream();
          this._cleanupAudioGraph();

          if (this._stopResolve) {
            this._stopResolve(this.currentAudioBlob);
            this._stopResolve = null;
            this._stopPromise = null;
          }
        };

        this.mediaRecorder.onerror = (e) => {
          console.error('[Engine] MediaRecorder error:', e);
        };

        try {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (AC) {
            this._audioCtx = new AC();
            if (this._audioCtx.state === 'suspended') {
              await this._audioCtx.resume();
            }
            const source = this._audioCtx.createMediaStreamSource(this.stream);
            this._analyser = this._audioCtx.createAnalyser();
            this._analyser.fftSize = 256;
            source.connect(this._analyser);
          }
        } catch (e) {
          console.warn('[Engine] Analyser init failed:', e);
          this._analyser = null;
        }

        this._recordingStartedAt = Date.now();
        this._totalPausedMs = 0;
        this._pausedAt = null;

        this.mediaRecorder.start(TIMESLICE_MS);

        if (typeof this.mediaRecorder.requestData === 'function') {
          this.mediaRecorder.requestData();
        }

        if (durationLimit > 0) {
          this._durationTimer = setTimeout(() => {
            this.stopVoiceRecording();
          }, durationLimit);
        }

        return;
      } catch (err) {
        lastError = err;
        this._cleanupStream();
        this._cleanupAudioGraph();
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 600 * attempt));
        }
      }
    }

    throw lastError || new Error('Could not access microphone');
  }

  stopVoiceRecording(silent = false) {
    this._resetTimerState();

    if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
      this._cleanupStream();
      this._cleanupAudioGraph();
      return Promise.resolve(this.currentAudioBlob);
    }

    if (this._stopPromise) return this._stopPromise;

    this._stopPromise = new Promise((resolve) => {
      this._stopResolve = resolve;
    });

    this._stopSafetyTimer = setTimeout(() => {
      if (this._stopResolve) {
        this.currentAudioBlob = new Blob(this.audioChunks, {
          type: this.mediaRecorder?.mimeType || 'audio/webm'
        });
        this._cleanupStream();
        this._cleanupAudioGraph();
        this._stopResolve(this.currentAudioBlob);
        this._stopResolve = null;
        this._stopPromise = null;
      }
    }, STOP_SAFETY_MS);

    try {
      this.mediaRecorder.stop();
    } catch (e) {
      this._clearStopSafety();
      this._cleanupStream();
      this._cleanupAudioGraph();
      if (this._stopResolve) {
        this._stopResolve(this.currentAudioBlob);
        this._stopResolve = null;
        this._stopPromise = null;
      }
    }

    return this._stopPromise;
  }

  get isPaused() {
    return this.mediaRecorder?.state === 'paused';
  }

  get isRecording() {
    return this.mediaRecorder?.state === 'recording';
  }

  pauseVoiceRecording() {
    if (this.mediaRecorder?.state === 'recording') {
      this.mediaRecorder.pause();
      this._pausedAt = Date.now();
    }
  }

  resumeVoiceRecording() {
    if (this.mediaRecorder?.state === 'paused') {
      this.mediaRecorder.resume();
      if (this._pausedAt) {
        this._totalPausedMs += Date.now() - this._pausedAt;
        this._pausedAt = null;
      }
    }
  }

  getElapsedMs() {
    if (!this._recordingStartedAt) return 0;
    const now = (this.isPaused && this._pausedAt) ? this._pausedAt : Date.now();
    return Math.max(0, now - this._recordingStartedAt - (this._totalPausedMs || 0));
  }

  getElapsedFormatted() {
    const ms = this.getElapsedMs();
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  getWaveformData() {
    if (!this._analyser) return null;
    const data = new Uint8Array(this._analyser.frequencyBinCount);
    this._analyser.getByteFrequencyData(data);
    return data;
  }

  getNormalizedWaveform(barCount = 32) {
    const data = this.getWaveformData();
    if (!data || data.length === 0) return new Array(barCount).fill(0);

    const step = Math.max(1, Math.floor(data.length / barCount));
    const bars = [];
    for (let i = 0; i < barCount; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) {
        sum += data[i * step + j] || 0;
      }
      bars.push(Math.min(1, (sum / step) / 255));
    }
    return bars;
  }

  async toggleVoiceRecording(btn) {
    const active = this.mediaRecorder &&
      (this.mediaRecorder.state === 'recording' || this.mediaRecorder.state === 'paused');

    if (!active) {
      await this.startVoiceRecording();
      btn?.classList.add('recording-active', 'animate-pulse');
      return null;
    }

    const blob = await this.stopVoiceRecording();
    btn?.classList.remove('recording-active', 'animate-pulse');
    return blob;
  }

  setPendingImage(file, hash, safeExif = null) {
    this.pendingImage = file;
    this.pendingImageHash = hash;
    this.pendingExif = safeExif;
  }

  getPendingMedia() {
    return {
      image: this.pendingImage,
      imageHash: this.pendingImageHash,
      audioBlob: this.currentAudioBlob,
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
    return sha256(blob);
  }

  _assertWithinLimits() {
    if (this.currentAudioBlob && this.currentAudioBlob.size > MAX_AUDIO_BYTES) {
      throw new Error(`Recording exceeds maximum size of ${MAX_AUDIO_BYTES / 1024 / 1024} MB`);
    }
    if (this.getElapsedMs() > MAX_DURATION_MS + 2000) {
      throw new Error('Recording exceeds maximum duration');
    }
  }
}

// ---------------------------------------------------------------------------
// CitizenTalkEngine
// ---------------------------------------------------------------------------
export class CitizenTalkEngine extends BaseEngine {
  constructor(db, storage = null) {
    super(db, storage);
  }

  async submitCitizenTalk({ text = '', category = 'General', onProgress = null } = {}) {
    if (!auth.currentUser) throw new Error('Authentication required');

    this._assertWithinLimits();

    const uid = auth.currentUser.uid;
    let audioUrl = null;
    let audioHash = null;

    if (this.currentAudioBlob?.size > 0) {
      audioHash = await this.generateAudioHash(this.currentAudioBlob);
      audioUrl = await uploadMediaAsset(
        this.currentAudioBlob,
        'testimonies/audio',
        uid,
        onProgress
      );
    }

    const docData = {
      authorId: uid,
      author: auth.currentUser.displayName || 'Anonymous Witness',
      content: text || '',
      category,
      targetFeed: 'citizen_talk',
      audioUrl,
      imageUrl: null,
      audioHash,
      imageHash: null,
      forensicHash: audioHash || null,
      hasForensic: Boolean(audioHash),
      tier: 'citizen_circle',
      status: 'published',
      createdAt: serverTimestamp(),
      likes: 0,
      views: 0
    };

    const refDoc = await addDoc(collection(this.db, 'testimonies'), docData);
    this.clearPendingMedia();
    return refDoc.id;
  }
}

// ---------------------------------------------------------------------------
// WitnessVoiceEngine
// ---------------------------------------------------------------------------
export class WitnessVoiceEngine extends BaseEngine {
  constructor(db, storage = null) {
    super(db, storage);
  }

  async submitWitnessTestimony({
    title = 'Untitled Witness Statement',
    category = 'General',
    content = '',
    zkProof = null,
    onProgress = null
  } = {}) {
    if (!auth.currentUser) throw new Error('Authentication required');

    this._assertWithinLimits();

    const uid = auth.currentUser.uid;
    let audioUrl = null;
    let imageUrl = null;
    let audioHash = null;

    if (this.currentAudioBlob?.size > 0) {
      audioHash = await this.generateAudioHash(this.currentAudioBlob);
      audioUrl = await uploadMediaAsset(
        this.currentAudioBlob,
        'testimonies/audio',
        uid,
        onProgress
      );
    }

    if (this.pendingImage) {
      imageUrl = await uploadMediaAsset(
        this.pendingImage,
        'testimonies/images',
        uid,
        onProgress
      );
    }

    const forensicHash = audioHash || this.pendingImageHash || null;

    const docData = {
      authorId: uid,
      author: auth.currentUser.displayName || 'Anonymous Witness',
      title,
      category,
      content: content || '',
      targetFeed: 'witness_voice',
      audioUrl,
      imageUrl,
      audioHash,
      imageHash: this.pendingImageHash || null,
      forensicHash,
      hasForensic: Boolean(forensicHash),
      zkProofPayload: zkProof || null,
      tier: 'witness_circle',
      status: 'published',
      createdAt: serverTimestamp(),
      upvotes: 0,
      views: 0
    };

    const refDoc = await addDoc(collection(this.db, 'testimonies'), docData);

    if (zkProof?.proof && zkProof?.publicSignals) {
      try {
        const { getFunctions, httpsCallable } = await import(
          "https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js"
        );
        const verify = httpsCallable(getFunctions(undefined, 'us-central1'), 'verifyZKProof');
        verify({
          proof: zkProof.proof,
          publicSignals: zkProof.publicSignals,
          testimonyId: refDoc.id
        }).catch(err => console.warn('[Engine] ZK verify call failed:', err));
      } catch (e) {
        console.warn('[Engine] Could not invoke verifyZKProof:', e);
      }
    }

    this.clearPendingMedia();

    return {
      id: refDoc.id,
      audioHash,
      imageHash: this.pendingImageHash || null
    };
  }
}

// Export alias for legacy script compatibility
export { WitnessVoiceEngine as VocalWitnessEngine };

console.log('%cVocalWitness Engine loaded (production R2 Two-Lungs)', 'color:#10b981;font-weight:bold');
