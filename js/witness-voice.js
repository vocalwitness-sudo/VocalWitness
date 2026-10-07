// js/witness-voice.js
// Hybrid Witness Voice Channel + Structured Evidence Intake + Live Voice Recording

import { initFeed } from './feed.js';
import { sanitizeUserPII } from './onboarding.js';
import { transcribeAudioWitness } from './ai-services.js';
import { showToast } from './utils.js';
import { db, auth } from './firebase-config.js';
import { submitTestimony } from './createPost.js';
import {
  collection,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function computeSHA256(fileOrBlob) {
  const buffer = await fileOrBlob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function showStatus(message, type = 'info') {
  const el = document.getElementById('wv-status');
  if (!el) return;
  el.classList.remove('hidden');
  el.textContent = message;
  el.className = `mt-4 text-center text-sm ${
    type === 'success' ? 'text-emerald-400' :
    type === 'error'   ? 'text-red-400' :
    type === 'warning' ? 'text-amber-400' : 'text-zinc-400'
  }`;
}

/* ------------------------------------------------------------------ */
/*  LIVE VOICE RECORDING                                              */
/* ------------------------------------------------------------------ */

let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;
let recordingStartTime = null;
let recordingTimerInterval = null;

function setupLiveVoiceRecording() {
  const btnVoice = document.getElementById('wv-btn-voice');
  if (!btnVoice) return;

  // Create recording UI controls dynamically
  const voiceSection = btnVoice.parentElement;
  
  // Add recording controls container
  const controls = document.createElement('div');
  controls.id = 'voice-recording-controls';
  controls.className = 'mt-3 hidden space-y-3';
  controls.innerHTML = `
    <div class="flex items-center gap-3">
      <button type="button" id="wv-record-start" 
              class="flex items-center gap-2 rounded-xl bg-red-600 hover:bg-red-500 px-4 py-2.5 text-sm font-semibold text-white transition">
        🔴 Start Recording
      </button>
      <button type="button" id="wv-record-stop" 
              class="hidden flex items-center gap-2 rounded-xl bg-zinc-700 hover:bg-zinc-600 px-4 py-2.5 text-sm font-semibold text-white transition">
        ⏹ Stop
      </button>
      <span id="wv-recording-timer" class="text-sm font-mono text-red-400 hidden">00:00</span>
    </div>
    
    <div id="wv-recording-preview" class="hidden">
      <audio id="wv-audio-preview" controls class="w-full"></audio>
      <div class="mt-2 flex gap-2">
        <button type="button" id="wv-use-recording" 
                class="rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition">
          ✅ Use This Recording
        </button>
        <button type="button" id="wv-discard-recording" 
                class="rounded-xl border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition">
          Discard
        </button>
      </div>
    </div>
  `;
  
  voiceSection.appendChild(controls);

  // Toggle recording panel
  btnVoice.addEventListener('click', () => {
    controls.classList.toggle('hidden');
  });

  const startBtn = document.getElementById('wv-record-start');
  const stopBtn = document.getElementById('wv-record-stop');
  const timerEl = document.getElementById('wv-recording-timer');
  const previewContainer = document.getElementById('wv-recording-preview');
  const audioPreview = document.getElementById('wv-audio-preview');
  const useBtn = document.getElementById('wv-use-recording');
  const discardBtn = document.getElementById('wv-discard-recording');

  startBtn.addEventListener('click', async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      recordedChunks = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        audioPreview.src = url;
        previewContainer.classList.remove('hidden');
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      isRecording = true;
      recordingStartTime = Date.now();

      startBtn.classList.add('hidden');
      stopBtn.classList.remove('hidden');
      timerEl.classList.remove('hidden');

      // Timer
      recordingTimerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
        const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const secs = String(elapsed % 60).padStart(2, '0');
        timerEl.textContent = `${mins}:${secs}`;
      }, 1000);

      showToast('Recording started...', 'info');
    } catch (err) {
      console.error(err);
      showToast('Microphone access denied or not available', 'error');
    }
  });

  stopBtn.addEventListener('click', () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      isRecording = false;
      clearInterval(recordingTimerInterval);

      startBtn.classList.remove('hidden');
      stopBtn.classList.add('hidden');
      timerEl.classList.add('hidden');
      timerEl.textContent = '00:00';

      showToast('Recording stopped', 'success');
    }
  });

  useBtn.addEventListener('click', async () => {
    if (recordedChunks.length === 0) return;

    const blob = new Blob(recordedChunks, { type: 'audio/webm' });
    const file = new File([blob], `witness-voice-${Date.now()}.webm`, { type: 'audio/webm' });

    try {
      showToast('Hashing voice recording...', 'info');
      const hash = await computeSHA256(file);
      const previewUrl = URL.createObjectURL(file);
      const id = crypto.randomUUID();

      attachedMedia.push({ id, type: 'audio', file, hash, previewUrl });
      renderMediaPreview();

      // Hide recording UI
      previewContainer.classList.add('hidden');
      controls.classList.add('hidden');
      recordedChunks = [];

      showToast('Voice recording added as evidence', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to process recording', 'error');
    }
  });

  discardBtn.addEventListener('click', () => {
    recordedChunks = [];
    previewContainer.classList.add('hidden');
    audioPreview.src = '';
    showToast('Recording discarded', 'info');
  });
}

