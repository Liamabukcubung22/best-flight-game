// Nusantara Sky Courier — synthesised sound, no audio files.
// One job: engine hum, wind, ring chimes and landing thuds from WebAudio.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.windGain = null;
    this.muted = false;
    this.started = false;
  }

  ensure() {
    if (this.started) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      // Engine: two detuned saws through a low-pass filter.
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      const osc2 = this.ctx.createOscillator();
      osc2.type = 'sawtooth';
      osc2.frequency.value = 82.5;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(filter);
      osc2.connect(filter);
      filter.connect(this.engineGain);
      this.engineGain.connect(this.ctx.destination);
      this.engineOsc.start();
      osc2.start();
      this.engineOsc2 = osc2;
      // Wind: looped noise buffer through a band-pass filter.
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 700;
      bp.Q.value = 0.6;
      this.windGain = this.ctx.createGain();
      this.windGain.gain.value = 0;
      src.connect(bp);
      bp.connect(this.windGain);
      this.windGain.connect(this.ctx.destination);
      src.start();
      this.started = true;
    } catch (err) {
      this.started = false;
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.engineGain) this.engineGain.gain.value = 0;
    if (this.windGain) this.windGain.gain.value = 0;
  }

  // Called every frame while flying.
  update(throttle, speed, flying) {
    if (!this.started || this.muted) return;
    const t = this.ctx.currentTime;
    const target = flying || throttle > 0.05 ? 0.02 + throttle * 0.05 : 0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.15);
    this.engineOsc.frequency.setTargetAtTime(48 + throttle * 70 + speed * 0.25, t, 0.1);
    if (this.engineOsc2) {
      this.engineOsc2.frequency.setTargetAtTime(72 + throttle * 105 + speed * 0.4, t, 0.1);
    }
    this.windGain.gain.setTargetAtTime(Math.min(0.09, speed * 0.0011), t, 0.2);
  }

  blip(freq, dur, type, vol) {
    if (!this.started || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  ringChime() {
    this.blip(880, 0.35, 'sine', 0.16);
    setTimeout(() => this.blip(1318, 0.4, 'sine', 0.12), 90);
  }

  thud() {
    this.blip(70, 0.3, 'triangle', 0.25);
  }

  alarm() {
    this.blip(440, 0.15, 'square', 0.07);
    setTimeout(() => this.blip(330, 0.15, 'square', 0.07), 160);
  }
}
