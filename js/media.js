// js/media.js - FINAL POLISHED VERSION
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
}

// ====================== PHOTO ======================
export async function handleImageSelect(event, previewArea) {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return showToast("Invalid image", "error");
    if (file.size > 10 * 1024 * 1024) return showToast("Image too large", "error");

    selectedImageFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        previewArea.innerHTML = `
            <div class="relative">
                <img src="${e.target.result}" class="image-preview rounded-2xl w-full" alt="Preview">
                <button id="removeImgBtn" class="absolute top-3 right-3 bg-red-600 text-white rounded-full w-8 h-8 flex items-center justify-center text-xl">✕</button>
            </div>`;
        document.getElementById('removeImgBtn').onclick = () => removeImage(previewArea);
    };
    reader.readAsDataURL(file);
}

export function removeImage(previewArea) {
    selectedImageFile = null;
    if (previewArea) previewArea.innerHTML = '';
}

// ====================== VOICE + SPECTRUM ======================
export function toggleVoiceRecording(voiceBtn) {
    if (!engineInstance) return showToast("Voice engine not ready", "error");

    if (!engineInstance.mediaRecorder || engineInstance.mediaRecorder.state === "inactive") {
        engineInstance.startVoiceRecording(300000);
        isPaused = false;
        secondsElapsed = 0;

        voiceBtn.classList.add('recording-active');
        voiceBtn.innerHTML = `
            ⏹️ <span id="rec-timer" class="font-mono">00:00</span>
            <span onclick="pauseRecording(this)" class="ml-3 cursor-pointer text-yellow-400">⏸️</span>
            <canvas id="spectrum" width="300" height="70" class="ml-4"></canvas>
        `;

        setTimeout(setupSpectrumAnalyzer, 400);

        recordingTimerInterval = setInterval(() => {
            if (!isPaused) secondsElapsed++;
            const min = String(Math.floor(secondsElapsed / 60)).padStart(2, '0');
            const sec = String(secondsElapsed % 60).padStart(2, '0');
            const timerEl = document.getElementById('rec-timer');
            if (timerEl) timerEl.textContent = `${min}:${sec}`;
        }, 1000);
    } else {
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

function setupSpectrumAnalyzer() {
    canvas = document.getElementById('spectrum');
    if (!canvas) return;
    canvasCtx = canvas.getContext('2d');

    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.8;

        if (engineInstance.mediaRecorder?.stream) {
            const source = audioContext.createMediaStreamSource(engineInstance.mediaRecorder.stream);
            source.connect(analyser);
            drawSpectrum();
        }
    } catch (e) {
        console.warn("Spectrum not available", e);
    }
}

function drawSpectrum() {
    if (!canvasCtx || !analyser) return;
    requestAnimationFrame(drawSpectrum);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    canvasCtx.fillStyle = '#111827';
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

    const barWidth = canvas.width / bufferLength * 1.5;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height * 0.85;
        const hue = 100 + (dataArray[i] / 3); // Green to cyan
        canvasCtx.fillStyle = `hsl(${hue}, 90%, 65%)`;
        canvasCtx.fillRect(x, canvas.height - barHeight, barWidth - 2, barHeight);
        x += barWidth;
    }
}

function stopSpectrumAnalyzer() {
    if (recordingTimerInterval) clearInterval(recordingTimerInterval);
    if (audioContext) audioContext.close();
}

window.pauseRecording = function(el) {
    isPaused = !isPaused;
    el.textContent = isPaused ? '▶️' : '⏸️';
};

// Rest of your file (uploadForensicMedia, resetMediaState, globals) ...
export async function uploadForensicMedia(userId = "anonymous") { /* your existing code */ }
export function resetMediaState() { /* your existing code */ }

window.handleImageSelect = handleImageSelect;
window.toggleVoiceRecording = toggleVoiceRecording;
window.resetMediaState = resetMediaState;
