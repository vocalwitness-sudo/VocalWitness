/**
 * js/media.js
 * Forensic Media Handler (Production R2 Version - Fully Isolated Multi-Media)
 * Aligned with isolation plan: separate paths for Image, Video, and Audio
 */

import { showToast, generateSha256Hash } from './utils.js';
import { auth } from './firebase-config.js';
import { uploadSecurePhoto, uploadSecureAudio, uploadSecureVideo } from './upload.js';
import { prepareMediaForUpload } from './media-pipeline.js';

// ====================== ISOLATED MEDIA STATE ======================
// These act as fallback / internal state.
// Prefer passing values from composer.js (activeImageFile, activeVideoFile, activeAudioFile)
export let selectedImageFile = null;
export let selectedVideoFile = null;
export let selectedAudioFile = null;

let engineInstance = null;
let waveAnimationId = null;
let replayUrl = null;

export function setEngine(engine) {
    engineInstance = engine;
    console.log("✅ Media Engine Connected");
    setTimeout(() => initVoiceControls(), 300);
}

// ====================== HELPERS ======================
function formatTime(ms) {
    const totalSec = Math.floor(ms / 1000);
    const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const s = String(totalSec % 60).padStart(2, '0');
    return `${m}:${s}`;
}

function showRecorderBar(show = true) {
    const bar = document.getElementById('voice-recorder-bar');
    if (bar) bar.classList.toggle('hidden', !show);
}

function updateTimer() {
    if (!engineInstance) return;
    const timerEl = document.getElementById('rec-timer');
    if (timerEl && typeof engineInstance.getElapsedMs === 'function') {
        timerEl.textContent = formatTime(engineInstance.getElapsedMs());
    }
}

function drawWaveform() {
    const canvas = document.getElementById('rec-waveform');
    if (!canvas || !engineInstance) return;

    const ctx = canvas.getContext('2d');
    const data = typeof engineInstance.getWaveformData === 'function'
        ? engineInstance.getWaveformData()
        : null;

    ctx.fillStyle = '#0a0f1c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!data) {
        waveAnimationId = requestAnimationFrame(drawWaveform);
        return;
    }

    const barWidth = 3;
    const gap = 2;
    const bars = Math.floor(canvas.width / (barWidth + gap));
    const step = Math.max(1, Math.floor(data.length / bars));

    ctx.fillStyle = '#10b981';
    for (let i = 0; i < bars; i++) {
        const value = data[i * step] || 0;
        const h = Math.max(2, (value / 255) * canvas.height * 0.85);
        const x = i * (barWidth + gap);
        const y = (canvas.height - h) / 2;
        ctx.fillRect(x, y, barWidth, h);
    }
    waveAnimationId = requestAnimationFrame(drawWaveform);
}

function startWaveAndTimer() {
    stopWaveAndTimer();
    updateTimer();
    waveAnimationId = requestAnimationFrame(function tick() {
        updateTimer();
        drawWaveform();
    });
}

function stopWaveAndTimer() {
    if (waveAnimationId) {
        cancelAnimationFrame(waveAnimationId);
        waveAnimationId = null;
    }
}

/**
 * Verifies that an uploaded media URL is publicly accessible at the edge
 */
export async function verifyMediaUrl(url, maxRetries = 6, delayMs = 1000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const cacheBustUrl = `${url}?t=${Date.now()}`;
            const response = await fetch(cacheBustUrl, {
                method: 'GET',
                headers: { 'Range': 'bytes=0-0' },
                cache: 'no-store'
            });

            if (response.ok || response.status === 206) {
                return true;
            }
        } catch (err) {
            console.warn(`[Edge Check Attempt ${attempt}] Media propagation pending...`);
        }

        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }

    throw new Error(`Media uploaded but return URL is unreachable: ${url}`);
}

