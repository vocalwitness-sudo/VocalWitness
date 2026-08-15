// js/witness-voice.js
import { initFeed } from './feed.js';

export function initWitnessVoice(containerId = 'witnessVoiceContainer') {
  // initFeed already looks for #feedContainer by default.
  // If you have a specific container, make sure the ID matches what initFeed expects
  // or just call it with the channel type.
  initFeed(undefined, 'witness-voice');
}
