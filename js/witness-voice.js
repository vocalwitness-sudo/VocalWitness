// js/witness-voice.js - Witness Voice Channel & Structured Evidence Intake Assistant
import { initFeed } from './feed.js';
import { sanitizeUserPII } from './onboarding.js';

const INTAKE_SYSTEM_PROMPT = `You are the VocalWitness Evidence Intake Assistant.
Your objective is to guide witnesses to frame their claims into court-admissible testimony structures.

Rules:
1. Clarify direct observation vs. third-party hearsay (e.g., "Did you witness this event directly, or learn of it through a third party?").
2. Establish chronological timeframes, location landmarks, and verifiable facts.
3. If input contains [REDACTED PII], remind the witness that identity/location identifiers have been automatically protected.
4. Structure final outputs in clear forensic format: [Direct Observation Status, Timeline, Fact Summary].`;

/**
 * Renders the Evidence Intake Assistant UI inside the Witness Voice portal
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
                <span class="text-[10px] bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-800">Court-Admissible Guide</span>
            </div>

            <div id="intake-chat-history" class="space-y-3 max-h-[220px] overflow-y-auto p-2 bg-zinc-900/60 rounded-2xl text-xs text-zinc-300">
                <div class="p-2.5 bg-zinc-800/80 rounded-xl border border-zinc-700/50">
                    <strong class="text-emerald-400">Assistant:</strong> Welcome. To ensure your testimony holds high legal integrity, did you witness this event directly with your own senses, or learn of it through a third party?
                </div>
            </div>

            <div class="flex gap-2">
                <input type="text" id="intake-user-input" placeholder="Type your testimony details..." class="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500" />
                <button type="button" id="intake-send-btn" class="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-4 py-2.5 rounded-xl font-semibold transition flex items-center gap-1">
                    <span>Send</span>
                </button>
            </div>
        </div>
    `;

    const sendBtn = container.querySelector('#intake-send-btn');
    const userInput = container.querySelector('#intake-user-input');
    const chatHistory = container.querySelector('#intake-chat-history');

    let intakeStep = 0;
    const structuredTestimony = {
        observationType: 'DIRECT',
        timeline: '',
        factSummary: ''
    };

    if (sendBtn && userInput && chatHistory) {
        sendBtn.addEventListener('click', async () => {
            const rawText = userInput.value.trim();
            if (!rawText) return;

            // 1. Apply Client-Side PII Censorship
            const sanitizedText = sanitizeUserPII(rawText);
            userInput.value = '';

            // Render User Message
            chatHistory.innerHTML += `
                <div class="p-2.5 bg-emerald-950/40 rounded-xl border border-emerald-800/50 text-right">
                    <span class="text-zinc-200">${sanitizedText}</span>
                </div>
            `;
            chatHistory.scrollTop = chatHistory.scrollHeight;

            // 2. Process Guided Intake Logic
            setTimeout(() => {
                let assistantReply = "";
                intakeStep++;

                if (intakeStep === 1) {
                    if (sanitizedText.toLowerCase().includes("third party") || sanitizedText.toLowerCase().includes("heard") || sanitizedText.toLowerCase().includes("told me")) {
                        structuredTestimony.observationType = 'HEARSAY_THIRD_PARTY';
                        assistantReply = "<strong>Noted as Third-Party Testimony.</strong> Who informed you of this event, and at approximately what date/time did you acquire this information?";
                    } else {
                        structuredTestimony.observationType = 'DIRECT_EYEWITNESS';
                        assistantReply = "<strong>Direct Observation Confirmed.</strong> At what approximate date and time did you directly witness this occurrence?";
                    }
                } else if (intakeStep === 2) {
                    structuredTestimony.timeline = sanitizedText;
                    assistantReply = "<strong>Timeline Recorded.</strong> Please state the core objective facts of what happened without speculation or assumptions.";
                } else {
                    structuredTestimony.factSummary = sanitizedText;
                    assistantReply = `
                        <div class="space-y-2">
                            <span class="text-emerald-400 font-bold">✅ Court-Admissible Testimony Structure Ready:</span>
                            <div class="p-2 bg-zinc-950 border border-zinc-800 rounded-lg text-[11px] font-mono text-zinc-300">
                                <div>• <strong>Type:</strong> ${structuredTestimony.observationType}</div>
                                <div>• <strong>Timeline:</strong> ${structuredTestimony.timeline}</div>
                                <div>• <strong>Facts:</strong> ${structuredTestimony.factSummary}</div>
                            </div>
                            <button type="button" onclick="window.applyStructuredTestimonyToForm('${structuredTestimony.observationType}', '${encodeURIComponent(structuredTestimony.timeline)}', '${encodeURIComponent(structuredTestimony.factSummary)}')" class="mt-2 w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-1.5 rounded-lg text-xs transition">
                                Insert Formatted Testimony into Post
                            </button>
                        </div>
                    `;
                }

                chatHistory.innerHTML += `
                    <div class="p-2.5 bg-zinc-800/80 rounded-xl border border-zinc-700/50">
                        <strong class="text-emerald-400">Assistant:</strong> ${assistantReply}
                    </div>
                `;
                chatHistory.scrollTop = chatHistory.scrollHeight;
            }, 500);
        });
    }
}

/**
 * Attach structured testimony into user posting form
 */
window.applyStructuredTestimonyToForm = (type, encodedTimeline, encodedFacts) => {
    const timeline = decodeURIComponent(encodedTimeline);
    const facts = decodeURIComponent(encodedFacts);

    const postInput = document.getElementById('post-content') || document.querySelector('textarea[name="content"]');
    if (postInput) {
        postInput.value = `[STRUCTURED WITNESS TESTIMONY]\n- Admissibility Type: ${type}\n- Timeline: ${timeline}\n- Verified Facts: ${facts}`;
        if (typeof window.showToast === 'function') {
            window.showToast('Structured testimony loaded into submission form!', 'success');
        }
    }
};

/**
 * Initializes the Witness Voice feed channel.
 * Triggers the feed engine with channelType = 'witness-voice'.
 */
export async function initWitnessVoice() {
    try {
        // 1. Initialize the Intake Assistant if container exists
        const intakeContainer = document.getElementById('witness-intake-assistant-container');
        if (intakeContainer) {
            renderEvidenceIntakeAssistant(intakeContainer);
        }

        // 2. Load Witness Voice channel in feed engine
        await initFeed(undefined, 'witness-voice');

        console.log('✅ Witness Voice channel & Intake Assistant active.');
    } catch (err) {
        console.error('Failed to initialize Witness Voice:', err);
    }
}