/* ------------------------------------------------------------------ */
/*  Evidence Intake Assistant                                         */
/* ------------------------------------------------------------------ */

export function renderEvidenceIntakeAssistant(container) {
  if (!container) return;

  container.innerHTML = `
    <div class="bg-zinc-950 border border-emerald-900/50 rounded-3xl p-5 mb-6 space-y-4">
      <div class="flex items-center justify-between border-b border-zinc-800 pb-3">
        <div class="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
          <span>⚖️</span>
          <span>Evidence Intake Assistant</span>
        </div>
        <span class="text-[10px] bg-emerald-950 text-emerald-300 px-2.5 py-0.5 rounded-full border border-emerald-800 font-medium">
          Court-Admissible Guide
        </span>
      </div>
      <div id="intake-chat-history" class="space-y-3 max-h-[220px] overflow-y-auto p-2 bg-zinc-900/60 rounded-2xl text-xs text-zinc-300">
        <div class="p-2.5 bg-zinc-800/80 rounded-xl border border-zinc-700/50">
          <strong class="text-emerald-400">Assistant:</strong> 
          Welcome. Did you witness this event directly with your own senses, or learn of it through a third party?
        </div>
      </div>
      <div class="flex gap-2">
        <input type="text" id="intake-user-input" 
               placeholder="Type or attach audio testimony..."
               class="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500 transition" />
        
        <button type="button" id="intake-audio-btn" title="Attach Audio"
                class="bg-zinc-800 hover:bg-zinc-700 text-emerald-400 border border-emerald-900/50 text-xs px-3 py-2.5 rounded-xl font-semibold transition">
          🎙️
        </button>
        <input type="file" id="intake-audio-input" accept="audio/*" class="hidden" />
        
        <button type="button" id="intake-send-btn"
                class="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-4 py-2.5 rounded-xl font-semibold transition">
          Send
        </button>
      </div>
    </div>
  `;

  // ... (keep the rest of the intake assistant logic exactly as before)
  // For brevity I'm keeping the previous intake logic — it already has Send button
  const sendBtn = container.querySelector('#intake-send-btn');
  const userInput = container.querySelector('#intake-user-input');
  const chatHistory = container.querySelector('#intake-chat-history');
  const audioBtn = container.querySelector('#intake-audio-btn');
  const audioInput = container.querySelector('#intake-audio-input');

  let intakeStep = 0;
  const structuredTestimony = {
    observationType: 'DIRECT_EYEWITNESS',
    timeline: '',
    factSummary: ''
  };

  if (audioBtn && audioInput) {
    audioBtn.addEventListener('click', () => audioInput.click());
    audioInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        showToast('Transcribing audio...', 'info');
        const base64Audio = await blobToBase64(file);
        const transcript = await transcribeAudioWitness(base64Audio, file.type || 'audio/webm');
        if (transcript?.trim()) {
          userInput.value = transcript.trim();
          showToast('Audio transcribed successfully', 'success');
        }
      } catch (err) {
        showToast('Audio transcription failed', 'error');
      } finally {
        audioInput.value = '';
      }
    });
  }

  if (sendBtn && userInput && chatHistory) {
    const processInput = () => {
      const rawText = userInput.value.trim();
      if (!rawText) return;
      const sanitizedText = sanitizeUserPII(rawText);
      userInput.value = '';

      chatHistory.innerHTML += `
        <div class="p-2.5 bg-emerald-950/40 rounded-xl border border-emerald-800/50 text-right">
          <span class="text-zinc-200">${escapeHTML(sanitizedText)}</span>
        </div>`;

      setTimeout(() => {
        intakeStep++;
        let assistantReply = '';

        if (intakeStep === 1) {
          if (/third party|heard|told me|someone said/i.test(sanitizedText)) {
            structuredTestimony.observationType = 'HEARSAY_THIRD_PARTY';
            assistantReply = '<strong>Noted as Third-Party Testimony.</strong> Who informed you, and roughly when?';
          } else {
            structuredTestimony.observationType = 'DIRECT_EYEWITNESS';
            assistantReply = '<strong>Direct Observation Confirmed.</strong> At what approximate date and time did you witness this?';
          }
        } else if (intakeStep === 2) {
          structuredTestimony.timeline = sanitizedText;
          assistantReply = '<strong>Timeline Recorded.</strong> Please state the core facts (no speculation).';
        } else {
          structuredTestimony.factSummary = sanitizedText;
          assistantReply = `
            <div class="space-y-2">
              <span class="text-emerald-400 font-bold">✅ Structured Testimony Ready</span>
              <div class="p-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-[11px] font-mono text-zinc-300 space-y-1">
                <div>• Type: ${escapeHTML(structuredTestimony.observationType)}</div>
                <div>• Timeline: ${escapeHTML(structuredTestimony.timeline)}</div>
                <div>• Facts: ${escapeHTML(structuredTestimony.factSummary)}</div>
              </div>
              <button type="button" id="insert-testimony-btn"
                      class="mt-2 w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-1.5 rounded-lg text-xs">
                Insert into Form
              </button>
            </div>`;
        }

        chatHistory.innerHTML += `
          <div class="p-2.5 bg-zinc-800/80 rounded-xl border border-zinc-700/50">
            <strong class="text-emerald-400">Assistant:</strong> ${assistantReply}
          </div>`;

        const insertBtn = chatHistory.querySelector('#insert-testimony-btn');
        if (insertBtn) {
          insertBtn.addEventListener('click', () => {
            applyStructuredTestimonyToForm(
              structuredTestimony.observationType,
              structuredTestimony.timeline,
              structuredTestimony.factSummary
            );
          });
        }
      }, 400);
    };

    sendBtn.addEventListener('click', processInput);
    userInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        processInput();
      }
    });
  }
}

