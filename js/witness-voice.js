// js/witness-voice.js
import { renderFeed } from './feed.js';

export function initWitnessVoice() {
  console.log('Witness Voice feed initialized.');
  // Initialize feed for Witness Voice
  renderFeed('witness-voice');
}

// Auto-run if loaded as entry script
initWitnessVoice();
