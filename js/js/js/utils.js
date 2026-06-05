// Global assets storage states
window.compressedImageBase64 = null;
window.recordedAudioBlob = null;

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let recordingTimeout = null;

export function showToast(message, type = "success", duration = 4000) {
    const container = document.getElementById('toastContainer') || (() => {
        const c = document.createElement('div');
        c.id = 'toastContainer';
        c.className = "fixed bottom-6 left-1/2 -translate-x-1/2 space-y-2 w-11/12 max-w-sm z-[100]";
        document.body.appendChild(c);
        return c;
    })();
    
    const toast = document.createElement('div');
    const colors = { success: "bg-emerald-500 text-black", error: "bg-red-600 text-white", info: "bg-blue-600 text-white" };
    toast.className = `px-5 py-3.5 rounded-2xl text-xs font-black tracking-wide text-center border border-zinc-800 shadow-2xl transition-all duration-300 ${colors[type] || colors.success}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 300);
    }, duration);
}
window.showToast = showToast;

export async function toggleRecording() {
    const voiceBtn = document.getElementById('voiceBtn');
    if (!voiceBtn) return;

    if (!isRecording) {
        audioChunks = [];
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showToast("Audio recording is not supported on your device/browser.", "error");
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) audioChunks.push(event.data);
            };

            mediaRecorder.onstop = () => {
                window.recordedAudioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
                showToast("Voice testimony attached successfully!", "success");
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            isRecording = true;
            voiceBtn.classList.add('recording-active');
            voiceBtn.innerText = "🛑 Stop Recording";
            showToast("Recording voice testimony...", "info");

            recordingTimeout = setTimeout(() => {
                if (isRecording) {
                    toggleRecording();
                    showToast("Secure limits reached. File wrapped up.", "info");
                }
            }, 45000);

        } catch (err) {
            showToast("Microphone access blocked.", "error");
        }
    } else {
        if (recordingTimeout) clearTimeout(recordingTimeout);
        if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
        isRecording = false;
        voiceBtn.classList.remove('recording-active');
        voiceBtn.innerText = "Voice Testimony";
    }
}
window.startVoiceRecording = toggleRecording; // Map to index.html click hook

export async function generateSha256Hash(blob) {
    const arrayBuffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
}

export function handleImageSelect(e) {
    const currentImageFile = e.target.files[0];
    if (!currentImageFile) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            
            const max_size = 1024;
            if (width > height) {
                if (width > max_size) { height *= max_size / width; width = max_size; }
            } else {
                if (height > max_size) { width *= max_size / height; height = max_size; }
            }
            
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            window.compressedImageBase64 = canvas.toDataURL('image/jpeg', 0.6);
            
            const preview = document.getElementById('previewArea');
            if (preview) {
                preview.innerHTML = `
                    <div class="relative">
                        <img src="${window.compressedImageBase64}" class="image-preview">
                        <button onclick="window.removeImage()" class="absolute top-2 right-2 bg-black/70 text-white rounded-full p-1 text-xs px-2 hover:bg-black">✕ Remove</button>
                    </div>`;
                preview.classList.remove('hidden');
            }
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(currentImageFile);
}
window.handleImageSelect = handleImageSelect;

export function triggerImageUpload() { document.getElementById('imageInput').click(); }
window.triggerImageUpload = triggerImageUpload;

export function removeImage() {
    window.compressedImageBase64 = null;
    if(document.getElementById('imageInput')) document.getElementById('imageInput').value = '';
    const preview = document.getElementById('previewArea');
    if (preview) { preview.innerHTML = ''; preview.classList.add('hidden'); }
}
window.removeImage = removeImage;

// Event attachment setups
document.addEventListener('DOMContentLoaded', () => {
    const savedLang = localStorage.getItem('preferredLanguage') || '+44'; 
    if(document.getElementById('language-select')) {
        document.getElementById('language-select').value = savedLang;
        document.getElementById('language-select').addEventListener('change', () => {
            if(window.changeLanguage) window.changeLanguage();
        });
    }
});
