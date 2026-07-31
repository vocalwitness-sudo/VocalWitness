// js/composer.js
import { compressImage } from './media-compression.js';
import { showToast, generateSha256Hash } from './utils.js';
import { getCurrentUserTier, getCurrentWitnessLevel } from './tier.js';
import { db, auth, storage } from './firebase-config.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js";

let mediaRecorder = null;
let mediaStream = null;
let audioChunks = [];
let recordedAudioBlob = null;
let recordedAudioUrl = null;
let selectedFile = null;
let isRecording = false;

const btnPhoto = document.getElementById('btn-photo');
const btnVoice = document.getElementById('btn-voice');
const mainInput = document.getElementById('mainInput');
const previewArea = document.getElementById('preview-area');
const postButton = document.getElementById('postButton');

// ==================== ACTIVE STATE TOGGLE ====================
function toggleActive(button) {
    if (button === btnPhoto) btnVoice?.classList.remove('active');
    if (button === btnVoice) btnPhoto?.classList.remove('active');
    button?.classList.toggle('active');
}

// ==================== PHOTO UPLOAD WITH COMPRESSION ====================
btnPhoto?.addEventListener('click', async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const compressedFile = await compressImage(file, 1200, 0.82);
            selectedFile = compressedFile;
            toggleActive(btnPhoto);

            const reader = new FileReader();
            reader.onload = (ev) => {
                if (!previewArea) return;
                previewArea.innerHTML = `
                    <img src="${ev.target.result}"
                         class="max-h-[300px] max-w-full rounded-2xl object-contain shadow-lg"
                         alt="Preview">
                    <p class="text-xs text-emerald-400 mt-2">
                        ${compressedFile.name} • ${(compressedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                `;
                previewArea.classList.add('has-content');
            };
            reader.readAsDataURL(compressedFile);
        } catch (err) {
            console.error(err);
            showToast('Failed to compress image', 'error');
        }
    };
    input.click();
});

// ==================== VOICE RECORDING (hardened) ====================
function getSupportedMimeType() {
    const types = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4'
    ];
    for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return ''; // let browser decide
}

function cleanupStream() {
    if (mediaStream) {
        mediaStream.getTracks().forEach(t => t.stop());
        mediaStream = null;
    }
}

btnVoice?.addEventListener('click', async () => {
    if (!isRecording) {
        try {
            mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mimeType = getSupportedMimeType();
            const options = mimeType ? { mimeType } : {};

            mediaRecorder = new MediaRecorder(mediaStream, options);
            audioChunks = [];
            recordedAudioBlob = null;

            mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    audioChunks.push(e.data);
                }
            };

            mediaRecorder.onstop = () => {
                recordedAudioBlob = new Blob(audioChunks, {
                    type: mediaRecorder.mimeType || 'audio/webm'
                });

                console.log('🎙️ Recording finished. Blob size:', recordedAudioBlob.size, 'bytes');

                if (!recordedAudioBlob || recordedAudioBlob.size === 0) {
                    showToast('Recording is empty. Please try again.', 'error');
                    cleanupStream();
                    return;
                }

                // Revoke previous object URL to avoid memory leaks
                if (recordedAudioUrl) URL.revokeObjectURL(recordedAudioUrl);
                recordedAudioUrl = URL.createObjectURL(recordedAudioBlob);

                if (previewArea) {
                    previewArea.innerHTML = `
                        <div class="flex flex-col items-center">
                            <p class="text-emerald-400 mb-2">🎤 Voice recorded (${(recordedAudioBlob.size / 1024).toFixed(1)} KB)</p>
                            <audio controls src="${recordedAudioUrl}" class="w-full max-w-md"></audio>
                        </div>
                    `;
                    previewArea.classList.add('has-content');
                }

                cleanupStream();
            };

            mediaRecorder.onerror = (e) => {
                console.error('MediaRecorder error:', e);
                showToast('Recording error occurred', 'error');
                cleanupStream();
                isRecording = false;
                btnVoice?.classList.remove('recording-active');
                if (btnVoice) btnVoice.textContent = '🎤 Voice Testimony';
            };

            // Critical: request data every second so we never get a single empty final chunk
            mediaRecorder.start(1000);

            isRecording = true;
            btnVoice.classList.add('recording-active');
            btnVoice.textContent = '⏹️ Stop Recording';
            toggleActive(btnVoice);

        } catch (err) {
            console.error(err);
            showToast('Microphone access denied or not available', 'error');
            cleanupStream();
        }
    } else {
        // STOP
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
        isRecording = false;
        btnVoice.classList.remove('recording-active');
        btnVoice.textContent = '🎤 Voice Testimony';
    }
});

