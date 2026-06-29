import { showToast, generateSha256Hash } from './utils.js';
import { storage } from './firebase-config.js';
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js";
import { collection, addDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
export let selectedImageFile = null;
let engineInstance = null;
let currentMode = 'citizen-talk';
let recordingTimerInterval = null;
export function setEngine(engine) {
    engineInstance = engine;
    console.log("✅ Engine connected to media.js");
}
export function setCurrentMode(mode) {
    currentMode = mode;
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
        previewArea.innerHTML =  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<div class="relative"> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<img src="${e.target.result}" class="image-preview rounded-2xl w-full" alt="Preview"> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<button id="removeImgBtn" class="absolute top-3 right-3 bg-red-600 text-white rounded-full w-8 h-8 flex items-center justify-center">✕</button> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</div>;
        document.getElementById('removeImgBtn').onclick = () => removeImage(previewArea);
    };
    reader.readAsDataURL(file);
}
// ====================== VOICE RECORDING WITH TIMER ======================
export function toggleVoiceRecording(voiceBtn) {
    if (!engineInstance) {
        showToast("Voice engine not ready", "error");
        return;
    }
    if (!engineInstance.mediaRecorder || engineInstance.mediaRecorder.state === "inactive") {
        // START RECORDING
        engineInstance.startVoiceRecording(300000); // 5 min max
       
        voiceBtn.classList.add('recording-active');
        voiceBtn.innerHTML = ⏹️ <span id="rec-timer" class="font-mono">00:00</span>;
       
        let seconds = 0;
        recordingTimerInterval = setInterval(() => {
            seconds++;
            const min = String(Math.floor(seconds / 60)).padStart(2, '0');
            const sec = String(seconds % 60).padStart(2, '0');
            const timerEl = document.getElementById('rec-timer');
            if (timerEl) timerEl.textContent = ${min}:${sec};
        }, 1000);
        showToast("🎤 Recording... (max 5 min)", "info");
    } else {
        // STOP RECORDING
        engineInstance.stopVoiceRecording();
        clearInterval(recordingTimerInterval);
       
        voiceBtn.classList.remove('recording-active');
        voiceBtn.textContent = '🎙️ Voice Testimony';
       
        showToast("✅ Recording completed", "success");
    }
}
export function removeImage(previewArea) {
    selectedImageFile = null;
    if (previewArea) previewArea.innerHTML = '';
}
export async function uploadForensicMedia(userId = "anonymous") {
    const mediaData = {};
    if (selectedImageFile) {
        try {
            const hash = await generateSha256Hash(selectedImageFile);
            const imageRef = ref(storage, images/${userId}/${Date.now()}.jpg);
            await uploadBytes(imageRef, selectedImageFile);
            mediaData.imageUrl = await getDownloadURL(imageRef);
            mediaData.imageHash = hash;
        } catch (e) { console.error(e); }
    }
    if (engineInstance?.currentAudioBlob) {
        try {
            const hash = await generateSha256Hash(engineInstance.currentAudioBlob);
            const audioRef = ref(storage, testimonies/${userId}/${Date.now()}.webm);
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
// Global
window.handleImageSelect = handleImageSelect;
window.publishTestimony = async () => {
    if (!currentUser) {
        showToast("Please sign in with Google first", "error");
        return;
    }
    const textarea = document.getElementById('mainInput');
    const content = textarea?.value.trim() || "";
    if (!content && !selectedImageFile && !engineInstance?.currentAudioBlob) {
        showToast("Please add text, photo, or voice", "error");
        return;
    }
    const postBtn = document.getElementById('postButton');
    postBtn.disabled = true;
    postBtn.textContent = '🚀 Publishing...';
    try {
        const mediaData = await uploadForensicMedia(currentUser.uid);
        await addDoc(collection(db, "testimonies"), {
            author: currentUser.displayName || "Anonymous Witness",
            authorId: currentUser.uid,
            content: content,
            imageUrl: mediaData.imageUrl || null,
            audioUrl: mediaData.audioUrl || null,
            timestamp: new Date().toISOString(),
            feedVisibility: "citizen-talk",
            likes: 0,
            disputes: 0
        });
        showToast("✅ Testimony published to the Square!", "success");
        // Reset form
        if (textarea) textarea.value = '';
        resetMediaState();
        window.publishTestimony = async () => {
    if (!currentUser) {
        showToast("Please sign in with Google first", "error");
        return;
    }
    const textarea = document.getElementById('mainInput');
    const content = textarea?.value.trim() || "";
    if (!content && !selectedImageFile && !engineInstance?.currentAudioBlob) {
        showToast("Please add text, photo, or voice", "error");
        return;
    }
    const postBtn = document.getElementById('postButton');
    postBtn.disabled = true;
    postBtn.textContent = '🚀 Publishing...';
    try {
        const mediaData = await uploadForensicMedia(currentUser.uid);
        await addDoc(collection(db, "testimonies"), {
            author: currentUser.displayName || "Anonymous Witness",
            authorId: currentUser.uid,
            content: content,
            imageUrl: mediaData.imageUrl || null,
            audioUrl: mediaData.audioUrl || null,
            timestamp: new Date().toISOString(),
            feedVisibility: "citizen-talk",
            likes: 0,
            disputes: 0
        });
        showToast("✅ Testimony published successfully!", "success");
        if (textarea) textarea.value = '';
        resetMediaState();
    } catch (err) {
        console.error("Publish error:", err);
        showToast("Failed to publish", "error");
    } finally {
        postBtn.disabled = false;
        postBtn.textContent = '🚀 Publish Testimony to the Square';
    }
};
    } catch (err) {
        console.error("Publish error:", err);
        showToast("Failed to publish. Check console.", "error");
    } finally {
        postBtn.disabled = false;
        postBtn.textContent = '🚀 Publish Testimony to the Square';
    }
};
window.resetMediaState = resetMediaState;
