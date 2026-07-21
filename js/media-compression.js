<script type="module">
    import { compressImage } from './js/media-compression.js';

    // ==================== ELEMENTS ====================
    const btnPhoto = document.getElementById('btn-photo');
    const btnVoice = document.getElementById('btn-voice');
    const mainInput = document.getElementById('mainInput');
    const previewArea = document.getElementById('preview-area');
    const postButton = document.getElementById('postButton');

    let mediaRecorder;
    let audioChunks = [];
    let recordedAudioUrl = null;
    let selectedFile = null;

    // ==================== ACTIVE STATE TOGGLE ====================
    function toggleActive(button) {
        if (button === btnPhoto) btnVoice.classList.remove('active');
        if (button === btnVoice) btnPhoto.classList.remove('active');
        button.classList.toggle('active');
    }

    // ==================== PHOTO WITH COMPRESSION ====================
    btnPhoto.addEventListener('click', async () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';

        input.onchange = async (e) => {
            let file = e.target.files[0];
            if (!file) return;

            showToast('Compressing image...', 'info');

            try {
                const compressedFile = await compressImage(file, 1200, 0.82);
                selectedFile = compressedFile;

                toggleActive(btnPhoto);

                // Preview
                const reader = new FileReader();
                reader.onload = (ev) => {
                    previewArea.innerHTML = `
                        <img src="${ev.target.result}" 
                           class="max-h-[300px] max-w-full rounded-2xl object-contain shadow-lg" 
                           alt="Preview">
                        <p class="text-xs text-emerald-400 mt-2">
                            ${compressedFile.name} • ${(compressedFile.size / (1024*1024)).toFixed(2)} MB
                        </p>
                    `;
                    previewArea.classList.add('has-content');
                };
                reader.readAsDataURL(compressedFile);

                showToast('Image ready (compressed)', 'success');

            } catch (err) {
                console.error(err);
                showToast('Image compression failed', 'error');
            }
        };
        input.click();
    });

    // ==================== VOICE RECORDING ====================
    let isRecording = false;

    btnVoice.addEventListener('click', async () => {
        if (!isRecording) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder = new MediaRecorder(stream);
                audioChunks = [];

                mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
                mediaRecorder.onstop = () => {
                    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                    recordedAudioUrl = URL.createObjectURL(audioBlob);
                    
                    previewArea.innerHTML = `
                        <div class="flex flex-col items-center gap-3">
                            <p class="text-emerald-400">🎤 Voice recorded</p>
                            <audio controls src="${recordedAudioUrl}" class="w-full max-w-md"></audio>
                        </div>
                    `;
                    previewArea.classList.add('has-content');
                };

                mediaRecorder.start();
                isRecording = true;
                btnVoice.classList.add('recording-active');
                btnVoice.textContent = '⏹️ Stop Recording';
                toggleActive(btnVoice);

            } catch (err) {
                showToast('Microphone access denied', 'error');
            }
        } else {
            mediaRecorder.stop();
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
            isRecording = false;
            btnVoice.classList.remove('recording-active');
            btnVoice.textContent = '🎤 Voice Testimony';
        }
    });

    // ==================== PUBLISH & RESET ====================
    postButton.addEventListener('click', () => {
        const text = mainInput.value.trim();

        if (!text && !selectedFile && !recordedAudioUrl) {
            showToast('Please add text or media before publishing', 'error');
            return;
        }

        showToast('✅ Testimony published to the Public Square!', 'success');
        setTimeout(resetComposer, 800);
    });

    function resetComposer() {
        mainInput.value = '';
        previewArea.innerHTML = 'Preview will appear here...';
        previewArea.classList.remove('has-content');
        
        btnPhoto.classList.remove('active');
        btnVoice.classList.remove('active', 'recording-active');
        btnVoice.textContent = '🎤 Voice Testimony';

        selectedFile = null;
        recordedAudioUrl = null;
        audioChunks = [];
    }

    // ==================== TOAST ====================
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `fixed bottom-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-2xl text-sm font-medium shadow-2xl z-[11000] ${
            type === 'success' ? 'bg-emerald-600' : type === 'error' ? 'bg-red-600' : 'bg-zinc-800'
        } text-white`;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3200);
    }

    console.log('%cVocalWitness media system loaded with compression', 'color:#10b981; font-weight:bold');
</script>
