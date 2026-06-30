// js/media.js - WITH WAVEFORM VISUALIZATION
import { showToast, generateSha256Hash } from './utils.js';
import { storage } from './firebase-config.js';
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js";
import { auth } from './firebase-config.js'; // Add this

export let selectedImageFile = null;
let engineInstance = null;
let currentMode = 'citizen-talk';
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

// ====================== VOICE WITH WAVEFORM ======================
export function toggleVoiceRecording(voiceBtn) {
    if (!engineInstance) {
        showToast("Voice engine not ready", "error");
        return;
    }

    if (!engineInstance.mediaRecorder || engineInstance.mediaRecorder.state === "inactive") {
        // START
        engineInstance.startVoiceRecording(300000);
        isPaused = false;
        secondsElapsed = 0;

        voiceBtn.classList.add('recording-active');
        voiceBtn.innerHTML = `
            ⏹️ <span id="rec-timer" class="font-mono">00:00</span> 
            <span onclick="pauseRecording(this)" class="ml-3 cursor-pointer text-yellow-400">⏸️</span>
            <canvas id="waveform" width="300" height="60" class="ml-4 bg-black/30 rounded"></canvas>
        `;

        // Setup Web Audio for visualization
        setupWaveform();

        recordingTimerInterval = setInterval(() => {
            if (!isPaused) secondsElapsed++;
            const min = String(Math.floor(secondsElapsed / 60)).padStart(2, '0');
            const sec = String(secondsElapsed % 60).padStart(2, '0');
            const timerEl = document.getElementById('rec-timer');
            if (timerEl) timerEl.textContent = `${min}:${sec}`;
        }, 1000);

        showToast("🎤 Recording started", "info");
    } else {
        // STOP
        engineInstance.stopVoiceRecording();
        if (recordingTimerInterval) clearInterval(recordingTimerInterval);
        if (audioContext) audioContext.close();

        voiceBtn.classList.remove('recording-active');
        voiceBtn.textContent = '🎙️ Voice Testimony';

        // Download for verified users
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

function setupWaveform() {
    canvas = document.getElementById('waveform');
    if (!canvas) return;
    canvasCtx = canvas.getContext('2d');

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 64;

    const source = audioContext.createMediaStreamSource(engineInstance.mediaRecorder.stream);
    source.connect(analyser);

    drawWaveform();
}

function drawWaveform() {
    if (!canvasCtx) return;
    requestAnimationFrame(drawWaveform);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);

    canvasCtx.fillStyle = 'rgb(0, 0, 0)';
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

    canvasCtx.lineWidth = 3;
    canvasCtx.strokeStyle = '#10b981';
    canvasCtx.beginPath();

    const sliceWidth = canvas.width * 1.0 / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * canvas.height / 2;

        if (i === 0) canvasCtx.moveTo(x, y);
        else canvasCtx.lineTo(x, y);

        x += sliceWidth;
    }

    canvasCtx.lineTo(canvas.width, canvas.height / 2);
    canvasCtx.stroke();
}

window.pauseRecording = function(el) {
    isPaused = !isPaused;
    el.textContent = isPaused ? '▶️' : '⏸️';
    showToast(isPaused ? "⏸️ Paused" : "▶️ Resumed", "info");
};

// Rest of the file (upload, reset, global exposures) remains the same...
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

window.handleImageSelect = handleImageSelect;
window.toggleVoiceRecording = toggleVoiceRecording;
window.resetMediaState = resetMediaState;
