function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export class SynthEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.delay = null;
    this.feedback = null;
  }

  async ensureContext() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;

    if (!this.ctx) {
      this.ctx = new AC();

      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);

      this.delay = this.ctx.createDelay(1.0);
      this.delay.delayTime.value = 0.4;

      this.feedback = this.ctx.createGain();
      this.feedback.gain.value = 0.22;

      this.delay.connect(this.master);
      this.delay.connect(this.feedback);
      this.feedback.connect(this.delay);
    }

    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }

    return this.ctx;
  }

  noteOn(freq, velocity = 1) {
    if (!this.ctx || !this.master) return null;
    if (!Number.isFinite(freq) || freq <= 0) return null;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const vel = clamp(Number.isFinite(velocity) ? velocity : 1, 0, 1.5);

    const env = ctx.createGain();
    env.gain.cancelScheduledValues(now);
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(0.25 * vel, now + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, now + 2.5);

    const osc1 = ctx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(freq, now);

    const osc2 = ctx.createOscillator();
    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(freq * 2, now);
    osc2.detune.setValueAtTime(4, now);

    osc1.connect(env);
    osc2.connect(env);
    env.connect(this.master);
    env.connect(this.delay);

    const stopTime = now + 3.0;
    let ended = 0;
    const cleanup = (osc) => () => {
      try {
        osc.disconnect();
      } catch {}
      ended++;
      if (ended >= 2) {
        try {
          env.disconnect();
        } catch {}
      }
    };

    osc1.onended = cleanup(osc1);
    osc2.onended = cleanup(osc2);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(stopTime);
    osc2.stop(stopTime);

    return { osc1, osc2, env, startedAt: now, stopAt: stopTime, freq };
  }

  // PART A: sustained voice API
  startVoice(freq, velocity = 1) {
    if (!this.ctx || !this.master) return null;
    if (!Number.isFinite(freq) || freq <= 0) return null;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const vel = clamp(Number.isFinite(velocity) ? velocity : 1, 0, 1.5);

    const env = ctx.createGain();
    env.gain.cancelScheduledValues(now);
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(0.14 * vel, now + 0.1); // hold after attack

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1200, now);
    filter.Q.setValueAtTime(0.7, now);

    const osc1 = ctx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(freq, now);

    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(freq * 0.5, now);

    const vibratoLfo = ctx.createOscillator();
    vibratoLfo.type = "sine";
    vibratoLfo.frequency.setValueAtTime(5.5, now);

    const vibratoDepth = ctx.createGain();
    vibratoDepth.gain.setValueAtTime(0, now);
    vibratoDepth.gain.linearRampToValueAtTime(4, now + 0.5);

    vibratoLfo.connect(vibratoDepth);
    vibratoDepth.connect(osc1.detune);
    vibratoDepth.connect(osc2.detune);
    vibratoLfo.start(now);

    osc1.connect(env);
    osc2.connect(env);
    env.connect(filter);
    filter.connect(this.master);
    filter.connect(this.delay);

    osc1.start(now);
    osc2.start(now);

    const voice = {
      osc1,
      osc2,
      env,
      filter,
      vibratoLfo,
      vibratoDepth,
      freq,
      startTime: now,
      released: false,
    };

    let ended = 0;
    const cleanup = (osc) => () => {
      try {
        osc.disconnect();
      } catch {}
      ended++;
      if (ended >= 2) {
        try {
          env.disconnect();
          filter.disconnect();
        } catch {}
      }
    };
    osc1.onended = cleanup(osc1);
    osc2.onended = cleanup(osc2);

    voice.glideTo = (targetFreq, glideTime = 0.07) => {
      if (voice.released) return;
      const tf = Number.isFinite(targetFreq) && targetFreq > 0 ? targetFreq : voice.freq;
      const tc = Math.max(0.001, glideTime);
      const t = ctx.currentTime;

      voice.osc1.frequency.setTargetAtTime(tf, t, tc);
      voice.osc2.frequency.setTargetAtTime(tf * 0.5, t, tc);
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
      voice.vibratoLfo.stop(t + 0.06);
    };

    return voice;
  }

  setVolume(v) {
    if (!this.master || !this.ctx) return;
    const vol = clamp(Number.isFinite(v) ? v : 0.5, 0, 1);
    this.master.gain.setValueAtTime(vol, this.ctx.currentTime);
  }
}