// js/media.js - WITH FREQUENCY SPECTRUM ANALYZER
import { showToast, generateSha256Hash } from './utils.js';
import { storage } from './firebase-config.js';
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js";

export let selectedImageFile = null;
let engineInstance = null;
let recordingTimerInterval = null;
let isPaused = false;
let secondsElapsed = 0;
let audioContext = null;
let analyser = null;
let canvas = null;
let canvasCtx = null;

export function setEngine(engine) {
    engineInstance = engine;
    console.log("✅ Engine connected to media.js");
}

// ====================== PHOTO ======================
export async function handleImageSelect(event, previewArea) {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        showToast("Please select a valid image", "error");
        return;
    }
    if (file.size > 10 * 1024 * 1024) {
        showToast("Image too large (max 10MB)", "error");
        return;
    }
    selectedImageFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        previewArea.innerHTML = `
            <div class="relative">
                <img src="${e.target.result}" class="image-preview rounded-2xl w-full" alt="Preview">
                <button id="removeImgBtn" class="absolute top-3 right-3 bg-red-600 text-white rounded-full w-8 h-8 flex items-center justify-center">✕</button>
            </div>`;
        document.getElementById('removeImgBtn').onclick = () => removeImage(previewArea);
    };
    reader.readAsDataURL(file);
}

export function removeImage(previewArea) {
    selectedImageFile = null;
    if (previewArea) previewArea.innerHTML = '';
}

// ====================== VOICE RECORDING + FREQUENCY SPECTRUM ======================
export function toggleVoiceRecording(voiceBtn) {
    if (!engineInstance) {
        showToast("Voice engine not ready", "error");
        return;
    }

    if (!engineInstance.mediaRecorder || engineInstance.mediaRecorder.state === "inactive") {
        // START RECORDING
        engineInstance.startVoiceRecording(300000);
        isPaused = false;
        secondsElapsed = 0;

        voiceBtn.classList.add('recording-active');
        voiceBtn.innerHTML = `
            ⏹️ <span id="rec-timer" class="font-mono">00:00</span>
            <span onclick="pauseRecording(this)" class="ml-3 cursor-pointer text-yellow-400">⏸️</span>
            <canvas id="spectrum" width="320" height="80" class="ml-4 bg-black/40 rounded"></canvas>
        `;

        setupSpectrumAnalyzer();
        recordingTimerInterval = setInterval(updateTimer, 1000);

        showToast("🎤 Recording started - Spectrum Active", "info");
    } else {
        // STOP RECORDING
        engineInstance.stopVoiceRecording();
        stopSpectrumAnalyzer();

        voiceBtn.classList.remove('recording-active');
        voiceBtn.textContent = '🎙️ Voice Testimony';

        if (engineInstance.currentAudioBlob) {
            const url = URL.createObjectURL(engineInstance.currentAudioBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `vocalwitness-${Date.now()}.webm`;
            a.click();
            URL.revokeObjectURL(url);
        }
        showToast("✅ Recording saved", "success");
    }
}

function updateTimer() {
    if (!isPaused) secondsElapsed++;
    const min = String(Math.floor(secondsElapsed / 60)).padStart(2, '0');
    const sec = String(secondsElapsed % 60).padStart(2, '0');
    const timerEl = document.getElementById('rec-timer');
    if (timerEl) timerEl.textContent = `${min}:${sec}`;
}

function setupSpectrumAnalyzer() {
    canvas = document.getElementById('spectrum');
    if (!canvas) return;
    canvasCtx = canvas.getContext('2d');

    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 128;           // Higher = more detail
        analyser.smoothingTimeConstant = 0.85;

        if (engineInstance.mediaRecorder && engineInstance.mediaRecorder.stream) {
            const source = audioContext.createMediaStreamSource(engineInstance.mediaRecorder.stream);
            source.connect(analyser);
            drawSpectrum();
        }
    } catch (e) {
        console.warn("Spectrum analyzer not available", e);
    }
}

function drawSpectrum() {
    if (!canvasCtx || !analyser) return;

    requestAnimationFrame(drawSpectrum);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    // Clear canvas
    canvasCtx.fillStyle = 'rgb(17, 24, 39)';
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

    const barWidth = (canvas.width / bufferLength) * 1.5;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height * 0.9;

        // Dynamic color based on frequency intensity
        const hue = 120 - (dataArray[i] / 2); // Green to yellow/red
        canvasCtx.fillStyle = `hsl(${hue}, 90%, 60%)`;

        canvasCtx.fillRect(x, canvas.height - barHeight, barWidth - 2, barHeight);
        x += barWidth + 1;
    }
}

function stopSpectrumAnalyzer() {
    if (recordingTimerInterval) {
        clearInterval(recordingTimerInterval);
        recordingTimerInterval = null;
    }
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
}

window.pauseRecording = function(el) {
    isPaused = !isPaused;
    el.textContent = isPaused ? '▶️' : '⏸️';
    showToast(isPaused ? "⏸️ Recording Paused" : "▶️ Recording Resumed", "info");
};

// ====================== UPLOAD & RESET ======================
export async function uploadForensicMedia(userId = "anonymous") {
    const mediaData = {};
    if (selectedImageFile) {
        try {
            const hash = await generateSha256Hash(selectedImageFile);
            const imageRef = ref(storage, `images/${userId}/${Date.now()}.jpg`);
            await uploadBytes(imageRef, selectedImageFile);
            mediaData.imageUrl = await getDownloadURL(imageRef);
            mediaData.imageHash = hash;
        } catch (e) { console.error(e); }
    }
    if (engineInstance?.currentAudioBlob) {
        try {
            const hash = await generateSha256Hash(engineInstance.currentAudioBlob);
            const audioRef = ref(storage, `testimonies/${userId}/${Date.now()}.webm`);
            await uploadBytes(audioRef, engineInstance.currentAudioBlob);
            mediaData.audioUrl = await getDownloadURL(audioRef);
            mediaData.audioHash = hash;
        } catch (e) { console.error(e); }
    }
    return mediaData;
}

export function resetMediaState() {
    selectedImageFile = null;
    const preview = document.getElementById('preview-area');
    if (preview) preview.innerHTML = '';
}

// Global exposures
window.handleImageSelect = handleImageSelect;
window.toggleVoiceRecording = toggleVoiceRecording;
window.resetMediaState = resetMediaState;
