// js/witness-voice.js
import { renderFeed } from './feed.js';

export function initWitnessVoice(containerId = 'witnessVoiceContainer') {
  const container = document.getElementById(containerId);
  if (container) {
    renderFeed('witness-voice', container);
  } else {
    renderFeed('witness-voice');
  }
}
