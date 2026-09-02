export class CornerFX {
  constructor(fluid, canvas) {
    this.fluid = fluid;
    this.canvas = canvas;
    this.trail = [];
    this.pointers = new Map();
    this.zones = new Map();
    this.dust = Array.from({ length: 40 }, () => this._dust(true));
    this.ramps = { vibrato: 0, reverb: 0, filter: 0, delay: 0 };
  }

  _dust(initial = false) {
    const w = this.canvas.clientWidth || 1;
    return { x: Math.random() * w, y: initial ? Math.random() * (this.canvas.clientHeight || 1) : -Math.random() * 20, speed: 10 + Math.random() * 15, size: 1 + Math.random() };
  }

  modifierDown(pointerId, zoneId, x, y) {
    this.pointers.set(pointerId, { x, y, color: "rgba(200,180,255,0.8)" });
    this.zones.set(pointerId, zoneId);
  }

  _zoneAt(x, y) {
    const side = 0.22 * Math.min(this.canvas.clientWidth || 1, this.canvas.clientHeight || 1);
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    if (x <= side && y <= side) return "vibrato";
    if (x >= w - side && y <= side) return "reverb";
    if (x <= side && y >= h - side) return "filter";
    if (x >= w - side && y >= h - side) return "delay";
    return null;
  }

  modifierMove(pointerId, x, y) {
    const pointer = this.pointers.get(pointerId);
    if (pointer) {
      pointer.x = x; pointer.y = y;
      this.zones.set(pointerId, this._zoneAt(x, y));
    }
  }

  modifierUp(pointerId) {
    this.pointers.delete(pointerId);
    this.zones.delete(pointerId);
  }

  playerMove(x, y, color) {
    const t = performance.now();
    this.trail.push({ x, y, color, t });
    if (this.trail.length > 60) this.trail.shift();
  }

  _active(zone) {
    for (const value of this.zones.values()) if (value === zone) return true;
    return false;
  }

  _color(color, alpha) {
  if (Array.isArray(color)) {
    return `rgba(${color.map(v => Math.round(v * 255)).join(",")},${alpha})`;
  }
  const values = String(color).match(/[\d.]+/g) || [200, 180, 255];
  return `rgba(${values.slice(0, 3).join(",")},${alpha})`;
 }

  render(ctx, dtMs) {
    const now = performance.now();
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    const sx = this.canvas.width / w;
    const sy = this.canvas.height / h;
    for (const zone of Object.keys(this.ramps)) {
      const active = this._active(zone);
      this.ramps[zone] += active ? 0.08 : -0.08;
      this.ramps[zone] = Math.max(0, Math.min(1, this.ramps[zone]));
    }
    for (const particle of this.dust) {
      particle.y += particle.speed * dtMs / 1000;
      if (particle.y > h) Object.assign(particle, this._dust());
    }

    ctx.save();
    ctx.scale(sx, sy);
    if (this.ramps.vibrato > 0) {
      ctx.globalCompositeOperation = "lighter";
      ctx.lineWidth = 1.5;
      for (const [pointerId, pointer] of this.pointers) if (this.zones.get(pointerId) === "vibrato") {
        for (let n = 0; n < 6; n++) {
          const angle = Math.random() * Math.PI * 2;
          const length = 20 + Math.random() * 40;
          const ex = pointer.x + Math.cos(angle) * length;
          const ey = pointer.y + Math.sin(angle) * length;
          ctx.strokeStyle = `rgba(200,180,255,${0.15 + Math.random() * 0.35})`;
          ctx.beginPath(); ctx.moveTo(pointer.x, pointer.y);
          ctx.lineTo(pointer.x + Math.cos(angle) * length * 0.45 + (Math.random() - 0.5) * 5, pointer.y + Math.sin(angle) * length * 0.45 + (Math.random() - 0.5) * 5);
          ctx.lineTo(ex, ey); ctx.stroke();
          if (n < 3) this.fluid.addForce(ex, ey, Math.cos(angle) * 2, Math.sin(angle) * 2, 0.6, "rgba(200,180,255,0.7)");
        }
      }
    }
    const recent = this.trail.filter((sample) => now - sample.t <= 800);
    if (recent.length > 1 && (this.ramps.reverb > 0 || this.ramps.delay > 0)) {
      ctx.globalCompositeOperation = "lighter";
      for (let i = 1; i < recent.length; i++) {
        const age = (now - recent[i].t) / 800;
        ctx.strokeStyle = this._color(recent[i].color, 0.05 + (1 - age) * (this.ramps.reverb > 0 ? 0.25 : 0.45));
        ctx.lineWidth = this.ramps.delay > 0 ? 1 + (1 - age) * 4 : 1.5;
        ctx.beginPath(); ctx.moveTo(recent[i - 1].x, recent[i - 1].y); ctx.lineTo(recent[i].x, recent[i].y); ctx.stroke();
      }
    }
    if (this.ramps.filter > 0) {
      ctx.fillStyle = `rgba(170,160,190,${0.35 * this.ramps.filter})`;
      for (const particle of this.dust) { ctx.beginPath(); ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
  }

  reset() { this.trail.length = 0; this.pointers.clear(); this.zones.clear(); this.ramps = { vibrato: 0, reverb: 0, filter: 0, delay: 0 }; }
}