// ====================== VALIDATION ======================
export function validateMediaFile(file, options = {}) {
    const {
        maxSizeBytes = 25 * 1024 * 1024, // default 25MB
        allowedTypes = null
    } = options;

    if (!file) {
        return { valid: false, error: 'No file selected.' };
    }

    if (file.size === 0) {
        return { valid: false, error: 'Selected file is empty or corrupted.' };
    }

    if (file.size > maxSizeBytes) {
        const maxSizeMB = Math.round(maxSizeBytes / (1024 * 1024));
        return { valid: false, error: `File size exceeds the ${maxSizeMB}MB limit.` };
    }

    if (allowedTypes && Array.isArray(allowedTypes)) {
        if (!allowedTypes.includes(file.type)) {
            return { valid: false, error: 'Unsupported file type.' };
        }
    } else {
        // Fallback: allow image, video, audio
        if (!file.type.startsWith('image/') &&
            !file.type.startsWith('video/') &&
            !file.type.startsWith('audio/')) {
            return { valid: false, error: 'Unsupported media type.' };
        }
    }

    return { valid: true };
}

// ====================== STATE RESET ======================
export function resetMediaState() {
    selectedImageFile = null;
    selectedVideoFile = null;
    selectedAudioFile = null;

    if (replayUrl) {
        URL.revokeObjectURL(replayUrl);
        replayUrl = null;
    }

    const audioEl = document.getElementById('rec-replay-audio');
    if (audioEl) {
        audioEl.pause();
        audioEl.removeAttribute('src');
        audioEl.load();
    }

    if (engineInstance) {
        if (typeof engineInstance.stopVoiceRecording === 'function' &&
            engineInstance.mediaRecorder?.state === 'recording') {
            engineInstance.stopVoiceRecording().catch(() => {});
        }
        engineInstance.currentAudioBlob = null;
    }

    stopWaveAndTimer();
    showRecorderBar(false);

    const previewArea = document.getElementById('preview-area');
    if (previewArea) {
        if (previewArea.dataset.objectUrl) {
            URL.revokeObjectURL(previewArea.dataset.objectUrl);
            delete previewArea.dataset.objectUrl;
        }
        previewArea.innerHTML = `
            <div id="preview-empty" class="py-2 text-center">
                <p>Preview will appear here...</p>
                <p class="mt-1 text-xs text-zinc-600">Photos, videos, or voice notes show after you add them</p>
            </div>`;
        previewArea.classList.remove('has-content');
    }

    const voiceBtn = document.getElementById('btn-voice');
    if (voiceBtn) {
        voiceBtn.classList.remove('recording-active', 'animate-pulse');
    }
}

// ====================== REMOVE MEDIA ======================
export function removeMedia(previewArea) {
    selectedImageFile = null;
    selectedVideoFile = null;
    selectedAudioFile = null;

    if (previewArea) {
        if (previewArea.dataset.objectUrl) {
            URL.revokeObjectURL(previewArea.dataset.objectUrl);
            delete previewArea.dataset.objectUrl;
        }
        previewArea.innerHTML = `
            <div id="preview-empty" class="py-2 text-center">
                <p>Preview will appear here...</p>
                <p class="mt-1 text-xs text-zinc-600">Photos, videos, or voice notes show after you add them</p>
            </div>`;
        previewArea.classList.remove('has-content');
    }

    showToast('Media removed', 'info');
}

// ====================== IMAGE SELECT (Protected Path) ======================
export async function handleImageSelect(event, previewArea) {
    const file = event.target?.files?.[0];
    if (!file) return;

    const check = validateMediaFile(file, {
        maxSizeBytes: 10 * 1024 * 1024,
        allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic']
    });

    if (!check.valid) {
        showToast(check.error, "error");
        if (event.target) event.target.value = '';
        return;
    }

    // Enforce exclusivity
    selectedImageFile = file;
    selectedVideoFile = null;
    selectedAudioFile = null;

    // Simple preview (composer.js will normally handle preview with renderGenericMediaPreview)
    if (previewArea) {
        const objectUrl = URL.createObjectURL(file);
        previewArea.dataset.objectUrl = objectUrl;

        previewArea.innerHTML = `
            <div class="relative mt-4 rounded-2xl overflow-hidden border border-emerald-500/40 bg-zinc-950 shadow-xl inline-block">
                <img src="${objectUrl}" class="h-32 w-32 object-cover" alt="Evidence Preview">
                <button type="button" id="removeMediaBtn"
                        class="absolute top-2 right-2 bg-red-600/90 hover:bg-red-700 text-white rounded-full p-1.5 shadow-lg transition flex items-center justify-center cursor-pointer"
                        title="Remove Media">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>`;
        previewArea.classList.add('has-content');

        const removeBtn = document.getElementById('removeMediaBtn');
        if (removeBtn) {
            removeBtn.onclick = (ev) => {
                ev.stopPropagation();
                removeMedia(previewArea);
            };
        }
    }

    if (event.target) event.target.value = '';
}

