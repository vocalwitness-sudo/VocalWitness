// js/witness-voice.js
// Witness Voice Channel + Structured Evidence Intake

import { initFeed } from './feed.js';
import { sanitizeUserPII } from './onboarding.js';
import { transcribeAudioWitness } from './ai-services.js';
import { showToast } from './utils.js';
import { db, auth } from './firebase-config.js';
import {
  collection,
  addDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';

const INTAKE_SYSTEM_PROMPT = `You are the VocalWitness Evidence Intake Assistant.
Your objective is to guide witnesses to frame their claims into court-admissible testimony structures.
Rules:
1. Clarify direct observation vs. third-party hearsay.
2. Establish chronological timeframes, location landmarks, and verifiable facts.
3. If input contains [REDACTED PII], remind the witness that identity/location identifiers have been automatically protected.
4. Structure final outputs in clear forensic format: [Direct Observation Status, Timeline, Fact Summary].`;

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
    reader.onloadend = () => {
      const dataUrl = reader.result;
      resolve(dataUrl.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Renders the Evidence Intake Assistant
 */
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

  const sendBtn = container.querySelector('#intake-send-btn');
  const userInput = container.querySelector('#intake-user-input');
  const chatHistory = container.querySelector('#intake-chat-history');
  const audioBtn = container.querySelector('#intake-audio-btn');
  const audioInput = container.querySelector('#intake-audio-input');

  let intakeStep = 0;
  const structuredTestimony = {
    observationType: 'DIRECT',
    timeline: '',
    factSummary: ''
  };

  // Audio upload
  if (audioBtn && audioInput) {
    audioBtn.addEventListener('click', () => audioInput.click());

    audioInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        showToast('Transcribing audio...', 'info');
        chatHistory.innerHTML += `
          <div id="audio-transcribing-loader" class="p-2.5 bg-zinc-800/50 rounded-xl border border-zinc-700/50 text-xs text-emerald-400 flex items-center gap-2">
            <span class="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
            Transcribing audio...
          </div>`;
        chatHistory.scrollTop = chatHistory.scrollHeight;

        const base64Audio = await blobToBase64(file);
        const transcript = await transcribeAudioWitness(base64Audio, file.type || 'audio/webm');

        document.getElementById('audio-transcribing-loader')?.remove();

        if (transcript?.trim()) {
          userInput.value = transcript.trim();
          showToast('Audio transcribed successfully', 'success');
        } else {
          showToast('Could not transcribe audio', 'warning');
        }
      } catch (err) {
        console.error(err);
        document.getElementById('audio-transcribing-loader')?.remove();
        showToast('Audio transcription failed', 'error');
      } finally {
        audioInput.value = '';
      }
    });
  }

  // Chat logic
  if (sendBtn && userInput && chatHistory) {
    const processInput = async () => {
      const rawText = userInput.value.trim();
      if (!rawText) return;

      const sanitizedText = sanitizeUserPII(rawText);
      userInput.value = '';

      chatHistory.innerHTML += `
        <div class="p-2.5 bg-emerald-950/40 rounded-xl border border-emerald-800/50 text-right">
          <span class="text-zinc-200">${escapeHTML(sanitizedText)}</span>
        </div>`;
      chatHistory.scrollTop = chatHistory.scrollHeight;

      setTimeout(() => {
        let assistantReply = '';
        intakeStep++;

        if (intakeStep === 1) {
          if (/third party|heard|told me|someone said/i.test(sanitizedText)) {
            structuredTestimony.observationType = 'HEARSAY_THIRD_PARTY';
            assistantReply = '<strong>Noted as Third-Party Testimony.</strong> Who informed you, and roughly when did you learn this?';
          } else {
            structuredTestimony.observationType = 'DIRECT_EYEWITNESS';
            assistantReply = '<strong>Direct Observation Confirmed.</strong> At what approximate date and time did you witness this?';
          }
        } else if (intakeStep === 2) {
          structuredTestimony.timeline = sanitizedText;
          assistantReply = '<strong>Timeline Recorded.</strong> Please state the core facts of what happened (no speculation).';
        } else {
          structuredTestimony.factSummary = sanitizedText;
          assistantReply = `
            <div class="space-y-2">
              <span class="text-emerald-400 font-bold">✅ Structured Testimony Ready</span>
              <div class="p-2.5 bg-zinc-950 border border-zinc-800 rounded-lg text-[11px] font-mono text-zinc-300 space-y-1">
                <div>• <strong>Type:</strong> ${escapeHTML(structuredTestimony.observationType)}</div>
                <div>• <strong>Timeline:</strong> ${escapeHTML(structuredTestimony.timeline)}</div>
                <div>• <strong>Facts:</strong> ${escapeHTML(structuredTestimony.factSummary)}</div>
              </div>
              <button type="button" id="insert-testimony-btn"
                      class="mt-2 w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-1.5 rounded-lg text-xs transition">
                Insert into Form
              </button>
            </div>`;
        }

        chatHistory.innerHTML += `
          <div class="p-2.5 bg-zinc-800/80 rounded-xl border border-zinc-700/50">
            <strong class="text-emerald-400">Assistant:</strong> ${assistantReply}
          </div>`;
        chatHistory.scrollTop = chatHistory.scrollHeight;

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

/**
 * Insert structured testimony into the main form
 */
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

/**
 * Character counter for the main textarea
 */
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

/**
 * Publish handler for the new form
 */
async function setupPublishButton() {
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

    if (!content) {
      return showToast('Please write what you witnessed', 'error');
    }

    btn.disabled = true;
    btn.textContent = 'Publishing...';

    try {
      await addDoc(collection(db, 'testimonies'), {
        title,
        content,
        text: content,
        when,
        where,
        category,
        isAnonymous,
        authorId: auth.currentUser.uid,
        author: isAnonymous ? 'Anonymous' : (auth.currentUser.displayName || 'Witness'),
        channel: 'witness-voice',
        feedVisibility: 'witness-voice',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      showToast('Testimony published successfully', 'success');

      // Reset form
      document.getElementById('wv-title').value = '';
      document.getElementById('wv-content').value = '';
      document.getElementById('wv-when').value = '';
      document.getElementById('wv-where').value = '';
      document.getElementById('wv-category').value = '';
      document.getElementById('wv-anonymous').checked = false;
      document.getElementById('wv-char-count').textContent = '0 / 4000';

    } catch (err) {
      console.error(err);
      showToast('Failed to publish testimony', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Publish Testimony';
    }
  });
}

/**
 * Main initializer
 */
export async function initWitnessVoice() {
  try {
    // 1. Intake Assistant
    const intakeContainer = document.getElementById('witness-intake-assistant-container');
    if (intakeContainer) {
      renderEvidenceIntakeAssistant(intakeContainer);
    }

    // 2. Character counter + Publish button
    setupCharCounter();
    setupPublishButton();

    // 3. Load the Witness Voice feed
    await initFeed(undefined, 'witness-voice');

    console.log('✅ Witness Voice channel ready');
  } catch (err) {
    console.error('Failed to initialize Witness Voice:', err);
  }
}