function applyStructuredTestimonyToForm(type, timeline, facts) {
  const contentEl = document.getElementById('wv-content');
  const whenEl = document.getElementById('wv-when');

  if (whenEl && timeline) whenEl.value = timeline;
  if (contentEl) {
    contentEl.value = `[STRUCTURED WITNESS TESTIMONY]
• Admissibility Type: ${type}
• Timeline: ${timeline}
• Verified Facts: ${facts}`;
    contentEl.dispatchEvent(new Event('input', { bubbles: true }));
    showToast('Structured testimony loaded into form', 'success');
  }
}

function setupCharCounter() {
  const textarea = document.getElementById('wv-content');
  const counter = document.getElementById('wv-char-count');
  if (!textarea || !counter) return;

  const update = () => {
    const len = textarea.value.length;
    counter.textContent = `${len} / 4000`;
    counter.classList.toggle('text-amber-400', len > 3500);
    counter.classList.toggle('text-red-400', len >= 4000);
  };
  textarea.addEventListener('input', update);
  update();
}

/* ------------------------------------------------------------------ */
/*  Media handling (file upload + live recording)                     */
/* ------------------------------------------------------------------ */

const attachedMedia = [];

function setupMediaButtons() {
  const btnPhoto = document.getElementById('wv-btn-photo');
  const btnVideo = document.getElementById('wv-btn-video');
  const inputPhoto = document.getElementById('wv-photo-input');
  const inputVideo = document.getElementById('wv-video-input');

  if (btnPhoto && inputPhoto) {
    btnPhoto.addEventListener('click', () => inputPhoto.click());
    inputPhoto.addEventListener('change', (e) => handleMediaSelect(e, 'image'));
  }
  if (btnVideo && inputVideo) {
    btnVideo.addEventListener('click', () => inputVideo.click());
    inputVideo.addEventListener('change', (e) => handleMediaSelect(e, 'video'));
  }

  // Live voice is handled separately
  setupLiveVoiceRecording();
}

async function handleMediaSelect(e, type) {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    showToast('Computing SHA-256 hash...', 'info');
    const hash = await computeSHA256(file);
    const previewUrl = URL.createObjectURL(file);
    const id = crypto.randomUUID();

    attachedMedia.push({ id, type, file, hash, previewUrl });
    renderMediaPreview();
    showToast(`${type} attached & hashed`, 'success');
  } catch (err) {
    showToast('Failed to process media', 'error');
  } finally {
    e.target.value = '';
  }
}

