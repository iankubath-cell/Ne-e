function inside(px, py, r) {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

export class VoidCorners {
  constructor(engine, canvas) {
    this.engine = engine;
    this.canvas = canvas;

    this.zones = ["vibrato", "reverb", "filter", "delay"];
    this.members = new Map(this.zones.map((z) => [z, new Set()]));
    this.pointerZone = new Map(); // pointerId -> zoneId | null
    this.ramps = new Map(this.zones.map((z) => [z, 0]));
  }

  zonesFor(w, h) {
    const side = 0.22 * Math.min(w, h);
    return [
      { id: "vibrato", x: 0, y: 0, w: side, h: side }, // TL
      { id: "reverb", x: w - side, y: 0, w: side, h: side }, // TR
      { id: "filter", x: 0, y: h - side, w: side, h: side }, // BL
      { id: "delay", x: w - side, y: h - side, w: side, h: side }, // BR
    ];
  }

  _hit(x, y, w, h) {
    const zs = this.zonesFor(w, h);
    for (let i = 0; i < zs.length; i++) {
      if (inside(x, y, zs[i])) return zs[i].id;
    }
    return null;
  }

  _activate(zoneId) {
    if (zoneId === "reverb") this.engine?.setReverb?.(1);
    if (zoneId === "delay") this.engine?.setDelayDepth?.(true);
  }

  _deactivate(zoneId) {
    if (zoneId === "reverb") this.engine?.setReverb?.(0);
    if (zoneId === "delay") this.engine?.setDelayDepth?.(false);
  }

  _setMembership(pointerId, nextZone) {
    const prevZone = this.pointerZone.get(pointerId) ?? null;
    if (prevZone === nextZone) return;

    if (prevZone) {
      const prevSet = this.members.get(prevZone);
      const was = prevSet.size;
      prevSet.delete(pointerId);
      if (was > 0 && prevSet.size === 0) this._deactivate(prevZone);
    }

    this.pointerZone.set(pointerId, nextZone);

    if (nextZone) {
      const nextSet = this.members.get(nextZone);
      const was = nextSet.size;
      nextSet.add(pointerId);
      if (was === 0 && nextSet.size === 1) this._activate(nextZone);
    }
  }

  touchStart(id, x, y, w, h) {
    this._setMembership(id, this._hit(x, y, w, h));
  }

  update(id, x, y, w, h) {
    this._setMembership(id, this._hit(x, y, w, h));
  }

  touchEnd(id) {
    this._setMembership(id, null);
    this.pointerZone.delete(id);
  }

  apply(voicesArray) {
    const ctx = this.engine?.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;

    const vibratoOn = this.members.get("vibrato").size > 0;
    const filterOn = this.members.get("filter").size > 0;

    for (let i = 0; i < voicesArray.length; i++) {
      const v = voicesArray[i];
      if (!v || v.released) continue;

      if (v.vibratoDepth?.gain && v.vibratoLfo?.frequency) {
        v.vibratoDepth.gain.setTargetAtTime(vibratoOn ? 30 : 4, now, 0.15);
        v.vibratoLfo.frequency.setTargetAtTime(vibratoOn ? 6.5 : 5.5, now, 0.15);
      }

      if (v.filter?.frequency) {
        const base = Math.max(200, (600 + (v.freq || 0) * 2.5) * 0.4);
        const full = Math.max(200, 600 + (v.freq || 0) * 2.5);
        v.filter.frequency.setTargetAtTime(filterOn ? base : full, now, 0.15);
      }
    }
  }

  render(ctx) {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    const sx = this.canvas.width / (this.canvas.clientWidth || 1);
    const sy = this.canvas.height / (this.canvas.clientHeight || 1);
    const zones = this.zonesFor(w, h);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.scale(sx, sy);

    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      const active = this.members.get(z.id).size > 0;

      const prev = this.ramps.get(z.id) || 0;
      const next = active ? Math.min(1, prev + 0.08) : Math.max(0, prev - 0.08);
      this.ramps.set(z.id, next);
      if (next <= 0) continue;

      const cx = z.id === "vibrato" || z.id === "filter" ? z.x + z.w : z.x;
      const cy = z.id === "vibrato" || z.id === "reverb" ? z.y + z.h : z.y;
      const r = z.w * 0.8;

      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, `rgba(160,140,255,${0.09 * next})`);
      g.addColorStop(1, "rgba(160,140,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  resetAll() {
    for (const z of this.zones) {
      this.members.get(z).clear();
      this.ramps.set(z, 0);
      this._deactivate(z);
    }
    this.pointerZone.clear();
  }
}