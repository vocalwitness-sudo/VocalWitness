// js/media.js - SECURE VERSION WITH WITNESS MODE
import { showToast, generateSha256Hash } from './utils.js';
import { storage } from './firebase-config.js';
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js";
import { db, auth } from './firebase-config.js';   // Correct relative path

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
    console.log("✅ Media Engine Connected");
}

// ====================== PHOTO ======================
export async function handleImageSelect(event, previewArea) {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return showToast("Invalid image", "error");
    if (file.size > 10 * 1024 * 1024) return showToast("Image too large (max 10MB)", "error");

    selectedImageFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        previewArea.innerHTML = `
            <div class="relative mt-4">
                <img src="${e.target.result}" class="image-preview rounded-2xl w-full" alt="Preview">
                <button id="removeImgBtn" class="absolute top-3 right-3 bg-red-600 hover:bg-red-700 text-white rounded-full w-8 h-8 flex items-center justify-center text-xl shadow-lg">✕</button>
            </div>`;
        document.getElementById('removeImgBtn').onclick = () => removeImage(previewArea);
    };
    reader.readAsDataURL(file);
}

export function removeImage(previewArea) {
    selectedImageFile = null;
    if (previewArea) previewArea.innerHTML = '';
}

// ====================== VOICE RECORDING ======================
export function toggleVoiceRecording(voiceBtn) {
    if (!engineInstance) return showToast("Voice engine not ready", "error");

    const isCurrentlyRecording = engineInstance.mediaRecorder && 
                                engineInstance.mediaRecorder.state !== "inactive";

    if (!isCurrentlyRecording) {
        // START
        engineInstance.startVoiceRecording(300000);
        isPaused = false;
        secondsElapsed = 0;

        voiceBtn.classList.add('recording-active');
        voiceBtn.innerHTML = `
            <span class="flex items-center gap-4 text-white">
                <span class="text-red-400 animate-pulse">● REC</span>
                <span id="rec-timer" class="font-mono text-xl font-bold">00:00</span>
                
                <button class="pause-btn px-5 py-2 bg-yellow-500 hover:bg-yellow-400 text-black rounded-2xl text-sm font-semibold transition-all">⏸️ Pause</button>
                
                <button class="stop-btn px-6 py-2 bg-red-600 hover:bg-red-500 rounded-2xl text-sm font-semibold transition-all">⏹️ Stop & Save</button>
                
                <canvas id="spectrum" width="260" height="68" class="ml-3"></canvas>
            </span>
        `;

        // Attach listeners
        setTimeout(() => {
            const pauseBtn = voiceBtn.querySelector('.pause-btn');
            const stopBtn = voiceBtn.querySelector('.stop-btn');

            if (pauseBtn) pauseBtn.addEventListener('click', () => pauseRecording(pauseBtn));
            if (stopBtn) stopBtn.addEventListener('click', () => stopVoiceRecordingNow());
        }, 100);

        setTimeout(setupSpectrumAnalyzer, 250);
        recordingTimerInterval = setInterval(updateTimer, 1000);
        
        showToast("🎤 Recording started", "info");

    } else {
        stopRecordingClean(voiceBtn);
    }
}

// Keep these functions
function stopRecordingClean(voiceBtn) {
    engineInstance?.stopVoiceRecording();
    stopSpectrumAnalyzer();
    
    voiceBtn.classList.remove('recording-active');
    voiceBtn.innerHTML = `<span>🎤 Voice Testimony</span>`;

    if (engineInstance?.currentAudioBlob) {
        showToast("✅ Recording saved", "success");
    }
}

window.stopVoiceRecordingNow = function() {
    const voiceBtn = document.getElementById('btn-voice');
    if (voiceBtn) stopRecordingClean(voiceBtn);
};

window.pauseRecording = function(btn) {
    isPaused = !isPaused;
    btn.textContent = isPaused ? '▶️ Resume' : '⏸️ Pause';
};
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
        analyser.fftSize = 128;
        if (engineInstance.mediaRecorder?.stream) {
            const source = audioContext.createMediaStreamSource(engineInstance.mediaRecorder.stream);
            source.connect(analyser);
            drawSpectrum();
        }
    } catch (e) {
        console.warn("Spectrum analyzer unavailable", e);
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

    const barWidth = (canvas.width / bufferLength) * 1.6;
    let x = 0;
    for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height * 0.9;
        canvasCtx.fillStyle = `hsl(${100 + dataArray[i]/3}, 90%, 65%)`;
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

// ====================== SECURE UPLOAD ======================
export async function uploadForensicMedia(userId = "anonymous", isWitnessMode = false) {
    if (!userId || userId === "anonymous") {
        throw new Error("User must be authenticated");
    }

    const mediaData = { imageUrl: null, audioUrl: null };

    // Image Upload
    if (selectedImageFile) {
        try {
            const hash = await generateSha256Hash(selectedImageFile);
            const path = isWitnessMode 
                ? `witness/${userId}/${Date.now()}_${selectedImageFile.name}`
                : `images/${userId}/${Date.now()}_${selectedImageFile.name}`;

            const imageRef = ref(storage, path);
            await uploadBytes(imageRef, selectedImageFile);
            mediaData.imageUrl = await getDownloadURL(imageRef);
            mediaData.imageHash = hash;
            console.log(`✅ Uploaded to ${path}`);
        } catch (e) {
            console.error("Image upload failed", e);
            throw e;
        }
    }

    // Audio Upload
    if (engineInstance?.currentAudioBlob) {
        try {
            const hash = await generateSha256Hash(engineInstance.currentAudioBlob);
            const audioRef = ref(storage, `testimonies/${userId}/${Date.now()}.webm`);
            await uploadBytes(audioRef, engineInstance.currentAudioBlob);
            mediaData.audioUrl = await getDownloadURL(audioRef);
            mediaData.audioHash = hash;
        } catch (e) {
            console.error("Audio upload failed", e);
        }
    }

    return mediaData;
}

export function resetMediaState() {
    selectedImageFile = null;
    const preview = document.getElementById('preview-area');
    if (preview) preview.innerHTML = '';
}

// Global exposure
window.handleImageSelect = handleImageSelect;
window.toggleVoiceRecording = toggleVoiceRecording;
window.resetMediaState = resetMediaState;