// ==================== PUBLISH BUTTON ====================
postButton?.addEventListener('click', async () => {
    const text = mainInput?.value.trim();

    if (!text && !selectedFile && !recordedAudioBlob) {
        showToast('Please write something or add media', 'error');
        return;
    }

    if (!auth.currentUser) {
        showToast('You must be logged in to publish testimony', 'error');
        return;
    }

    // Extra safety – never upload an empty audio blob
    if (recordedAudioBlob && recordedAudioBlob.size === 0) {
        showToast('Recording is empty. Please record again.', 'error');
        return;
    }

    // Rate Limit Check
    try {
        const functions = getFunctions(undefined, 'us-central1');
        const checkRateLimitFn = httpsCallable(functions, 'checkRateLimit');
        const rateLimitCheck = await checkRateLimitFn({
            userId: auth.currentUser.uid,
            action: "create_testimony",
            maxCalls: 6,
            windowMinutes: 60
        });

        if (!rateLimitCheck.data) {
            showToast("You've reached your posting limit for now. Please try again later.", "error");
            return;
        }
    } catch (rateError) {
        console.warn("Rate limit check failed, allowing post (fail-open):", rateError);
    }

    postButton.disabled = true;
    postButton.textContent = 'Publishing...';

    try {
        let imageUrl = null;
        let audioUrl = null;
        let imageHash = null;
        const userId = auth.currentUser.uid;

        // 1. Upload compressed image
        if (selectedFile) {
            if (selectedFile.size === 0) {
                throw new Error('Selected image is empty');
            }
            const fileRef = ref(storage, `evidence/${userId}/${Date.now()}_${selectedFile.name}`);
            await uploadBytes(fileRef, selectedFile, {
                contentType: selectedFile.type || 'image/jpeg'
            });
            imageUrl = await getDownloadURL(fileRef);
            imageHash = await generateSha256Hash(selectedFile);
        }

        // 2. Upload voice (only if non-empty)
        if (recordedAudioBlob && recordedAudioBlob.size > 0) {
            const audioRef = ref(storage, `evidence/${userId}/${Date.now()}_voice.webm`);
            await uploadBytes(audioRef, recordedAudioBlob, {
                contentType: recordedAudioBlob.type || 'audio/webm'
            });
            audioUrl = await getDownloadURL(audioRef);
            console.log('✅ Audio uploaded:', audioUrl, `(${recordedAudioBlob.size} bytes)`);
        }

        // 3. User tier metadata
        const userTier = await getCurrentUserTier();
        const userWitnessLevel = await getCurrentWitnessLevel();

        // 4. Save to Firestore
        await addDoc(collection(db, "testimonies"), {
            content: text || "",
            imageUrl,
            audioUrl,
            forensicHash: imageHash,
            authorId: userId,
            authorTier: userTier,
            authorWitnessLevel: userWitnessLevel ? userWitnessLevel.name : null,
            createdAt: serverTimestamp()
        });

        showToast('✅ Testimony published to the Public Square!', 'success');

        // Reset UI
        if (mainInput) mainInput.value = '';
        if (previewArea) {
            previewArea.innerHTML = 'Preview will appear here...';
            previewArea.classList.remove('has-content');
        }

        btnPhoto?.classList.remove('active');
        btnVoice?.classList.remove('active', 'recording-active');
        if (btnVoice) btnVoice.textContent = '🎤 Voice Testimony';

        selectedFile = null;
        recordedAudioBlob = null;
        if (recordedAudioUrl) {
            URL.revokeObjectURL(recordedAudioUrl);
            recordedAudioUrl = null;
        }
        audioChunks = [];

        window.dispatchEvent(new CustomEvent('vocalWitness:posted'));

    } catch (err) {
        console.error("Publish Error:", err);
        showToast(err.message || 'Failed to publish post. Check connection.', 'error');
    } finally {
        postButton.disabled = false;
        postButton.textContent = 'Publish';
    }
});

window.addEventListener('languageChanged', () => {
    const composerInput = document.getElementById('testimonyInput');
    if (composerInput && window.t) {
        composerInput.placeholder = window.t('placeholder');
    }
});

console.log('%cComposer module loaded successfully', 'color:#10b981; font-weight:bold');
