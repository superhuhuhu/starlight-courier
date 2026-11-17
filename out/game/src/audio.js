// Every sound in the game is synthesized with WebAudio: no audio files, no network. A
// small SoundBank owns one AudioContext, a master gain (muted with M or the HUD button) and
// a quiet generative music loop of pentatonic plucks. All calls are safe before the first
// user gesture: the context simply starts on the first one.
import { makeRng } from './random.js';

const MUSIC_NOTES = [220.0, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25];

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.musicTimer = null;
    this.musicStep = 0;
    this.musicRng = makeRng(20261117);
    this.thrustNodes = null;
  }

  // Call from the first pointer or key gesture. Creates the context and starts the music.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      this.startMusic();
    } catch {
      this.ctx = null;
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  // A short oscillator blip: frequency, seconds, waveform, gain.
  blip(freq, seconds, type = 'sine', gain = 0.2, slideTo = null) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + seconds);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + seconds + 0.02);
  }

  // Filtered noise burst: the raw material for launches, crashes and thrust.
  noise(seconds, filterFreq, gain = 0.3, slideTo = null) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const length = Math.max(1, Math.floor(this.ctx.sampleRate * seconds));
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(filterFreq, t);
    if (slideTo) filter.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + seconds);
    filter.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + seconds + 0.02);
  }

  click() {
    this.blip(880, 0.06, 'square', 0.08);
  }

  launch() {
    this.noise(0.45, 500, 0.28, 3200);
    this.blip(160, 0.4, 'sawtooth', 0.1, 520);
  }

  pickup() {
    this.blip(660, 0.09, 'sine', 0.18);
    setTimeout(() => this.blip(990, 0.14, 'sine', 0.18), 70);
  }

  land() {
    this.blip(180, 0.25, 'sine', 0.3, 90);
    this.blip(523.25, 0.12, 'sine', 0.15);
    setTimeout(() => this.blip(659.25, 0.16, 'sine', 0.15), 90);
  }

  crash() {
    this.noise(0.5, 900, 0.4, 120);
    this.blip(120, 0.5, 'sine', 0.35, 40);
  }

  win() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      setTimeout(() => this.blip(f, 0.22, 'triangle', 0.18), i * 110);
    });
  }

  lose() {
    [392.0, 329.63, 261.63].forEach((f, i) => {
      setTimeout(() => this.blip(f, 0.25, 'triangle', 0.15), i * 140);
    });
  }

  // A looping thrust hiss while the player holds the thruster; stop with stopThrust().
  startThrust() {
    if (!this.ctx || this.muted || this.thrustNodes) return;
    const t = this.ctx.currentTime;
    const length = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.08);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t);
    this.thrustNodes = { src, g };
  }

  stopThrust() {
    if (!this.thrustNodes) return;
    const { src, g } = this.thrustNodes;
    this.thrustNodes = null;
    try {
      g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.08);
      src.stop(this.ctx.currentTime + 0.12);
    } catch {
      // The context may already be gone; silence is fine.
    }
  }

  // A slow music-box loop: one soft pentatonic pluck every half second, mostly quiet,
  // so it stays behind the game instead of competing with it.
  startMusic() {
    if (this.musicTimer || !this.ctx) return;
    this.musicTimer = setInterval(() => {
      if (this.muted || document.hidden) return;
      const step = this.musicStep++;
      if (step % 2 !== 0) return;
      const note = MUSIC_NOTES[Math.floor(this.musicRng() * MUSIC_NOTES.length)];
      this.blip(note, 0.9, 'sine', 0.045);
      if (step % 8 === 0) this.blip(note / 2, 1.4, 'triangle', 0.03);
    }, 500);
  }
}
