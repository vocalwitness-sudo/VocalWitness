/**
 * js/media.js
 * Forensic Media Handler (Production R2 Version - Fully Isolated Multi-Media)
 * Phone-hardened: Live Voice owned here only; file pickers owned by composer.js
 */

import { showToast, generateSha256Hash } from './utils.js';
import { auth } from './firebase-config.js';
import { uploadSecurePhoto, uploadSecureAudio, uploadSecureVideo } from './upload.js';
import { prepareMediaForUpload } from './media-pipeline.js';

// ====================== ISOLATED MEDIA STATE ======================
export let selectedImageFile = null;
export let selectedVideoFile = null;
export let selectedAudioFile = null;

let engineInstance = null;
let waveAnimationId = null;
let replayUrl = null;
let isUploading = false;

export function setEngine(engine) {
  engineInstance = engine;
  console.log('✅ Media Engine Connected');

  setTimeout(() => {
    initVoiceControls();

    const btn = document.getElementById('btn-voice');
    if (btn) {
      btn.removeAttribute('aria-busy');
      btn.title = 'Record live voice';
    }

    // Safe to call again — guarded inside initMediaButtons
    initMediaButtons();
  }, 300);
}

// ====================== SINGLE SOURCE OF TRUTH ======================
export function getActiveMedia() {
  return {
    image: selectedImageFile || null,
    video: selectedVideoFile || null,
    audio: getAudioForPublish()?.blob || null,
    audioSource: getAudioForPublish()?.source || null,
    isLiveAudio: getAudioForPublish()?.isLive || false
  };
}

export function hasAnyMedia() {
  const m = getActiveMedia();
  return !!(m.image || m.video || m.audio);
}

