// js/composer.js
import { compressImage } from './media-compression.js';
import { showToast, generateSha256Hash } from './utils.js';
import { getCurrentUserTier, getCurrentWitnessLevel } from './tier.js';
import { db, auth, storage } from './firebase-config.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js";

let mediaRecorder;
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

// ==================== VOICE RECORDING ====================
btnVoice?.addEventListener('click', async () => {
    if (!isRecording) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
            mediaRecorder.onstop = () => {
                recordedAudioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                recordedAudioUrl = URL.createObjectURL(recordedAudioBlob);
                
                if (previewArea) {
                    previewArea.innerHTML = `
                        <div class="flex flex-col items-center">
                            <p class="text-emerald-400 mb-2">🎤 Voice recorded</p>
                            <audio controls src="${recordedAudioUrl}" class="w-full max-w-md"></audio>
                        </div>
                    `;
                    previewArea.classList.add('has-content');
                }
            };

            mediaRecorder.start();
            isRecording = true;
            btnVoice.classList.add('recording-active');
            btnVoice.textContent = '⏹️ Stop Recording';
            toggleActive(btnVoice);

        } catch (err) {
            showToast('Microphone access denied or not available', 'error');
        }
    } else {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
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

    postButton.disabled = true;
    postButton.textContent = 'Publishing...';

    try {
        let imageUrl = null;
        let audioUrl = null;
        let imageHash = null;

        // 1. Upload compressed image if attached
        if (selectedFile) {
            const fileRef = ref(storage, `evidence/images/${Date.now()}_${selectedFile.name}`);
            await uploadBytes(fileRef, selectedFile);
            imageUrl = await getDownloadURL(fileRef);
            imageHash = await generateSha256Hash(selectedFile);
        }

        // 2. Upload voice recording if attached
        if (recordedAudioBlob) {
            const audioRef = ref(storage, `evidence/audio/${Date.now()}_voice.webm`);
            await uploadBytes(audioRef, recordedAudioBlob);
            audioUrl = await getDownloadURL(audioRef);
        }

        // 3. Fetch user tier metadata
        const userTier = await getCurrentUserTier();
        const userWitnessLevel = await getCurrentWitnessLevel();

        // 4. Save to Firestore
        await addDoc(collection(db, "posts"), {
            content: text || "",
            imageUrl: imageUrl,
            audioUrl: audioUrl,
            forensicHash: imageHash,
            authorId: auth.currentUser ? auth.currentUser.uid : 'anonymous',
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
        recordedAudioUrl = null;
        audioChunks = [];

    } catch (err) {
        console.error("Publish Error:", err);
        showToast('Failed to publish post. Check connection.', 'error');
    } finally {
        postButton.disabled = false;
        postButton.textContent = 'Publish';
    }
});

console.log('%cComposer module loaded successfully', 'color:#10b981; font-weight:bold');
