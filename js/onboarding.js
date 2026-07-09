// js/onboarding.js - Legal, Welcome & Onboarding Flow
import { db, auth } from './firebase-config.js';   // Correct relative path

export function showLegalNotice() {
    if (localStorage.getItem('hasSeenLegal')) return;

    const modal = document.createElement('div');
    modal.id = 'legal-modal';
    modal.className = 'fixed inset-0 bg-black/90 flex items-center justify-center z-[100]';
    modal.innerHTML = `
        <div class="bg-zinc-900 border border-red-600/50 rounded-3xl max-w-lg mx-4 p-8 text-center">
            <div class="text-5xl mb-6">⚖️</div>
            <h2 class="text-3xl font-bold text-white mb-4">Important Legal Notice</h2>
            <p class="text-red-400 font-medium mb-6">
                VocalWitness functions strictly as an un-manipulated decentralized distribution medium.
            </p>
            <p class="text-zinc-400 text-sm leading-relaxed mb-8">
                This platform does not verify the truthfulness of testimonies. 
                Users are solely responsible for what they publish. 
                Always act responsibly and ethically.
            </p>
            <button id="accept-legal" 
                    class="w-full bg-green-600 hover:bg-green-500 transition py-4 rounded-2xl text-white font-semibold text-lg">
                I Understand and Agree
            </button>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('accept-legal').addEventListener('click', () => {
        localStorage.setItem('hasSeenLegal', 'true');
        modal.remove();
        setTimeout(showWelcomeOnboarding, 600);
    });
}

function showWelcomeOnboarding() {
    if (localStorage.getItem('onboardingComplete')) return;

    const modal = document.createElement('div');
    modal.id = 'onboarding-modal';
    modal.className = 'fixed inset-0 bg-black/90 flex items-center justify-center z-[100]';
    modal.innerHTML = `
        <div class="bg-zinc-900 rounded-3xl max-w-md mx-4 p-8 text-center">
            <h2 class="text-3xl font-bold text-white mb-2">Welcome, Witness! 👋</h2>
            <p class="text-zinc-400 mb-8">Here's how to get started on VocalWitness</p>
            
            <div class="space-y-6 text-left">
                <div class="flex gap-4">
                    <div class="text-2xl">📸</div>
                    <div>
                        <strong class="text-white">Add Evidence</strong>
                        <p class="text-sm text-zinc-400">Use Photo + Forensic Shield or Voice Testimony</p>
                    </div>
                </div>
                <div class="flex gap-4">
                    <div class="text-2xl">🔒</div>
                    <div>
                        <strong class="text-white">Get Verified</strong>
                        <p class="text-sm text-zinc-400">Become a True Witness for more visibility</p>
                    </div>
                </div>
                <div class="flex gap-4">
                    <div class="text-2xl">🚀</div>
                    <div>
                        <strong class="text-white">Publish</strong>
                        <p class="text-sm text-zinc-400">Share to Citizen Talk or True Witness feed</p>
                    </div>
                </div>
            </div>

            <button id="start-journey" 
                    class="mt-10 w-full bg-green-600 hover:bg-green-500 py-4 rounded-2xl text-white font-semibold">
                I'm Ready — Let's Begin
            </button>
        </div>
    `;

    document.body.appendChild(modal);

    document.getElementById('start-journey').addEventListener('click', () => {
        localStorage.setItem('onboardingComplete', 'true');
        modal.remove();
    });
}

// Auto-run when imported
export function initOnboarding() {
    showLegalNotice();
}
export function initHelpButton() {
    const btn = document.getElementById('help-button');
    if (!btn) return;

    btn.addEventListener('click', showQuickGuide);
}

function showQuickGuide() {
    const guide = document.createElement('div');
    guide.className = 'fixed inset-0 bg-black/90 flex items-center justify-center z-[110]';
    guide.innerHTML = `
        <div class="bg-zinc-900 rounded-3xl max-w-lg p-8 max-h-[90vh] overflow-auto">
            <h2 class="text-3xl font-bold mb-8 text-center">How to Use VocalWitness</h2>
            <!-- Add more helpful sections here -->
            <button onclick="this.closest('.fixed').remove()" 
                    class="w-full py-4 bg-green-600 rounded-2xl">Got it, Thanks!</button>
        </div>
    `;
    document.body.appendChild(guide);
}
