export class DebugOverlay {
  constructor(canvas, voids) {
    this.canvas = canvas;
    this.voids = voids;
    this.pointers = new Map();
  }

  pointer(id, x, y) {
    this.pointers.set(id, { x, y });
  }

  touchEnd(id) {
    this.pointers.delete(id);
  }

  reset() {
    this.pointers.clear();
  }

  render(ctx) {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    const styles = {
      vibrato: ["#ff6666", "V"], reverb: ["#66ff99", "R"],
      filter: ["#66aaff", "F"], delay: ["#ffcc66", "D"],
    };
    ctx.save();
    ctx.scale(this.canvas.width / w, this.canvas.height / h);
    ctx.lineWidth = 1;
    ctx.font = "12px monospace";
    ctx.textBaseline = "top";
    for (const zone of this.voids.zonesFor(w, h)) {
      const [color, letter] = styles[zone.id];
      const count = this.voids.members.get(zone.id).size;
      ctx.strokeStyle = color;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(zone.x, zone.y, zone.w, zone.h);
      ctx.setLineDash([]);
      if (count) {
        ctx.fillStyle = `${color}26`;
        ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
      }
      ctx.fillStyle = color;
      ctx.fillText(count ? `${letter}×${count}` : letter, zone.x + 4, zone.y + 4);
    }
    for (const [id, zoneId] of this.voids.pointerZone) {
      const point = this.pointers.get(id);
      if (!point) continue;
      ctx.strokeStyle = styles[zoneId]?.[0] || "#66aaff";
      ctx.beginPath();
      ctx.moveTo(point.x - 4, point.y); ctx.lineTo(point.x + 4, point.y);
      ctx.moveTo(point.x, point.y - 4); ctx.lineTo(point.x, point.y + 4);
      ctx.stroke();
    }
    ctx.restore();
  }
}