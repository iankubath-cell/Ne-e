function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export class SynthEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.delay = null;
    this.feedback = null;
    this.reverb = null;
    this.reverbSend = null;
  }

  async ensureContext() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;

    if (!this.ctx) {
      try {
        this.ctx = new AC({ latencyHint: "interactive" });
      } catch {
        this.ctx = new AC();
      }

      this.master = this.ctx.createGain();
      this.master.gain.value = 0.45; // restored
      this.master.connect(this.ctx.destination);

      this.delay = this.ctx.createDelay(1.0);
      this.delay.delayTime.value = 0.4;

      this.feedback = this.ctx.createGain();
      this.feedback.gain.value = 0.22;

      this.delay.connect(this.master);
      this.delay.connect(this.feedback);
      this.feedback.connect(this.delay);

      // Procedural reverb (kept)
      this.reverb = this.ctx.createConvolver();
      const len = Math.round(this.ctx.sampleRate * 2.5);
      const ir = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) {
          const t = 1 - i / len;
          d[i] = (Math.random() * 2 - 1) * Math.pow(t, 2.8);
        }
      }
      this.reverb.buffer = ir;

      this.reverbSend = this.ctx.createGain();
      this.reverbSend.gain.value = 0;
      this.reverbSend.connect(this.reverb);
      this.reverb.connect(this.master);
    }

    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }

    return this.ctx;
  }

  startVoice(freq, velocity = 1) {
    if (!this.ctx || !this.master) return null;
    if (!Number.isFinite(freq) || freq <= 0) return null;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const vel = clamp(Number.isFinite(velocity) ? velocity : 1, 0, 1.5);

    // Envelope
    const env = ctx.createGain();
    env.gain.cancelScheduledValues(now);
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(0.18 * vel, now + 0.1);

    // Warm voice: 3 oscillators
    const osc1 = ctx.createOscillator(); // sine at freq
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(freq, now);

    const osc2 = ctx.createOscillator(); // sine sub-octave
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(freq * 0.5, now);

    const osc3 = ctx.createOscillator(); // triangle third harmonic
    osc3.type = "triangle";
    osc3.frequency.setValueAtTime(freq * 3, now);

    // Vibrato: LFO -> depth (cents) -> detune of osc1/osc2
    const vibratoLfo = ctx.createOscillator();
    vibratoLfo.type = "sine";
    vibratoLfo.frequency.setValueAtTime(5.5, now);

    const vibratoDepth = ctx.createGain();
    vibratoDepth.gain.setValueAtTime(0, now);
    vibratoDepth.gain.linearRampToValueAtTime(4, now + 0.5); // cents

    vibratoLfo.connect(vibratoDepth);
    vibratoDepth.connect(osc1.detune);
    vibratoDepth.connect(osc2.detune);
    vibratoDepth.connect(osc3.detune);

    // Filter chain: env -> lowpass -> sends
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(600 + freq * 2.5, now);
    filter.Q.setValueAtTime(0.7, now);

    osc1.connect(env);
    osc2.connect(env);
    osc3.connect(env);

    env.connect(filter);
    filter.connect(this.master);
    filter.connect(this.delay);
    if (this.reverbSend) filter.connect(this.reverbSend);

    osc1.start(now);
    osc2.start(now);
    osc3.start(now);
    vibratoLfo.start(now);

    const voice = {
      osc1,
      osc2,
      osc3,
      env,
      freq,
      startTime: now,
      released: false,
      filter,
      vibratoLfo,
      vibratoDepth,
    };

    let endedCount = 0;
    const maybeCleanup = () => {
      endedCount += 1;
      if (endedCount >= 4) {
        try { env.disconnect(); } catch {}
        try { filter.disconnect(); } catch {}
        try { vibratoDepth.disconnect(); } catch {}
      }
    };

    const bindEnded = (node) => {
      node.onended = () => {
        try { node.disconnect(); } catch {}
        maybeCleanup();
      };
    };

    bindEnded(osc1);
    bindEnded(osc2);
    bindEnded(osc3);
    bindEnded(vibratoLfo);

    voice.glideTo = (targetFreq, glideTime = 0.07) => {
      if (voice.released) return;
      const tf = Number.isFinite(targetFreq) && targetFreq > 0 ? targetFreq : voice.freq;
      const tc = Math.max(0.001, glideTime);
      const t = ctx.currentTime;

      voice.osc1.frequency.setTargetAtTime(tf, t, tc);
      voice.osc2.frequency.setTargetAtTime(tf * 0.5, t, tc);
      voice.osc3.frequency.setTargetAtTime(tf * 3, t, tc);
      voice.freq = tf;
    };

    voice.release = () => {
      if (voice.released) return;
      voice.released = true;

      const t = ctx.currentTime;
      voice.env.gain.cancelScheduledValues(t);
      voice.env.gain.setValueAtTime(Math.max(0.0001, voice.env.gain.value), t);
      voice.env.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);

      voice.osc1.stop(t + 1.2);
      voice.osc2.stop(t + 1.2);
      voice.osc3.stop(t + 1.2);
      voice.vibratoLfo.stop(t + 1.2);
    };

    voice.kill = () => {
      if (voice.released) return;
      voice.released = true;

      const t = ctx.currentTime;
      voice.env.gain.cancelScheduledValues(t);
      voice.env.gain.setValueAtTime(Math.max(0.0001, voice.env.gain.value), t);
      voice.env.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);

      voice.osc1.stop(t + 0.06);
      voice.osc2.stop(t + 0.06);
      voice.osc3.stop(t + 0.06);
      voice.vibratoLfo.stop(t + 0.06);
    };

    return voice;
  }

  setVolume(v) {
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(clamp(v, 0, 1), this.ctx.currentTime, 0.05);
  }

  setReverb(amount) {
    if (!this.ctx || !this.reverbSend) return;
    const a = clamp(Number.isFinite(amount) ? amount : 0, 0, 1);
    this.reverbSend.gain.setTargetAtTime(a * 0.35, this.ctx.currentTime, 0.15);
  }

  setDelayDepth(on) {
    if (!this.ctx || !this.feedback || !this.delay) return;
    const t = this.ctx.currentTime;
    if (on) {
      this.feedback.gain.setTargetAtTime(0.45, t, 0.15);
      this.delay.delayTime.setTargetAtTime(0.62, t, 0.15);
    } else {
      this.feedback.gain.setTargetAtTime(0.22, t, 0.15);
      this.delay.delayTime.setTargetAtTime(0.4, t, 0.15);
    }
  }
}