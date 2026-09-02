export class CornerFX {
  constructor(fluid, canvas) {
    this.fluid = fluid;
    this.canvas = canvas;
    this.trail = [];
    this.pointers = new Map();
    this.zones = new Map();
    this.filaments = [];
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
    for (const filament of this.filaments) filament.life -= dtMs / 250;
    this.filaments = this.filaments.filter((filament) => filament.life > 0);

    ctx.save();
    ctx.scale(sx, sy);
    if (this.ramps.vibrato > 0) {
      ctx.globalCompositeOperation = "lighter";
      ctx.lineWidth = 2;
      for (const [pointerId, pointer] of this.pointers) if (this.zones.get(pointerId) === "vibrato") {
        const origin = this.trail[this.trail.length - 1] || pointer;
        for (let n = 0; n < 2; n++) {
          const angle = Math.random() * Math.PI * 2;
          const length = 20 + Math.random() * 40;
          const midpoint = {
            x: origin.x + Math.cos(angle) * length * 0.45 + (Math.random() - 0.5) * 5,
            y: origin.y + Math.sin(angle) * length * 0.45 + (Math.random() - 0.5) * 5,
          };
          const ex = origin.x + Math.cos(angle) * length;
          const ey = origin.y + Math.sin(angle) * length;
          this.filaments.push({
            segments: [{ x: origin.x, y: origin.y }, midpoint, { x: ex, y: ey }],
            life: 1,
            seedColour: "200,180,255",
          });
          for (let burst = 0; burst < 2; burst++) {
            this.fluid.addForce(pointer.x, pointer.y, Math.cos(angle) * 2, Math.sin(angle) * 2, 0.9, [0.78, 0.7, 1]);
          }
        }
      }
    }
    if (this.filaments.length > 30) this.filaments.splice(0, this.filaments.length - 30);
    ctx.globalCompositeOperation = "lighter";
    for (const filament of this.filaments) {
      ctx.strokeStyle = `rgba(${filament.seedColour},${0.45 * filament.life})`;
      ctx.beginPath();
      ctx.moveTo(filament.segments[0].x, filament.segments[0].y);
      ctx.lineTo(filament.segments[1].x, filament.segments[1].y);
      ctx.lineTo(filament.segments[2].x, filament.segments[2].y);
      ctx.stroke();
    }
    const recent = this.trail.filter((sample) => now - sample.t <= 800);
    if (recent.length > 1 && (this.ramps.reverb > 0 || this.ramps.delay > 0)) {
      ctx.globalCompositeOperation = "lighter";
      for (let i = 1; i < recent.length; i++) {
        const age = (now - recent[i].t) / 800;
        const alpha = 0.05 + (1 - age) * (this.ramps.reverb > 0 ? 0.25 : 0.45);
        const previous = recent[i - 1];
        const current = recent[i];
        ctx.strokeStyle = this._color(current.color, alpha);
        ctx.lineWidth = this.ramps.delay > 0 ? 1 + (1 - age) * 4 : 1.5;
        ctx.beginPath(); ctx.moveTo(previous.x, previous.y); ctx.lineTo(current.x, current.y); ctx.stroke();
        if (this.ramps.reverb > 0) {
          const dx = current.x - previous.x;
          const dy = current.y - previous.y;
          const length = Math.hypot(dx, dy) || 1;
          const nx = -dy / length;
          const ny = dx / length;
          for (let k = 1; k <= 2; k++) {
            const offset = (Math.random() - 0.5) * 14 * k;
            ctx.strokeStyle = this._color(current.color, alpha * (k === 1 ? 0.4 : 0.2));
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(previous.x + nx * offset, previous.y + ny * offset);
            ctx.lineTo(current.x + nx * offset, current.y + ny * offset);
            ctx.stroke();
          }
        }
      }
    }
    if (this.ramps.filter > 0) {
      ctx.fillStyle = `rgba(170,160,190,${0.35 * this.ramps.filter})`;
      for (const particle of this.dust) { ctx.beginPath(); ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
  }

  reset() { this.trail.length = 0; this.filaments.length = 0; this.pointers.clear(); this.zones.clear(); this.ramps = { vibrato: 0, reverb: 0, filter: 0, delay: 0 }; }
}
