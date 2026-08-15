// js/witness-voice.js
import { initFeed } from './feed.js';

/**
 * Initializes the Witness Voice feed channel.
 * Uses the shared feed engine with channelType = 'witness-voice'.
 */
export async function initWitnessVoice() {
  try {
    await initFeed(undefined, 'witness-voice');
    console.log('✅ Witness Voice feed initialized');
  } catch (err) {
    console.error('Failed to initialize Witness Voice feed:', err);
  }
}
