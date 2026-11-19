// js/audio-normalize-worker.js
// Runs the heavy sample loop off the main thread

self.onmessage = function (e) {
  const { channelData, sampleRate, gainLinear, fadeSamples } = e.data;

  try {
    const channels = channelData.map(ch => new Float32Array(ch));
    const length = channels[0].length;

    for (let c = 0; c < channels.length; c++) {
      const data = channels[c];
      for (let i = 0; i < length; i++) {
        let s = data[i] * gainLinear;

        // Soft clip
        if (s > 0.95) s = 0.95 + (s - 0.95) * 0.2;
        if (s < -0.95) s = -0.95 + (s + 0.95) * 0.2;
        s = Math.max(-1, Math.min(1, s));

        // Micro fade
        if (i < fadeSamples) s *= i / fadeSamples;
        else if (i > length - fadeSamples) s *= (length - i) / fadeSamples;

        data[i] = s;
      }
    }

    // Transfer back
    const transfer = channels.map(ch => ch.buffer);
    self.postMessage({ ok: true, channels: channels.map(ch => ch.buffer) }, transfer);
  } catch (err) {
    self.postMessage({ ok: false, error: err.message || String(err) });
  }
};
