// js/media.js - Forensic Media Handler (Production)
import { showToast, generateSha256Hash } from './utils.js';
import { storage, auth } from './firebase-config.js';
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js";

export let selectedImageFile = null;
let engineInstance = null;
let waveAnimationId = null;
let replayUrl = null;

export function setEngine(engine) {
    engineInstance = engine;
    console.log("✅ Media Engine Connected");
    setTimeout(() => initVoiceControls(), 300);
}

// ====================== HELPERS ======================
function sanitizeUrl(rawUrl) {
    if (!rawUrl) return null;
    return rawUrl.replace(/(&alt=media)+$/g, '&alt=media');
}

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

// ====================== PHOTO ======================
export async function handleImageSelect(event, previewArea) {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return showToast("Please select an image", "error");
    if (file.size > 10 * 1024 * 1024) return showToast("Image too large (max 10MB)", "error");
    if (file.size === 0) return showToast("Selected image is empty", "error");

    selectedImageFile = file;

    const reader = new FileReader();
    reader.onload = (e) => {
        previewArea.innerHTML = `
            <div class="relative mt-4 rounded-2xl overflow-hidden border border-zinc-700">
                <img src="${e.target.result}" class="w-full max-h-80 object-cover" alt="Preview">
                <button id="removeImgBtn"
                        class="absolute top-3 right-3 bg-red-600 hover:bg-red-700 text-white rounded-full w-8 h-8 flex items-center justify-center text-xl shadow-lg transition">
                    ✕
                </button>
            </div>`;
        document.getElementById('removeImgBtn').onclick = () => removeImage(previewArea);
    };
    reader.readAsDataURL(file);
}

export function removeImage(previewArea) {
    selectedImageFile = null;
    if (previewArea) {
        previewArea.innerHTML = 'Preview will appear here...';
        previewArea.classList.remove('has-content');
    }
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
        // START
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
        // STOP
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

    // Image
    if (selectedImageFile) {
        try {
            if (selectedImageFile.size === 0) {
                throw new Error("Selected image is empty");
            }

            const hash = await generateSha256Hash(selectedImageFile);
            const timestamp = Date.now();
            const safeName = selectedImageFile.name.replace(/\s+/g, '_');
            const path = `evidence/${userId}/${timestamp}_${safeName}`;

            const imageRef = ref(storage, path);
            await uploadBytes(imageRef, selectedImageFile, {
                contentType: selectedImageFile.type || 'image/jpeg',
                customMetadata: {
                    uploadedBy: userId,
                    originalName: selectedImageFile.name
                }
            });

            mediaData.imageUrl = sanitizeUrl(await getDownloadURL(imageRef));
            mediaData.imageHash = hash;
            console.log("✅ Image uploaded:", mediaData.imageUrl, `(${selectedImageFile.size} bytes)`);
        } catch (e) {
            console.error("Image upload failed", e);
            showToast("Image upload failed", "error");
        }
    }

    // Audio
    if (engineInstance?.currentAudioBlob) {
        try {
            const blob = engineInstance.currentAudioBlob;

            if (!blob || blob.size === 0) {
                console.warn("Audio blob is empty – skipping upload");
                showToast("Recording is empty. Please record again.", "error");
            } else {
                const hash = await generateSha256Hash(blob);
                const timestamp = Date.now();
                const path = `evidence/${userId}/${timestamp}_voice.webm`;

                const audioRef = ref(storage, path);
                await uploadBytes(audioRef, blob, {
                    contentType: blob.type || 'audio/webm',
                    customMetadata: {
                        uploadedBy: userId,
                        durationHint: 'voice'
                    }
                });

                mediaData.audioUrl = sanitizeUrl(await getDownloadURL(audioRef));
                mediaData.audioHash = hash;
                console.log("✅ Audio uploaded:", mediaData.audioUrl, `(${blob.size} bytes)`);
            }
        } catch (e) {
            console.error("Audio upload failed", e);
            showToast("Voice upload failed", "error");
        }
    }

    return mediaData;
}

export function resetMediaState() {
    selectedImageFile = null;
    if (engineInstance) {
        engineInstance.currentAudioBlob = null;
        engineInstance.audioChunks = [];
    }
    if (replayUrl) {
        URL.revokeObjectURL(replayUrl);
        replayUrl = null;
    }
    stopWaveAndTimer();
    showRecorderBar(false);

    const preview = document.getElementById('preview-area');
    if (preview) {
        preview.innerHTML = 'Preview will appear here...';
        preview.classList.remove('has-content');
    }
}

// Global exposure
window.handleImageSelect = handleImageSelect;
window.toggleVoiceRecording = toggleVoiceRecording;
window.resetMediaState = resetMediaState;
