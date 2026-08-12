/**
 * js/audio-normalize.js
 * Offline peak + RMS normalization for VocalWitness recordings.
 * Target: consistent loudness without clipping (peak ≈ -1 dBFS, RMS ≈ -14 dBFS).
 * Pure Web Audio API – no external deps.
 */

const TARGET_PEAK_DB  = -1.0;   // leave a little headroom
const TARGET_RMS_DB   = -14.0;  // speech-friendly loudness
const MAX_GAIN_DB     = 24;     // prevent extreme boost of silence
const MIN_GAIN_DB     = -24;
const FADE_MS         = 8;      // tiny fade in/out to avoid clicks

/**
 * Decode a recorded Blob → AudioBuffer
 */
async function decodeBlob(blob) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  try {
    const ab = await blob.arrayBuffer();
    return await ctx.decodeAudioData(ab.slice(0)); // slice for Safari
  } finally {
    await ctx.close().catch(() => {});
  }
}

/**
 * Measure peak (max abs) and RMS across all channels
 */
function measureLevels(audioBuffer) {
  let peak = 0;
  let sumSquares = 0;
  let totalSamples = 0;

  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > peak) peak = abs;
      sumSquares += data[i] * data[i];
      totalSamples++;
    }
  }

  const rms = totalSamples > 0 ? Math.sqrt(sumSquares / totalSamples) : 0;
  return { peak, rms };
}

function linearToDb(linear) {
  if (linear <= 0) return -Infinity;
  return 20 * Math.log10(linear);
}

function dbToLinear(db) {
  return Math.pow(10, db / 20);
}

/**
 * Apply gain + soft clip + micro fades in-place on AudioBuffer
 */
function applyGain(audioBuffer, gainLinear) {
  const fadeSamples = Math.min(
    Math.floor((FADE_MS / 1000) * audioBuffer.sampleRate),
    Math.floor(audioBuffer.length / 4)
  );

  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      let s = data[i] * gainLinear;

      // Soft knee clip near ±1
      if (s > 0.95) s = 0.95 + (s - 0.95) * 0.2;
      if (s < -0.95) s = -0.95 + (s + 0.95) * 0.2;
      s = Math.max(-1, Math.min(1, s));

      // Fade in / out
      if (i < fadeSamples) s *= i / fadeSamples;
      else if (i > data.length - fadeSamples) {
        s *= (data.length - i) / fadeSamples;
      }

      data[i] = s;
    }
  }
}

/**
 * Encode AudioBuffer → audio/wav Blob (widely supported, lossless for forensics)
 * For smaller size you can later re-encode to Opus via MediaRecorder if needed.
 */
function audioBufferToWav(audioBuffer) {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  const length = audioBuffer.length * numChannels * (bitDepth / 8);
  const buffer = new ArrayBuffer(44 + length);
  const view = new DataView(buffer);

  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + length, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
  view.setUint16(32, numChannels * (bitDepth / 8), true);
  view.setUint16(34, bitDepth, true);
  writeStr(36, 'data');
  view.setUint32(40, length, true);

  // Interleave
  let offset = 44;
  const channels = [];
  for (let c = 0; c < numChannels; c++) channels.push(audioBuffer.getChannelData(c));

  for (let i = 0; i < audioBuffer.length; i++) {
    for (let c = 0; c < numChannels; c++) {
      let sample = Math.max(-1, Math.min(1, channels[c][i]));
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, sample, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Main entry: normalize a recorded Blob.
 * @param {Blob} blob - raw MediaRecorder output
 * @param {Object} opts
 * @param {number} [opts.targetPeakDb=-1]
 * @param {number} [opts.targetRmsDb=-14]
 * @returns {Promise<{ blob: Blob, peakDb: number, rmsDb: number, gainDb: number, skipped: boolean }>}
 */
export async function normalizeAudioBlob(blob, opts = {}) {
  if (!blob || blob.size === 0) {
    return { blob, peakDb: -Infinity, rmsDb: -Infinity, gainDb: 0, skipped: true };
  }

  const targetPeakDb = opts.targetPeakDb ?? TARGET_PEAK_DB;
  const targetRmsDb  = opts.targetRmsDb  ?? TARGET_RMS_DB;

  try {
    const audioBuffer = await decodeBlob(blob);
    const { peak, rms } = measureLevels(audioBuffer);

    const peakDb = linearToDb(peak);
    const rmsDb  = linearToDb(rms);

    // Near-silence → skip boost
    if (peak < 0.001) {
      return { blob, peakDb, rmsDb, gainDb: 0, skipped: true };
    }

    // Prefer peak-limited gain; also consider RMS target
    let gainDb = targetPeakDb - peakDb;
    const rmsGainDb = targetRmsDb - rmsDb;
    // Blend: mostly peak, slight pull toward RMS for quieter speech
    gainDb = gainDb * 0.7 + rmsGainDb * 0.3;
    gainDb = Math.max(MIN_GAIN_DB, Math.min(MAX_GAIN_DB, gainDb));

    const gainLinear = dbToLinear(gainDb);
    applyGain(audioBuffer, gainLinear);

    const outBlob = audioBufferToWav(audioBuffer);

    return {
      blob: outBlob,
      peakDb: peakDb + gainDb,
      rmsDb: rmsDb + gainDb,
      gainDb,
      skipped: false
    };
  } catch (err) {
    console.warn('[audio-normalize] Failed, returning original blob:', err);
    return { blob, peakDb: null, rmsDb: null, gainDb: 0, skipped: true, error: err.message };
  }
}