// ====================== VOICE RECORDING ======================
export async function toggleVoiceRecording(voiceBtn) {
    if (!engineInstance) {
        return showToast("Voice engine not ready yet", "error");
    }

    const isActive = engineInstance.mediaRecorder &&
        (engineInstance.mediaRecorder.state === "recording" ||
         engineInstance.mediaRecorder.state === "paused");

    if (!isActive) {
        try {
            // Clear other media when starting voice recording
            selectedImageFile = null;
            selectedVideoFile = null;

            await engineInstance.startVoiceRecording(300000);
            voiceBtn?.classList.add('recording-active', 'animate-pulse');
            showRecorderBar(true);

            const pauseBtn = document.getElementById('rec-pause-btn');
            const stopBtn = document.getElementById('rec-stop-btn');
            const replayBtn = document.getElementById('rec-replay-btn');
            const indicator = document.getElementById('rec-indicator');

            if (pauseBtn) {
                pauseBtn.textContent = '⏸ Pause';
                pauseBtn.classList.remove('hidden');
            }
            if (stopBtn) stopBtn.classList.remove('hidden');
            if (replayBtn) replayBtn.classList.add('hidden');
            if (indicator) {
                indicator.classList.add('animate-pulse', 'bg-red-500');
                indicator.classList.remove('bg-emerald-500');
            }

            startWaveAndTimer();
            showToast("🎤 Recording started... Speak clearly", "info");
        } catch (err) {
            console.error(err);
            showToast("Microphone access denied or unavailable", "error");
        }
    } else {
        const blob = await engineInstance.stopVoiceRecording();
        voiceBtn?.classList.remove('recording-active', 'animate-pulse');
        stopWaveAndTimer();

        const indicator = document.getElementById('rec-indicator');
        const pauseBtn = document.getElementById('rec-pause-btn');
        const stopBtn = document.getElementById('rec-stop-btn');
        const replayBtn = document.getElementById('rec-replay-btn');

        if (indicator) {
            indicator.classList.remove('animate-pulse', 'bg-red-500');
            indicator.classList.add('bg-emerald-500');
        }
        if (pauseBtn) pauseBtn.classList.add('hidden');
        if (stopBtn) stopBtn.classList.add('hidden');

        if (!blob || blob.size === 0) {
            showToast("Recording is empty. Please try again.", "error");
            showRecorderBar(false);
            return;
        }

        if (replayUrl) URL.revokeObjectURL(replayUrl);
        replayUrl = URL.createObjectURL(blob);

        const audioEl = document.getElementById('rec-replay-audio');
        if (audioEl) audioEl.src = replayUrl;

        if (replayBtn) replayBtn.classList.remove('hidden');
        showToast("✅ Recording saved. You can replay or publish.", "success");
    }
}

export function initVoiceControls() {
    const pauseBtn = document.getElementById('rec-pause-btn');
    const stopBtn = document.getElementById('rec-stop-btn');
    const replayBtn = document.getElementById('rec-replay-btn');

    if (pauseBtn) {
        pauseBtn.onclick = () => {
            if (!engineInstance) return;

            if (engineInstance.isPaused) {
                engineInstance.resumeVoiceRecording?.();
                pauseBtn.textContent = '⏸ Pause';
                document.getElementById('rec-indicator')?.classList.add('animate-pulse', 'bg-red-500');
                startWaveAndTimer();
            } else {
                engineInstance.pauseVoiceRecording?.();
                pauseBtn.textContent = '▶️ Resume';
                document.getElementById('rec-indicator')?.classList.remove('animate-pulse');
                stopWaveAndTimer();
                updateTimer();
            }
        };
    }

    if (stopBtn) {
        stopBtn.onclick = () => {
            const voiceBtn = document.getElementById('btn-voice');
            toggleVoiceRecording(voiceBtn);
        };
    }

    if (replayBtn) {
        replayBtn.onclick = () => {
            const audioEl = document.getElementById('rec-replay-audio');
            if (audioEl && audioEl.src) {
                audioEl.currentTime = 0;
                audioEl.play().catch(() => {});
            }
        };
    }
}