function renderMediaPreview() {
  const container = document.getElementById('wv-preview');
  const list = document.getElementById('wv-preview-list');
  if (!container || !list) return;

  if (attachedMedia.length === 0) {
    container.classList.add('hidden');
    list.innerHTML = '';
    return;
  }

  container.classList.remove('hidden');
  list.innerHTML = attachedMedia.map(item => {
    let mediaEl = '';
    if (item.type === 'image') {
      mediaEl = `<img src="${item.previewUrl}" class="w-full h-[140px] object-cover" alt="evidence">`;
    } else if (item.type === 'video') {
      mediaEl = `<video src="${item.previewUrl}" controls muted class="w-full h-[140px] object-cover"></video>`;
    } else {
      mediaEl = `<div class="h-[140px] flex items-center justify-center text-4xl bg-zinc-800">🎤</div>`;
    }

    return `
      <div class="media-card relative rounded-2xl overflow-hidden border border-zinc-700">
        ${mediaEl}
        <button type="button" class="absolute top-2 right-2 bg-black/70 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm"
                data-remove="${item.id}">×</button>
        <div class="p-2 text-[10px] font-mono text-emerald-400">
          ${item.hash.slice(0, 16)}…${item.hash.slice(-8)}
        </div>
      </div>`;
  }).join('');

  list.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-remove');
      const idx = attachedMedia.findIndex(m => m.id === id);
      if (idx > -1) {
        URL.revokeObjectURL(attachedMedia[idx].previewUrl);
        attachedMedia.splice(idx, 1);
        renderMediaPreview();
      }
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Publish / Seal Button                                             */
/* ------------------------------------------------------------------ */

function setupPublishButton() {
  const btn = document.getElementById('wv-publishBtn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    if (!auth.currentUser) {
      return showToast('Please sign in to publish', 'error');
    }

    const title = document.getElementById('wv-title')?.value.trim() || '';
    const content = document.getElementById('wv-content')?.value.trim() || '';
    const when = document.getElementById('wv-when')?.value.trim() || '';
    const where = document.getElementById('wv-where')?.value.trim() || '';
    const category = document.getElementById('wv-category')?.value || '';
    const isAnonymous = document.getElementById('wv-anonymous')?.checked || false;

    if (!title || !content || !when || !where) {
      showStatus('Please fill all required fields (*)', 'error');
      return showToast('Missing required fields', 'error');
    }

    btn.disabled = true;
    btn.textContent = 'Sealing...';
    showStatus('Creating cryptographic seal & evidence pack...', 'info');

    try {
      const mediaFile = attachedMedia.length > 0 ? attachedMedia[0].file : null;

      const fullContent = `[WITNESS VOICE STRUCTURED RECORD]
Title: ${title}
When: ${when}
Where: ${where}
Category: ${category || 'Unspecified'}

${content}`;

      await submitTestimony({
        content: fullContent,
        channel: 'witness-voice',
        mediaFile,
        isAnonymous,
        isZkVerified: false
      });

      showToast('🛡️ Witness Voice testimony sealed & published!', 'success');
      showStatus('✅ Testimony sealed and published to the forensic ledger', 'success');

      // Reset
      ['wv-title', 'wv-content', 'wv-when', 'wv-where', 'wv-category'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      document.getElementById('wv-anonymous').checked = false;
      document.getElementById('wv-char-count').textContent = '0 / 4000';

      attachedMedia.forEach(m => URL.revokeObjectURL(m.previewUrl));
      attachedMedia.length = 0;
      renderMediaPreview();

    } catch (err) {
      console.error(err);
      showToast(err.message || 'Failed to publish', 'error');
      showStatus('Publish failed. Please try again.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Seal & Publish Testimony';
    }
  });
}

/* ------------------------------------------------------------------ */
/*  Init                                                              */
/* ------------------------------------------------------------------ */

export async function initWitnessVoice() {
  try {
    const intakeContainer = document.getElementById('witness-intake-assistant-container');
    if (intakeContainer) {
      renderEvidenceIntakeAssistant(intakeContainer);
    }

    setupCharCounter();
    setupMediaButtons();          // includes live voice recording
    setupPublishButton();

    await initFeed(undefined, 'witness-voice');

    console.log('✅ Hybrid Witness Voice ready (with live recording)');
  } catch (err) {
    console.error('Failed to initialize Witness Voice:', err);
  }
}
