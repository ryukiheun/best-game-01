// Sound, synthesized live with WebAudio: no audio files, nothing to load.
// Everything is a short oscillator or noise burst through a gain envelope.
// Audio starts only after a user gesture (the start click or key), as browsers require.

export function createAudio() {
  let context = null;
  let master = null;
  let muted = false;
  let noiseBuffer = null;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return true;
    }
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.32;
      master.connect(context.destination);
      const length = Math.floor(context.sampleRate * 0.5);
      noiseBuffer = context.createBuffer(1, length, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!context || muted) return;
    const now = context.currentTime;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now + dur);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  function noise(dur, vol, lowpass) {
    if (!context || muted) return;
    const now = context.currentTime;
    const src = context.createBufferSource();
    src.buffer = noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const gain = context.createGain();
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(now);
    src.stop(now + dur + 0.02);
  }

  let shootAlt = false;
  return {
    /** Call from the start gesture so later sounds are allowed. */
    unlock() {
      ensure();
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    get muted() {
      return muted;
    },
    shoot() {
      shootAlt = !shootAlt;
      tone(shootAlt ? 660 : 590, 0.07, 'square', 0.10, 320);
    },
    explosion(big) {
      noise(big ? 0.5 : 0.25, big ? 0.5 : 0.28, big ? 900 : 1600);
      tone(big ? 120 : 180, big ? 0.4 : 0.18, 'sawtooth', 0.16, 40);
    },
    shard() {
      tone(1180, 0.09, 'sine', 0.12, 1760);
    },
    hit() {
      noise(0.3, 0.4, 700);
      tone(220, 0.25, 'sawtooth', 0.2, 60);
    },
    nova() {
      noise(0.8, 0.5, 500);
      tone(90, 0.7, 'sine', 0.4, 30);
    },
    waveClear() {
      tone(523, 0.12, 'triangle', 0.18);
      setTimeout(() => tone(659, 0.12, 'triangle', 0.18), 110);
      setTimeout(() => tone(784, 0.22, 'triangle', 0.2), 220);
    },
    pickup() {
      tone(880, 0.1, 'sine', 0.14, 1320);
      setTimeout(() => tone(1174, 0.14, 'sine', 0.12), 90);
    },
    victory() {
      [523, 659, 784, 1046].forEach((freq, i) => {
        setTimeout(() => tone(freq, 0.3, 'triangle', 0.2), i * 160);
      });
    },
    gameOver() {
      [392, 330, 262, 196].forEach((freq, i) => {
        setTimeout(() => tone(freq, 0.35, 'triangle', 0.18), i * 200);
      });
    },
  };
}
