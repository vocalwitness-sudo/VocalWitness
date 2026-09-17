// js/audio-normalize.js
/**
 * Offline peak + RMS normalization for VocalWitness recordings.
 * Target: consistent loudness without clipping (peak ≈ -1 dBFS, RMS ≈ -14 dBFS).
 * Pure Web Audio API – no external dependencies.
 */
import { AppState } from './app-state.js';
import { logAuditEvent } from './audit.js';

const TARGET_PEAK_DB = -1.0;   // leave headroom
const TARGET_RMS_DB = -14.0;   // speech-friendly loudness
const MAX_GAIN_DB = 24;
const MIN_GAIN_DB = -24;
const FADE_MS = 8;             // micro fade in/out

/**
 * Decode a recorded Blob → AudioBuffer
 */
async function decodeBlob(blob) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
        throw new Error('Web Audio API is not supported in this environment.');
    }

    const ctx = new AudioCtx();
    try {
        const arrayBuffer = await blob.arrayBuffer();
        // .slice(0) helps with Safari compatibility
        return await ctx.decodeAudioData(arrayBuffer.slice(0));
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
 * Apply gain + soft clip + micro fades in-place
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

            // Soft-knee clip near ±1
            if (s > 0.95) s = 0.95 + (s - 0.95) * 0.2;
            if (s < -0.95) s = -0.95 + (s + 0.95) * 0.2;

            s = Math.max(-1, Math.min(1, s));

            // Micro fade-in / fade-out
            if (i < fadeSamples) {
                s *= i / fadeSamples;
            } else if (i > data.length - fadeSamples) {
                s *= (data.length - i) / fadeSamples;
            }

            data[i] = s;
        }
    }
}

/**
 * Encode AudioBuffer → audio/wav Blob (lossless, widely supported)
 */
function audioBufferToWav(audioBuffer) {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    const dataLength = audioBuffer.length * blockAlign;
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);

    const writeString = (offset, str) => {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    };

    // WAV header
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);          // PCM chunk size
    view.setUint16(20, 1, true);            // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);

    // Interleave samples
    let offset = 44;
    const channels = [];
    for (let c = 0; c < numChannels; c++) {
        channels.push(audioBuffer.getChannelData(c));
    }

    for (let i = 0; i < audioBuffer.length; i++) {
        for (let c = 0; c < numChannels; c++) {
            let sample = Math.max(-1, Math.min(1, channels[c][i]));
            sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
            view.setInt16(offset, sample, true);
            offset += 2;
        }
    }

    return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Main entry point – normalize a recorded Blob according to identity mode.
 *
 * @param {Blob} blob - Raw MediaRecorder output
 * @param {Object} [opts={}]
 * @param {number} [opts.targetPeakDb=-1]
 * @param {number} [opts.targetRmsDb=-14]
 * @param {boolean} [opts.forceNormalize]
 * @returns {Promise<{ blob: Blob, peakDb: number|null, rmsDb: number|null, gainDb: number, skipped: boolean, error?: string }>}
 */
export async function normalizeAudioBlob(blob, opts = {}) {
    if (!blob || blob.size === 0) {
        return {
            blob,
            peakDb: -Infinity,
            rmsDb: -Infinity,
            gainDb: 0,
            skipped: true
        };
    }

    const activeMode = AppState.getIdentityMode?.() || 'ANONYMOUS';
    const userNormPref = AppState.getPref?.('audioNormalize') ?? true;

    // ANONYMOUS → always normalize (reduces acoustic fingerprinting)
    // BOLD_WITNESS → preserve original unless forced
    const shouldNormalize = opts.forceNormalize ?? (activeMode === 'ANONYMOUS' || userNormPref === true);

    if (!shouldNormalize) {
        await logAuditEvent('AUDIO_NORMALIZATION_PRESERVED', {
            size: blob.size,
            mode: activeMode
        });

        return {
            blob,
            peakDb: null,
            rmsDb: null,
            gainDb: 0,
            skipped: true
        };
    }

    const targetPeakDb = opts.targetPeakDb ?? TARGET_PEAK_DB;
    const targetRmsDb = opts.targetRmsDb ?? TARGET_RMS_DB;

    try {
        const audioBuffer = await decodeBlob(blob);
        const { peak, rms } = measureLevels(audioBuffer);

        const peakDb = linearToDb(peak);
        const rmsDb = linearToDb(rms);

        // Near-silence → skip to avoid amplifying noise floor
        if (peak < 0.001) {
            await logAuditEvent('AUDIO_NORMALIZATION_SKIPPED_SILENCE', {
                peakDb,
                mode: activeMode
            });

            return {
                blob,
                peakDb,
                rmsDb,
                gainDb: 0,
                skipped: true
            };
        }

        // Hybrid gain calculation (peak priority + RMS contribution)
        let gainDb = targetPeakDb - peakDb;
        const rmsGainDb = targetRmsDb - rmsDb;
        gainDb = gainDb * 0.7 + rmsGainDb * 0.3;
        gainDb = Math.max(MIN_GAIN_DB, Math.min(MAX_GAIN_DB, gainDb));

        const gainLinear = dbToLinear(gainDb);
        applyGain(audioBuffer, gainLinear);

        const outBlob = audioBufferToWav(audioBuffer);

        await logAuditEvent('AUDIO_NORMALIZATION_COMPLETED', {
            mode: activeMode,
            appliedGainDb: Math.round(gainDb * 100) / 100,
            outputType: outBlob.type,
            originalSize: blob.size,
            outputSize: outBlob.size
        });

        return {
            blob: outBlob,
            peakDb: peakDb + gainDb,
            rmsDb: rmsDb + gainDb,
            gainDb,
            skipped: false
        };

    } catch (err) {
        console.warn('[audio-normalize] Normalization failed, returning original:', err);

        await logAuditEvent('AUDIO_NORMALIZATION_FAILED', {
            error: err.message,
            mode: activeMode
        });

        return {
            blob,
            peakDb: null,
            rmsDb: null,
            gainDb: 0,
            skipped: true,
            error: err.message
        };
    }
}
