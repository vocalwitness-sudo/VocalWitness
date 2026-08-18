// js/media.js - Forensic Media Handler (Production R2 Version)
import { showToast, generateSha256Hash } from './utils.js';
import { auth } from './firebase-config.js';
import { uploadSecurePhoto } from './upload.js';

export let selectedImageFile = null;
let engineInstance = null;
let waveAnimationId = null;
let replayUrl = null;

const R2_UPLOAD_ENDPOINT = 'https://media.vocalwitness.com/upload';

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

// ====================== QUICK-CHECK HELPER ======================
/**
 * Performs immediate client-side quick checks on media files before processing/upload.
 * @param {File} file - The file object to validate.
 * @param {Object} options - Validation constraints.
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateMediaFile(file, options = {}) {
    const {
        maxSizeBytes = 10 * 1024 * 1024, // Default 10MB
        allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']
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

    if (!file.type || !file.type.startsWith('image/') || (allowedTypes.length > 0 && !allowedTypes.includes(file.type))) {
        return { valid: false, error: 'Unsupported file type. Please upload a valid image (JPEG, PNG, WebP).' };
    }

    return { valid: true };
}
// ====================== STATE RESET ======================
export function resetMediaState() {
    // 1. Reset Image File Reference
    selectedImageFile = null;

    // 2. Clean Up Replay URL & Audio Elements
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

    // 3. Clear Voice Engine Memory
    if (engineInstance) {
        if (typeof engineInstance.stopVoiceRecording === 'function' && engineInstance.mediaRecorder?.state === 'recording') {
            engineInstance.stopVoiceRecording().catch(() => {});
        }
        engineInstance.currentAudioBlob = null;
    }

    // 4. Reset Animations & Timers
    stopWaveAndTimer();

    // 5. Reset UI Elements
    showRecorderBar(false);

    const previewArea = document.getElementById('preview-area');
    if (previewArea) {
        previewArea.innerHTML = '';
        previewArea.classList.remove('has-content');
    }

    const voiceBtn = document.getElementById('btn-voice');
    if (voiceBtn) {
        voiceBtn.classList.remove('recording-active', 'animate-pulse');
    }
}   // ← THIS closing brace was missing

// ====================== REMOVE IMAGE (CANCEL) ======================
export function removeImage(previewArea) {
    selectedImageFile = null;

    if (previewArea) {
        previewArea.innerHTML = '';
        previewArea.classList.remove('has-content');
    }

    showToast('Image removed', 'info');
}

// ====================== PHOTO ======================
export async function handleImageSelect(event, previewArea) {
    const file = event.target?.files?.[0];
    if (!file) return;

    // Client-side validation
    const check = validateMediaFile(file, {
        maxSizeBytes: 10 * 1024 * 1024,
        allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic']
    });

    if (!check.valid) {
        showToast(check.error, "error");
        if (event.target) event.target.value = '';
        return;
    }

    // Clear previous image first (enforces single image)
    selectedImageFile = null;
    if (previewArea) {
        previewArea.innerHTML = '';
        previewArea.classList.remove('has-content');
    }

    selectedImageFile = file;

    const reader = new FileReader();
    reader.onload = (e) => {
        if (!previewArea) return;

        previewArea.innerHTML = `
            <div class="relative mt-4 rounded-2xl overflow-hidden border border-emerald-500/40 bg-zinc-950 shadow-xl inline-block">
                <img src="${e.target.result}" class="h-32 w-32 object-cover" alt="Evidence Preview">
                <button type="button" id="removeImgBtn"
                        class="absolute top-2 right-2 bg-red-600/90 hover:bg-red-700 text-white rounded-full p-1.5 shadow-lg transition flex items-center justify-center cursor-pointer"
                        title="Remove Image">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>`;
        previewArea.classList.add('has-content');

        const removeBtn = document.getElementById('removeImgBtn');
        if (removeBtn) {
            removeBtn.onclick = (ev) => {
                ev.stopPropagation();
                removeImage(previewArea);
            };
        }
    };

    reader.onerror = () => {
        showToast("Failed to read selected image", "error");
        selectedImageFile = null;
    };

    reader.readAsDataURL(file);

    // Allow selecting the same file again later
    if (event.target) event.target.value = '';
}

// ====================== VOICE ======================
export async function toggleVoiceRecording(voiceBtn) {
    if (!engineInstance) {
        return showToast("Voice engine not ready yet", "error");
    }

    const isActive = engineInstance.mediaRecorder &&
        (engineInstance.mediaRecorder.state === "recording" ||
         engineInstance.mediaRecorder.state === "paused");

    if (!isActive) {
        try {
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

// ====================== UPLOAD ======================
export async function uploadForensicMedia() {
    const mediaData = {
        imageUrl: null,
        audioUrl: null,
        imageHash: null,
        audioHash: null
    };

    const userId = auth.currentUser?.uid || "anonymous";

    // 1. Photo Upload (Scrubbed EXIF via R2)
    if (selectedImageFile) {
        try {
            if (selectedImageFile.size === 0) {
                throw new Error("Selected image is empty");
            }

            const hash = await generateSha256Hash(selectedImageFile);
            const uploadedUrl = await uploadSecurePhoto(selectedImageFile, `evidence/${userId}`);

            mediaData.imageUrl = uploadedUrl;
            mediaData.imageHash = hash;
            console.log("✅ Image uploaded to R2:", mediaData.imageUrl);
        } catch (e) {
            console.error("Image upload failed", e);
            showToast("Image upload failed", "error");
        }
    }

    // 2. Audio Upload (Direct to R2)
    if (engineInstance?.currentAudioBlob) {
        try {
            const blob = engineInstance.currentAudioBlob;

            if (!blob || blob.size === 0) {
                console.warn("Audio blob is empty – skipping upload");
                showToast("Recording is empty. Please record again.", "error");
            } else {
                const hash = await generateSha256Hash(blob);
                const fileId = crypto.randomUUID();
                const keyPath = `evidence/${userId}/${fileId}_voice.webm`;

                const uploadedUrl = await new Promise((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    xhr.open('PUT', `${R2_UPLOAD_ENDPOINT}?key=${encodeURIComponent(keyPath)}`, true);
                    xhr.setRequestHeader('Content-Type', blob.type || 'audio/webm');

                    if (auth.currentUser) {
                        auth.currentUser.getIdToken().then(token => {
                            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
                            xhr.send(blob);
                        }).catch(reject);
                    } else {
                        xhr.send(blob);
                    }

                    xhr.onload = () => {
                        if (xhr.status >= 200 && xhr.status < 300) {
                            try {
                                const res = JSON.parse(xhr.responseText);
                                resolve(res.url || `https://media.vocalwitness.com/${keyPath}`);
                            } catch (_) {
                                resolve(`https://media.vocalwitness.com/${keyPath}`);
                            }
                        } else {
                            reject(new Error(`Audio upload failed: ${xhr.status}`));
                        }
                    };

                    xhr.onerror = () => reject(new Error('Network error during audio upload.'));
                });

                mediaData.audioUrl = uploadedUrl;
                mediaData.audioHash = hash;
                console.log("✅ Audio uploaded to R2:", mediaData.audioUrl);
            }
        } catch (e) {
            console.error("Audio upload failed", e);
            showToast("Audio upload failed", "error");
        }
    }

    return mediaData;
}