// ====================== PENDING MEDIA HELPERS ======================
/**
 * Returns true if the user has selected any media
 * (image, video or audio) that still needs to be handled.
 * Used by publishTestimony to decide whether a failed upload
 * should abort the whole publish (fail-closed).
 */
export function hasPendingMedia() {
  return !!(
    selectedImageFile ||
    selectedVideoFile ||
    selectedAudioFile ||
    engineInstance?.currentAudioBlob
  );
}

/**
 * Returns a simple snapshot of the currently selected media.
 * Useful for debugging or for the composer.
 */
export function getPendingMedia() {
  return {
    image: selectedImageFile,
    video: selectedVideoFile,
    audio: selectedAudioFile || engineInstance?.currentAudioBlob || null
  };
}

// ====================== UNIFIED UPLOAD ROUTER (Single Meeting Point) ======================
/**
 * Main forensic upload entry point.
 *
 * Prefer passing the active files from composer.js for clean isolation.
 * Falls back to the internal selected* variables if nothing is passed.
 *
 * Flow for each media type:
 *   1. Prepare / scrub (images)
 *   2. Compute SHA-256 hash of the final data (forensic fingerprint)
 *   3. Upload via the specialised secure function
 *   4. Verify the public URL is reachable
 *
 * Always throws on failure so publishTestimony can abort cleanly.
 */

// ====================== MEDIA BUTTONS WIRING ======================
/**
 * Wire all media buttons (Live Voice, Photo, Video, Upload Audio)
 * Call this once after the engine is ready.
 */
export function initMediaButtons() {
  const btnVoice        = document.getElementById('btn-voice');
  const btnPhoto        = document.getElementById('btn-photo');
  const btnVideo        = document.getElementById('btn-video');
  const btnUploadAudio  = document.getElementById('btn-upload-audio');

  const photoInput      = document.getElementById('photoInput');
  const videoInput      = document.getElementById('videoInput');
  const audioInput      = document.getElementById('audioInput');

  // --- 1. LIVE VOICE RECORDING (Primary) ---
  if (btnVoice) {
    // Remove old listeners to prevent double firing
    btnVoice.replaceWith(btnVoice.cloneNode(true));
    const freshVoiceBtn = document.getElementById('btn-voice');

    freshVoiceBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (freshVoiceBtn.disabled) return;
      freshVoiceBtn.disabled = true;

      try {
        await toggleVoiceRecording(freshVoiceBtn);
      } catch (err) {
        console.error('Voice recording error:', err);
        showToast('Could not start recording', 'error');
      } finally {
        setTimeout(() => {
          freshVoiceBtn.disabled = false;
        }, 800);
      }
    });
  }

  // --- 2. UPLOAD EXISTING AUDIO (Secondary) ---
  if (btnUploadAudio && audioInput) {
    btnUploadAudio.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      audioInput.click();
    });

    audioInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const check = validateMediaFile(file, {
        maxSizeBytes: 15 * 1024 * 1024, // 15MB for audio
        allowedTypes: ['audio/webm', 'audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/m4a']
      });

      if (!check.valid) {
        showToast(check.error, 'error');
        audioInput.value = '';
        return;
      }

      // Clear other media
      selectedImageFile = null;
      selectedVideoFile = null;
      selectedAudioFile = file;
      file._source = 'uploaded_audio';   // mark as uploaded (not live)

      // Show simple preview
      const previewArea = document.getElementById('preview-area');
      if (previewArea) {
        const objectUrl = URL.createObjectURL(file);
        previewArea.dataset.objectUrl = objectUrl;
        previewArea.innerHTML = `
          <div class="relative mt-2 rounded-2xl border border-amber-500/40 bg-zinc-900 p-4">
            <p class="text-sm text-amber-400 font-medium">Uploaded Audio</p>
            <p class="text-xs text-zinc-400 mt-1">${file.name} • ${(file.size / 1024 / 1024).toFixed(2)} MB</p>
            <audio controls class="mt-3 w-full" src="${objectUrl}"></audio>
            <button type="button" id="removeMediaBtn"
                    class="absolute top-2 right-2 bg-red-600/90 hover:bg-red-700 text-white rounded-full p-1.5">
              ✕
            </button>
          </div>`;
        previewArea.classList.add('has-content');

        document.getElementById('removeMediaBtn')?.addEventListener('click', () => {
          removeMedia(previewArea);
        });
      }

      showToast('Audio file ready', 'success');
      audioInput.value = '';
    });
  }

  // --- 3. PHOTO ---
  if (btnPhoto && photoInput) {
    btnPhoto.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      photoInput.click();
    });

    // Note: the actual change handler is usually in composer.js via handleImageSelect
  }

  // --- 4. VIDEO ---
  if (btnVideo && videoInput) {
    btnVideo.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      videoInput.click();
    });
  }
}

