// Sons et musique 100% générés en WebAudio (aucun asset).
const STORAGE_KEY = 'bb_muted';

class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    try { this.muted = localStorage.getItem(STORAGE_KEY) === '1'; } catch (e) { /* ignore */ }
    this.musicOn = false;
    this.intensity = 0;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
  }

  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.55;
        const comp = this.ctx.createDynamicsCompressor();
        this.master.connect(comp);
        comp.connect(this.ctx.destination);
        this.musicBus = this.ctx.createGain();
        this.musicBus.gain.value = 0.5;
        this.musicBus.connect(this.master);
        const len = this.ctx.sampleRate;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state !== 'running') this.ctx.resume();
    } catch (e) { /* audio indisponible */ }
  }

  suspend() { try { if (this.ctx) this.ctx.suspend(); } catch (e) { /* ignore */ } }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem(STORAGE_KEY, m ? '1' : '0'); } catch (e) { /* ignore */ }
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
  }

  tone(freq, dur, { type = 'square', vol = 0.2, to = null, delay = 0, bus = null, lp = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let out = o;
    if (lp) { const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f); out = f; }
    out.connect(g);
    g.connect(bus || this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise(dur, { vol = 0.2, hp = 0, lp = 0, delay = 0, bus = null } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = s;
    if (hp) { const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; node.connect(f); node = f; }
    if (lp) { const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; node.connect(f); node = f; }
    node.connect(g);
    g.connect(bus || this.master);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  // --- Effets ---
  jump() { this.tone(260, 0.14, { type: 'square', to: 620, vol: 0.12 }); }
  land() { this.tone(120, 0.1, { type: 'sine', to: 50, vol: 0.25 }); this.noise(0.06, { vol: 0.08, lp: 900 }); }
  bite(chain) {
    const pent = [0, 2, 4, 7, 9, 12, 14, 16];
    const semi = pent[Math.min(chain - 1, pent.length - 1)];
    const f = 392 * Math.pow(2, semi / 12);
    this.tone(90, 0.16, { type: 'sine', to: 40, vol: 0.4 });
    this.noise(0.09, { vol: 0.2, hp: 1500 });
    this.tone(f, 0.18, { type: 'square', vol: 0.14, delay: 0.02 });
    this.tone(f * 2, 0.22, { type: 'triangle', vol: 0.12, delay: 0.07 });
  }
  hurt() { this.tone(220, 0.3, { type: 'sawtooth', to: 60, vol: 0.22 }); this.noise(0.2, { vol: 0.18, lp: 1800 }); }
  orb() { this.tone(880, 0.07, { type: 'sine', vol: 0.1 }); this.tone(1320, 0.1, { type: 'sine', vol: 0.1, delay: 0.05 }); }
  sizzle() { this.noise(0.12, { vol: 0.05, hp: 3000 }); }
  die() {
    this.noise(0.9, { vol: 0.35, lp: 2500 });
    this.tone(300, 0.9, { type: 'sawtooth', to: 30, vol: 0.25 });
  }
  ui() { this.tone(520, 0.08, { type: 'square', vol: 0.1 }); this.tone(780, 0.1, { type: 'square', vol: 0.1, delay: 0.06 }); }

  // --- Musique procédurale (la, mineur) ---
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.timer = setInterval(() => this.schedule(), 30);
  }
  stopMusic() { this.musicOn = false; clearInterval(this.timer); this.timer = null; }
  setIntensity(i) { this.intensity = i; }

  schedule() {
    if (!this.ctx || this.ctx.state !== 'running') { if (this.ctx) this.nextTime = this.ctx.currentTime + 0.05; return; }
    const spStep = 60 / (118 + 46 * this.intensity) / 2; // croche
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextTime - this.ctx.currentTime);
      this.nextTime += spStep;
      this.step = (this.step + 1) % 32;
    }
  }

  playStep(s, delay) {
    const bus = this.musicBus;
    const bass = [55, 55, 82.4, 55, 65.4, 65.4, 98, 65.4, 73.4, 73.4, 110, 73.4, 49, 49, 73.4, 49];
    const lead = [220, 261.6, 329.6, 392, 329.6, 261.6, 293.7, 261.6];
    const i = s % 16;
    this.tone(bass[i], 0.2, { type: 'triangle', vol: 0.34, delay, bus, lp: 700 });
    if (i % 4 === 0) this.tone(130, 0.14, { type: 'sine', to: 42, vol: 0.5, delay, bus });
    if (i % 8 === 4) this.noise(0.12, { vol: 0.12, hp: 1200, lp: 6000, delay, bus });
    if (s % 2 === 1) this.noise(0.03, { vol: 0.05, hp: 7000, delay, bus });
    if (this.intensity > 0.35 && s % 2 === 0) {
      const n = lead[(s / 2) % lead.length | 0];
      this.tone(n, 0.13, { type: 'square', vol: 0.045 + 0.04 * this.intensity, delay, bus, lp: 2400 });
    }
  }
}

export const sfx = new Sfx();
