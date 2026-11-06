// Procedural ambience: wind, crickets, birds and a distant stream.
// No audio assets - everything is synthesised with the WebAudio API.

export class Ambience {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.master = null;
    this.nodes = [];
  }

  async enable() {
    if (this.ctx) {
      await this.ctx.resume();
      this.enabled = true;
      this.master.gain.setTargetAtTime(0.9, this.ctx.currentTime, 0.4);
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);

    this.buildWind();
    this.buildCrickets();
    this.buildStream();
    this.scheduleBird();

    this.enabled = true;
    this.master.gain.setTargetAtTime(0.9, this.ctx.currentTime, 1.2);
  }

  disable() {
    if (!this.ctx) return;
    this.enabled = false;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
  }

  buildWind() {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 420;
    filter.Q.value = 0.7;

    const gain = ctx.createGain();
    gain.gain.value = 0.16;

    // slow gusts
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 260;
    lfo.connect(lfoGain).connect(filter.frequency);
    lfo.start();

    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    this.nodes.push(src, lfo);
    this.windGain = gain;
  }

  buildCrickets() {
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0.0;
    gain.connect(this.master);
    this.cricketGain = gain;

    for (let i = 0; i < 5; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 3800 + Math.random() * 900;
      const g = ctx.createGain();
      g.gain.value = 0;
      // chirp envelope
      const t0 = ctx.currentTime + Math.random() * 2;
      for (let k = 0; k < 40; k++) {
        const t = t0 + k * 0.16 + Math.random() * 0.04;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.02, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
        osc.frequency.setValueAtTime(3800 + Math.random() * 900, t);
      }
      osc.connect(g).connect(gain);
      osc.start(t0);
      osc.stop(t0 + 40);
    }
  }

  buildStream() {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 3;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 5200;
    const gain = ctx.createGain();
    gain.gain.value = 0.05;
    src.connect(hp).connect(lp).connect(gain).connect(this.master);
    src.start();
    this.nodes.push(src);
    this.streamGain = gain;
  }

  scheduleBird() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const notes = 2 + Math.floor(Math.random() * 4);
    const base = 1800 + Math.random() * 1400;
    const t0 = ctx.currentTime + 2 + Math.random() * 6;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(this.master);
    for (let i = 0; i < notes; i++) {
      const t = t0 + i * (0.09 + Math.random() * 0.06);
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(base * (0.9 + Math.random() * 0.25), t);
      osc.frequency.exponentialRampToValueAtTime(base * (1.05 + Math.random() * 0.3), t + 0.05);
      osc.frequency.exponentialRampToValueAtTime(base * 0.85, t + 0.12);
      osc.connect(g);
      osc.start(t);
      osc.stop(t + 0.16);
      g.gain.setValueAtTime(0.035, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    }
    this.birdTimer = setTimeout(() => this.scheduleBird(), 4000 + Math.random() * 9000);
  }

  // Crickets sing at night, birds by day.
  update(hours, nearWater) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const night = hours < 5.5 || hours > 19.5 ? 1 : 0;
    this.cricketGain?.gain.setTargetAtTime(night * 0.9, t, 1.5);
    this.streamGain?.gain.setTargetAtTime(nearWater ? 0.16 : 0.04, t, 1.0);
    this.windGain?.gain.setTargetAtTime(0.1 + (1 - night) * 0.08, t, 1.0);
  }
}