export function clearAllMedia() {
  selectedImageFile = null;
  selectedVideoFile = null;
  selectedAudioFile = null;

  if (engineInstance) {
    engineInstance.currentAudioBlob = null;
  }

  if (replayUrl) {
    URL.revokeObjectURL(replayUrl);
    replayUrl = null;
  }

  resetMediaState();
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
  const data =
    typeof engineInstance.getWaveformData === 'function'
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

function showMicPermissionMsg(html = null) {
  const box = document.getElementById('mic-permission-msg');
  if (!box) return;
  if (html) {
    box.innerHTML = html;
    box.classList.remove('hidden');
  } else {
    box.innerHTML = '';
    box.classList.add('hidden');
  }
}

const MIC_BLOCKED_HTML = `
  <p class="font-semibold mb-2">🎤 Microphone blocked</p>
  <ol class="list-decimal list-inside space-y-1 text-xs text-zinc-300">
    <li><strong>Phone:</strong> browser menu (⋮ or Aa) → Site settings / Permissions</li>
    <li>Set <strong>Microphone</strong> to <strong>Allow</strong></li>
    <li>Reload this page and tap <strong>Live Voice</strong> again</li>
  </ol>
  <p class="mt-2 text-xs text-zinc-500">Or use upload audio file instead of live recording.</p>
`;

/**
 * Verifies that an uploaded media URL is publicly accessible at the edge
 */
export async function verifyMediaUrl(url, maxRetries = 6, delayMs = 1000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const cacheBustUrl = `${url}?t=${Date.now()}`;
      const response = await fetch(cacheBustUrl, {
        method: 'GET',
        headers: { Range: 'bytes=0-0' },
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
    maxSizeBytes = 25 * 1024 * 1024,
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

  // ===== MOBILE HARDENING =====
  let type = (file.type || '').toLowerCase();

  if (!type || type === 'application/octet-stream') {
    const ext = (file.name || '').split('.').pop().toLowerCase();
    if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif'].includes(ext)) {
      type = 'image/' + (ext === 'jpg' ? 'jpeg' : ext);
    } else if (['mp3', 'mpeg', 'wav', 'ogg', 'm4a', 'webm'].includes(ext)) {
      type = 'audio/' + ext;
    } else if (['mp4', 'webm', 'mov', 'mkv'].includes(ext)) {
      type = 'video/' + ext;
    }
  }

  if (allowedTypes && Array.isArray(allowedTypes)) {
    const isAllowed =
      allowedTypes.some((t) => type === t || type.startsWith(t.split('/')[0] + '/')) ||
      (!file.type &&
        allowedTypes.some(
          (t) => t.startsWith('image/') && /\.(jpe?g|png|webp|gif|heic)$/i.test(file.name || '')
        ));

    if (!isAllowed) {
      return { valid: false, error: 'Unsupported file type.' };
    }
  } else {
    if (
      !type.startsWith('image/') &&
      !type.startsWith('video/') &&
      !type.startsWith('audio/')
    ) {
      return { valid: false, error: 'Unsupported media type.' };
    }
  }

  return { valid: true };
}

export function setImageFile(file) {
  clearAllMedia();
  selectedImageFile = file;
}

export function setVideoFile(file) {
  clearAllMedia();
  selectedVideoFile = file;
}

export function setAudioFile(file, source = 'uploaded_audio') {
  clearAllMedia();
  selectedAudioFile = file;
  if (file) file._source = source;
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
    if (
      typeof engineInstance.stopVoiceRecording === 'function' &&
      engineInstance.mediaRecorder?.state === 'recording'
    ) {
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
  clearAllMedia();
  showToast('Media removed', 'info');
}

// ====================== IMAGE SELECT (legacy / fallback path) ======================
export async function handleImageSelect(event, previewArea) {
  const file = event.target?.files?.[0];
  if (!file) return;

  const check = validateMediaFile(file, {
    maxSizeBytes: 10 * 1024 * 1024,
    allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic']
  });

  if (!check.valid) {
    showToast(check.error, 'error');
    if (event.target) event.target.value = '';
    return;
  }

  selectedImageFile = file;
  selectedVideoFile = null;
  selectedAudioFile = null;

  if (previewArea) {
    const objectUrl = URL.createObjectURL(file);
    previewArea.dataset.objectUrl = objectUrl;

    previewArea.innerHTML = `
      <div class="relative mt-4 rounded-2xl overflow-hidden border border-emerald-500/40 bg-zinc-950 shadow-xl inline-block">
        <img src="${objectUrl}" class="h-32 w-32 object-cover" alt="Evidence Preview">
        <button type="button" id="removeMediaBtn"
                class="absolute top-2 right-2 bg-red-600/90 hover:bg-red-700 text-white rounded-full p-1.5 shadow-lg transition flex items-center justify-center cursor-pointer"
                title="Remove Media" aria-label="Remove media">
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

/**
 * Query mic permission state when the browser supports it.
 * Returns: 'granted' | 'denied' | 'prompt'
 */
async function ensureMicPermission() {
  try {
    if (!navigator.permissions?.query) return 'prompt';
    const status = await navigator.permissions.query({ name: 'microphone' });
    return status.state;
  } catch {
    return 'prompt';
  }
}

// ====================== VOICE RECORDING ======================
export async function toggleVoiceRecording(voiceBtn) {
  if (!engineInstance) {
    showToast('Voice still loading. Wait a second and try Live Voice again.', 'info');
    return;
  }

  const isActive =
    engineInstance.mediaRecorder &&
    (engineInstance.mediaRecorder.state === 'recording' ||
      engineInstance.mediaRecorder.state === 'paused');

  if (!isActive) {
    const micState = await ensureMicPermission();
    if (micState === 'denied') {
      showToast(
        'Microphone is blocked. Allow mic in site settings, reload, or upload an audio file.',
        'error'
      );
      showMicPermissionMsg(MIC_BLOCKED_HTML);
      return;
    }

    try {
      selectedImageFile = null;
      selectedVideoFile = null;
      selectedAudioFile = null;

      showMicPermissionMsg(null);

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
      showToast('🎤 Recording started... Speak clearly', 'info');
    } catch (err) {
      console.error('[media] startVoiceRecording failed:', err);

      const name = err?.name || '';
      const msg = String(err?.message || '');

      const denied =
        name === 'NotAllowedError' ||
        name === 'PermissionDeniedError' ||
        /Permission denied/i.test(msg);

      const notFound =
        name === 'NotFoundError' || /Requested device not found/i.test(msg);

      const inUse =
        name === 'NotReadableError' || /Could not start audio source/i.test(msg);

      if (denied) {
        showToast(
          'Microphone is blocked. Allow mic in site settings, reload, or upload audio.',
          'error'
        );
        showMicPermissionMsg(MIC_BLOCKED_HTML);
      } else if (notFound) {
        showToast('No microphone found. Use upload audio file instead.', 'error');
      } else if (inUse) {
        showToast('Microphone is in use by another app. Close it, then try again.', 'error');
      } else {
        showToast(msg || 'Microphone access denied or unavailable', 'error');
      }
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
      showToast('Recording is empty. Please try again.', 'error');
      showRecorderBar(false);
      return;
    }

    if (replayUrl) URL.revokeObjectURL(replayUrl);
    replayUrl = URL.createObjectURL(blob);
    const audioEl = document.getElementById('rec-replay-audio');
    if (audioEl) audioEl.src = replayUrl;
    if (replayBtn) replayBtn.classList.remove('hidden');

    showMicPermissionMsg(null);
    showToast('✅ Recording saved. You can replay or publish.', 'success');
    window.dispatchEvent(new CustomEvent('media-changed'));
  }
}

export function initVoiceControls() {
  const pauseBtn = document.getElementById('rec-pause-btn');
  const stopBtn = document.getElementById('rec-stop-btn');
  const replayBtn = document.getElementById('rec-replay-btn');
  const rerecordBtn = document.getElementById('rec-rerecord-btn');

  if (pauseBtn && !pauseBtn.dataset.mediaWired) {
    pauseBtn.dataset.mediaWired = 'true';
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

  if (stopBtn && !stopBtn.dataset.mediaWired) {
    stopBtn.dataset.mediaWired = 'true';
    stopBtn.onclick = () => {
      const voiceBtn = document.getElementById('btn-voice');
      toggleVoiceRecording(voiceBtn);
    };
  }

  if (replayBtn && !replayBtn.dataset.mediaWired) {
    replayBtn.dataset.mediaWired = 'true';
    replayBtn.onclick = () => {
      const audioEl = document.getElementById('rec-replay-audio');
      if (audioEl && audioEl.src) {
        audioEl.currentTime = 0;
        audioEl.play().catch(() => {});
      }
    };
  }

  if (rerecordBtn && !rerecordBtn.dataset.mediaWired) {
    rerecordBtn.dataset.mediaWired = 'true';
    rerecordBtn.onclick = () => {
      resetMediaState();
      showToast('Ready to re-record', 'info');
      const voiceBtn = document.getElementById('btn-voice');
      if (voiceBtn && engineInstance) {
        toggleVoiceRecording(voiceBtn);
      }
    };
  }
}

// ====================== AUDIO HELPERS ======================
export function getAudioForPublish() {
  if (engineInstance?.currentAudioBlob && engineInstance.currentAudioBlob.size > 0) {
    return {
      blob: engineInstance.currentAudioBlob,
      source: 'live_recording',
      isLive: true
    };
  }

  if (selectedAudioFile && selectedAudioFile.size > 0) {
    return {
      blob: selectedAudioFile,
      source: selectedAudioFile._source || 'uploaded_audio',
      isLive: false
    };
  }

  return null;
}

export function hasPendingMedia() {
  const audioInfo = getAudioForPublish();
  const hasImage = !!(selectedImageFile && selectedImageFile.size > 0);
  const hasVideo = !!(selectedVideoFile && selectedVideoFile.size > 0);
  return !!(hasImage || hasVideo || audioInfo !== null);
}

export function getPendingMedia() {
  const audioInfo = getAudioForPublish();
  return {
    image: selectedImageFile || null,
    video: selectedVideoFile || null,
    audio: audioInfo ? audioInfo.blob : null,
    audioSource: audioInfo ? audioInfo.source : null,
    isLiveAudio: audioInfo ? audioInfo.isLive : false
  };
}

// ====================== MEDIA BUTTONS WIRING ======================
/**
 * Wire Live Voice only. Call after setEngine().
 * Photo / Video / Audio file: composer.js + <label for="...">
 */
export function initMediaButtons() {
  const btnVoice = document.getElementById('btn-voice');
  if (!btnVoice) return;

  if (btnVoice.dataset.voiceWired === 'true') {
    console.log('[media] btn-voice already wired');
    return;
  }
  btnVoice.dataset.voiceWired = 'true';

  if (!engineInstance) {
    btnVoice.setAttribute('aria-busy', 'true');
    btnVoice.title = 'Preparing microphone…';
  }

  btnVoice.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (btnVoice.disabled) return;

    if (!engineInstance) {
      showToast('Voice engine still loading. Wait a second and try again.', 'info');
      return;
    }

    btnVoice.disabled = true;
    try {
      await toggleVoiceRecording(btnVoice);
    } catch (err) {
      console.error('Voice recording error:', err);
      showToast(err?.message || 'Could not start recording', 'error');
    } finally {
      setTimeout(() => {
        btnVoice.disabled = false;
      }, 600);
    }
  });

  console.log('[media] Live Voice button wired (no clone, single listener)');
}

// ====================== FORENSIC UPLOAD ======================
export async function uploadForensicMedia(
  activeImageFile = null,
  activeVideoFile = null,
  activeAudioBlob = null
) {
  if (isUploading) {
    console.warn('[media] Upload already in progress – ignored');
    return null;
  }

  isUploading = true;

  try {
    const mediaData = {
      imageUrl: null,
      videoUrl: null,
      audioUrl: null,
      imageHash: null,
      videoHash: null,
      audioHash: null,
      bodyHash: null,
      hasEvidencePack: false,
      evidencePack: null,
      packCoreHash: null
    };

    const targetImage = activeImageFile || selectedImageFile;
    const targetVideo = activeVideoFile || selectedVideoFile;
    const targetAudio =
      activeAudioBlob || selectedAudioFile || engineInstance?.currentAudioBlob;

    if (!targetImage && !targetVideo && !targetAudio) {
      return mediaData;
    }

    if (targetImage) {
      try {
        if (targetImage.size === 0) throw new Error('Selected image is empty');

        const prepared = await prepareMediaForUpload(targetImage, {
          maxWidth: 1920,
          maxHeight: 1080
        });

        const cleanedFile =
          prepared && prepared.file instanceof Blob ? prepared.file : prepared;

        if (!(cleanedFile instanceof Blob)) {
          throw new Error('Image preparation returned an invalid file');
        }

        const hash = prepared?.hash || (await generateSha256Hash(cleanedFile));

        try {
          Object.defineProperty(cleanedFile, 'isCleaned', {
            value: true,
            writable: false,
            configurable: true
          });
        } catch (_) {}

        const uploadedUrl = await uploadSecurePhoto(cleanedFile, 'evidence');
        await verifyMediaUrl(uploadedUrl);

        mediaData.imageUrl = uploadedUrl;
        mediaData.imageHash = hash;
        console.log('✅ Image scrubbed, hashed & verified:', mediaData.imageUrl);
      } catch (e) {
        console.error('Image upload failed:', e);
        showToast(e.message || 'Image upload failed', 'error');
        throw e;
      }
    }

    if (targetVideo) {
      try {
        if (targetVideo.size === 0) throw new Error('Selected video is empty');

        const hash = await generateSha256Hash(targetVideo);
        const uploadedUrl = await uploadSecureVideo(targetVideo, 'evidence');
        await verifyMediaUrl(uploadedUrl);

        mediaData.videoUrl = uploadedUrl;
        mediaData.videoHash = hash;
        console.log('✅ Video uploaded and verified:', mediaData.videoUrl);
      } catch (e) {
        console.error('Video upload failed:', e);
        showToast(e.message || 'Video upload failed', 'error');
        throw e;
      }
    }

    if (targetAudio) {
      try {
        if (targetAudio.size === 0) throw new Error('Selected audio is empty');

        const hash = await generateSha256Hash(targetAudio);
        const uploadedUrl = await uploadSecureAudio(targetAudio, 'evidence');
        await verifyMediaUrl(uploadedUrl);

        mediaData.audioUrl = uploadedUrl;
        mediaData.audioHash = hash;
        console.log('✅ Audio uploaded and verified:', mediaData.audioUrl);
      } catch (e) {
        console.error('Audio upload failed:', e);
        showToast(e.message || 'Audio upload failed', 'error');
        throw e;
      }
    }

    return mediaData;
  } finally {
    isUploading = false;
  }
}
