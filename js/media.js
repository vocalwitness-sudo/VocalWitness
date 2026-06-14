// js/media.js
export function handleImageSelect(e, previewContainer) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    
    reader.onload = function(event) {
        // Safety check - make sure container exists
        if (!previewContainer) {
            console.warn("Preview container not found");
            return;
        }

        // Clear previous preview
        previewContainer.innerHTML = '';

        const img = document.createElement('img');
        img.src = event.target.result;
        img.className = "image-preview max-h-64 rounded-2xl mt-3 border border-emerald-500/30";
        img.alt = "Selected image";

        previewContainer.appendChild(img);
        
        // Optional: Show a small "Forensic Shield" badge
        const badge = document.createElement('div');
        badge.className = "text-xs bg-emerald-600 text-white px-3 py-1 rounded-full inline-flex items-center gap-1 mt-2";
        badge.innerHTML = '🔒 Forensic Shield Active';
        previewContainer.appendChild(badge);
    };

    reader.readAsDataURL(file);
}

export function toggleVoiceRecording(btn) {
    if (!btn) return;
    
    const isRecording = btn.classList.contains('recording-active');
    
    if (isRecording) {
        btn.classList.remove('recording-active');
        btn.textContent = '🎤 Voice Testimony';
        // TODO: Stop recording logic
        console.log("Voice recording stopped");
    } else {
        btn.classList.add('recording-active');
        btn.textContent = '⏹️ Stop Recording';
        // TODO: Start recording logic
        console.log("Voice recording started");
    }
}

export function resetMediaState() {
    // Clear image preview if exists
    const preview = document.getElementById('preview-area') || document.querySelector('.image-preview')?.parentElement;
    if (preview) preview.innerHTML = '';
}
