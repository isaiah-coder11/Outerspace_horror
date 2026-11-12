// ─────────────────────────────────────────────────────────────
// Procedural audio. No sample files: everything is synthesized.
// The context is only created after a user gesture so browsers
// allow playback.
// ─────────────────────────────────────────────────────────────

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noise = null;
    this.drone = [];
    this.nightGain = null;
    this.nightNodes = [];
    this._stepTimer = 0;
    this._enabled = true;
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  async start() {
    if (!this._enabled) return;
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        try { await this.ctx.resume(); } catch (_) {}
      }
      return;
    }

    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) {
      this._enabled = false;
      return;
    }

    try {
      this.ctx = new AC();
      await this.ctx.resume();
    } catch (_) {
      this.ctx = null;
      this._enabled = false;
      return;
    }

    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.setValueAtTime(0.0001, ctx.currentTime);
    this.master.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 2.5);
    this.master.connect(ctx.destination);

    this.noise = this._makeNoise(3);
    this._buildDrone();
    this._buildWind();
    this._buildNightLayer();
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  _makeNoise(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.022 * white) / 1.022;
      data[i] = last * 3.2;
    }
    return buffer;
  }

  _buildDrone() {
    const ctx = this.ctx;
    const freqs = [40.4, 40.9, 80.8, 121.2];
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = i > 2 ? 'triangle' : 'sine';
      osc.frequency.value = freq;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 190;
      filter.Q.value = 1.2;

      const gain = ctx.createGain();
      gain.gain.value = i === 2 ? 0.032 : i === 3 ? 0.01 : 0.085;

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);

      // Slow amplitude breathing.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.035 + i * 0.017;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = i === 0 ? 0.028 : 0.012;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);

      osc.start();
      lfo.start();
      this.drone.push(osc, lfo);
    });
  }

  _buildWind() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    filter.Q.value = 0.8;

    const gain = ctx.createGain();
    gain.gain.value = 0.05;

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start();

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 130;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    this.wind = { src, gain, filter, lfo };
  }

  _buildNightLayer() {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    gain.connect(this.master);
    this.nightGain = gain;

    // A high, thin whine that only exists at night.
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 1187;
    const oscGain = ctx.createGain();
    oscGain.gain.value = 0.008;
    osc.connect(oscGain);
    oscGain.connect(gain);
    osc.start();

    // A breathy band of noise.
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 640;
    band.Q.value = 3.5;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.09;
    src.connect(band);
    band.connect(noiseGain);
    noiseGain.connect(gain);
    src.start();

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 260;
    lfo.connect(lfoGain);
    lfoGain.connect(band.frequency);
    lfo.start();

    this.nightNodes.push(osc, src, lfo);
  }

  setNight(on) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const target = on ? 0.5 : 0.0001;
    this.nightGain.gain.cancelScheduledValues(now);
    this.nightGain.gain.setValueAtTime(Math.max(this.nightGain.gain.value, 0.0001), now);
    this.nightGain.gain.exponentialRampToValueAtTime(target, now + (on ? 2.5 : 3.5));
  }

  _envGain(value, attack, release, when = 0) {
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(value, 0.00011), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
    return { gain: g, start: t, end: t + attack + release + 0.05 };
  }

  whisper() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.playbackRate.value = 0.7 + Math.random() * 0.7;

    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 620 + Math.random() * 1700;
    band.Q.value = 7 + Math.random() * 6;

    const g = ctx.createGain();
    g.gain.value = 0.0001;

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 4.5 + Math.random() * 7;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.05;
    lfo.connect(lfoGain);
    lfoGain.connect(g.gain);

    src.connect(band);
    band.connect(g);
    g.connect(this.master);

    const dur = 1.6 + Math.random() * 1.6;
    g.gain.linearRampToValueAtTime(0.12, t + 0.35);
    g.gain.linearRampToValueAtTime(0.04, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.start(t);
    lfo.start(t);
    src.stop(t + dur + 0.1);
    lfo.stop(t + dur + 0.1);
  }

  // Small feet crossing a grate: a scatter of high, dry ticks that fade as
  // the thing moves away. Pan is -1 (left) to 1 (right).
  scurry(pan = 0, volume = 0.05) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const start = ctx.currentTime + 0.02;

    let dest = this.master;
    if (ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      panner.connect(this.master);
      dest = panner;
    }

    const steps = 5 + Math.floor(Math.random() * 5);
    for (let i = 0; i < steps; i += 1) {
      const t = start + i * (0.045 + Math.random() * 0.05);
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.playbackRate.value = 0.8 + Math.random() * 0.9;

      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1600 + Math.random() * 1800;

      const g = ctx.createGain();
      const fade = 1 - i / (steps * 1.5);
      const peak = Math.max(0.0002, volume * (0.5 + Math.random() * 0.7) * fade);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05 + Math.random() * 0.04);

      src.connect(hp);
      hp.connect(g);
      g.connect(dest);
      src.start(t);
      src.stop(t + 0.14);
    }
  }

  creak() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.setValueAtTime(320 + Math.random() * 400, t);
    band.frequency.exponentialRampToValueAtTime(110, t + 0.9);
    band.Q.value = 9;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);

    src.connect(band);
    band.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + 1.2);
  }

  clunk() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(105, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.22);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.55);

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.07, t + 0.008);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    src.connect(hp);
    hp.connect(ng);
    ng.connect(this.master);
    src.start(t);
    src.stop(t + 0.2);
  }

  step() {
    if (!this.ready) return;
    const now = this.ctx.currentTime;
    if (now - this._stepTimer < 0.4) return;
    this._stepTimer = now;

    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 190 + Math.random() * 60;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.028, now + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
    src.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    src.start(now);
    src.stop(now + 0.16);
  }

  beep(freq = 520, dur = 0.1, type = 'square', vol = 0.045) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  // Two-tone klaxon. The pod wakes up to this, and the first shift keeps
  // hearing it while the ship is still in red alert.
  siren(times = 2) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const start = ctx.currentTime + 0.02;

    for (let i = 0; i < times * 2; i += 1) {
      const t = start + i * 0.62;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1500;

      const g = ctx.createGain();
      const high = i % 2 === 0;
      osc.frequency.setValueAtTime(high ? 440 : 660, t);
      osc.frequency.linearRampToValueAtTime(high ? 660 : 440, t + 0.52);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.13, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.58);

      osc.connect(lp);
      lp.connect(g);
      g.connect(this.master);
      osc.start(t);
      osc.stop(t + 0.62);
    }
  }

  success() {
    if (!this.ready) return;
    this.beep(440, 0.12, 'sine', 0.06);
    this.beep(660, 0.12, 'sine', 0.055);
    window.setTimeout(() => this.beep(880, 0.34, 'sine', 0.05), 130);
    window.setTimeout(() => this.beep(1320, 0.5, 'sine', 0.022), 220);
  }

  deny() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(62, t + 0.32);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.075, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    osc.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.45);
  }

  heartbeat(intensity = 1) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const thump = (when, vol) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(66, when);
      osc.frequency.exponentialRampToValueAtTime(34, when + 0.18);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(vol, when + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.26);
      osc.connect(g);
      g.connect(this.master);
      osc.start(when);
      osc.stop(when + 0.3);
    };
    thump(t, 0.10 * intensity);
    thump(t + 0.24, 0.065 * intensity);
  }

  screech() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;

    // Two detuned saws shrieking down through a moving vowel band, plus a
    // noise rasp on top: a short attack and a long, ragged tail.
    [0, 1, 2].forEach((index) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      const base = index === 0 ? 3120 : index === 1 ? 4180 : 5480;
      osc.frequency.setValueAtTime(base, t);
      osc.frequency.exponentialRampToValueAtTime(base * 0.44, t + 0.55);
      osc.frequency.exponentialRampToValueAtTime(base * 0.19, t + 1.55);

      const formant = ctx.createBiquadFilter();
      formant.type = 'bandpass';
      formant.frequency.setValueAtTime(5200, t);
      formant.frequency.exponentialRampToValueAtTime(2400, t + 0.9);
      formant.frequency.exponentialRampToValueAtTime(1100, t + 1.4);
      formant.Q.value = 8;

      // A fast flutter on top of a slow warp, so the note never holds a
      // pitch for more than a moment.
      const vibrato = ctx.createOscillator();
      vibrato.frequency.value = 31 + index * 9;
      const vibratoGain = ctx.createGain();
      vibratoGain.gain.value = 260 + index * 60;
      vibrato.connect(vibratoGain);
      vibratoGain.connect(osc.frequency);

      const warp = ctx.createOscillator();
      warp.frequency.value = 1.6 + index * 0.7;
      const warpGain = ctx.createGain();
      warpGain.gain.value = 120 + index * 40;
      warp.connect(warpGain);
      warpGain.connect(osc.frequency);
      warp.start(t);
      warp.stop(t + 1.7);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.09, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.05, t + 0.7);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);

      osc.connect(formant);
      formant.connect(gain);
      gain.connect(this.master);
      osc.start(t);
      vibrato.start(t);
      osc.stop(t + 1.7);
      vibrato.stop(t + 1.7);
    });

    const rasp = ctx.createBufferSource();
    rasp.buffer = this.noise;
    rasp.playbackRate.setValueAtTime(1.6, t);
    rasp.playbackRate.exponentialRampToValueAtTime(0.85, t + 1.2);

    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.setValueAtTime(6400, t);
    band.frequency.exponentialRampToValueAtTime(2100, t + 1.1);
    band.Q.value = 1.8;

    const raspGain = ctx.createGain();
    raspGain.gain.setValueAtTime(0.0001, t);
    raspGain.gain.exponentialRampToValueAtTime(0.08, t + 0.02);
    raspGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);

    // a tremolo splits the rasp into a stuttered, warped scream
    const trem = ctx.createGain();
    trem.gain.value = 0.55;
    const tremLfo = ctx.createOscillator();
    tremLfo.frequency.value = 29;
    const tremDepth = ctx.createGain();
    tremDepth.gain.value = 0.4;
    tremLfo.connect(tremDepth);
    tremDepth.connect(trem.gain);

    rasp.connect(band);
    band.connect(trem);
    trem.connect(raspGain);
    raspGain.connect(this.master);
    rasp.start(t);
    tremLfo.start(t);
    rasp.stop(t + 1.3);
    tremLfo.stop(t + 1.3);
  }

  // A wet inhale and a slower exhale: something breathing behind the
  // vent slats, close enough to fog the visor.
  breathe(intensity = 1) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.playbackRate.value = 0.5 + Math.random() * 0.22;

    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.setValueAtTime(230, t);
    band.frequency.exponentialRampToValueAtTime(880, t + 0.85);
    band.frequency.exponentialRampToValueAtTime(170, t + 2);
    band.Q.value = 1.35;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.14 * intensity, t + 0.7);
    g.gain.exponentialRampToValueAtTime(0.045 * intensity, t + 1.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.1);

    src.connect(band);
    band.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + 2.2);
  }

  nightSting() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(28, t + 4.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 5);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 5.2);
    this.whisper();
  }

  powerDown() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(260, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 1.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + 1.9);
  }
}