export async function uploadForensicMedia(
  activeImageFile = null,
  activeVideoFile = null,
  activeAudioBlob = null
) {
  const mediaData = {
    imageUrl: null,
    videoUrl: null,
    audioUrl: null,
    imageHash: null,
    videoHash: null,
    audioHash: null,
    bodyHash: null,          // will be filled by publishTestimony
    hasEvidencePack: false,
    evidencePack: null,
    packCoreHash: null
  };

  // Prefer values passed from composer, otherwise use internal state
  const targetImage = activeImageFile || selectedImageFile;
  const targetVideo = activeVideoFile || selectedVideoFile;
  const targetAudio = activeAudioBlob || selectedAudioFile || engineInstance?.currentAudioBlob;

  // Nothing selected → return empty object (text-only post is allowed)
  if (!targetImage && !targetVideo && !targetAudio) {
    return mediaData;
  }

  // ---------- 1. Image Path (Protected + Scrubbed) ----------
  if (targetImage) {
    try {
      if (targetImage.size === 0) throw new Error("Selected image is empty");

      // Scrub EXIF / GPS and optionally compress
      const cleanedFile = await prepareMediaForUpload(targetImage, {
        maxWidth: 1920,
        maxHeight: 1080
      });

      // Forensic hash of the cleaned file
      const hash = await generateSha256Hash(cleanedFile);

      // Upload
      const uploadedUrl = await uploadSecurePhoto(cleanedFile, 'evidence');
      await verifyMediaUrl(uploadedUrl);

      mediaData.imageUrl = uploadedUrl;
      mediaData.imageHash = hash;
      console.log("✅ Image scrubbed, hashed & verified:", mediaData.imageUrl);
    } catch (e) {
      console.error("Image upload failed:", e);
      showToast(e.message || "Image upload failed", "error");
      throw e; // critical – let publish abort
    }
  }

  // ---------- 2. Video Path (Isolated) ----------
  if (targetVideo) {
    try {
      if (targetVideo.size === 0) throw new Error("Selected video is empty");

      const hash = await generateSha256Hash(targetVideo);
      const uploadedUrl = await uploadSecureVideo(targetVideo, 'evidence');
      await verifyMediaUrl(uploadedUrl);

      mediaData.videoUrl = uploadedUrl;
      mediaData.videoHash = hash;
      console.log("✅ Video uploaded and verified:", mediaData.videoUrl);
    } catch (e) {
      console.error("Video upload failed:", e);
      showToast(e.message || "Video upload failed", "error");
      throw e;
    }
  }

  // ---------- 3. Audio Path (Isolated) ----------
  if (targetAudio) {
    try {
      if (targetAudio.size === 0) throw new Error("Selected audio is empty");

      const hash = await generateSha256Hash(targetAudio);
      const uploadedUrl = await uploadSecureAudio(targetAudio, 'evidence');
      await verifyMediaUrl(uploadedUrl);

      mediaData.audioUrl = uploadedUrl;
      mediaData.audioHash = hash;
      console.log("✅ Audio uploaded and verified:", mediaData.audioUrl);
    } catch (e) {
      console.error("Audio upload failed:", e);
      showToast(e.message || "Audio upload failed", "error");
      throw e;
    }
  }

  return mediaData;
}
