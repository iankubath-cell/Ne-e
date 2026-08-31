const DEFAULT_GRID_W = 96;
const DEFAULT_GRID_H = 192;

const VISCOSITY = 0.00005;
const DIFFUSION = 0.00008;
const VELOCITY_FADE = 0.99;
const DENSITY_FADE = 0.992;
const SOLVER_ITER = 10;
const EPS = 1e-6;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function safeNumber(v, fallback = 0) {
  return Number.isFinite(v) ? v : fallback;
}

export class FluidSim {
  constructor(options = {}) {
    this.GRID_W = options.gridW ?? DEFAULT_GRID_W;
    this.GRID_H = options.gridH ?? DEFAULT_GRID_H;

    this.width = 1;
    this.height = 1;
    this.cssWidth = 1;
    this.cssHeight = 1;
    this.dpr = 1;

    this.velocityFade = options.velocityFade ?? VELOCITY_FADE;
    this.densityFade = options.densityFade ?? DENSITY_FADE;
    this.viscosity = options.viscosity ?? VISCOSITY;
    this.diffusion = options.diffusion ?? DIFFUSION;

    this._allocFields();

    this._renderCanvas = document.createElement("canvas");
    this._renderCtx = this._renderCanvas.getContext("2d", { alpha: true });
    this._imageData = null;
  }

  _allocFields() {
    const n = this.GRID_W * this.GRID_H;
    const n3 = n * 3;

    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.vx0 = new Float32Array(n);
    this.vy0 = new Float32Array(n);

    this.p = new Float32Array(n);
    this.div = new Float32Array(n);

    this.density = new Float32Array(n3);
    this.density0 = new Float32Array(n3);
  }

  IX(x, y) {
    const cx = clamp(x | 0, 0, this.GRID_W - 1);
    const cy = clamp(y | 0, 0, this.GRID_H - 1);
    return cx + cy * this.GRID_W;
  }

  _sanitizeScalarField(field) {
    for (let i = 0; i < field.length; i++) {
      const v = field[i];
      field[i] = Number.isFinite(v) ? v : 0;
    }
  }

  _sanitizeDensityField(field) {
    for (let i = 0; i < field.length; i++) {
      const v = field[i];
      field[i] = Number.isFinite(v) ? clamp(v, 0, 1e3) : 0; // lowered from 1e6
    }
  }

  _getEffectiveCssSize() {
    // Primary stored values
    let w = safeNumber(this.cssWidth, 0);
    let h = safeNumber(this.cssHeight, 0);

    // Fallback chain if stale/invalid
    if (!(w > EPS) || !(h > EPS)) {
      const rc = this._renderCanvas;
      const rw = safeNumber(rc?.clientWidth, 0);
      const rh = safeNumber(rc?.clientHeight, 0);

      if (rw > EPS && rh > EPS) {
        w = rw;
        h = rh;
      }
    }

    if (!(w > EPS) || !(h > EPS)) {
      const ww = safeNumber(this.width, 0);
      const wh = safeNumber(this.height, 0);
      const dpr = Math.max(EPS, safeNumber(this.dpr, 1));
      if (ww > EPS && wh > EPS) {
        w = ww / dpr;
        h = wh / dpr;
      }
    }

    return {
      width: w > EPS ? w : 1,
      height: h > EPS ? h : 1,
      valid: w > EPS && h > EPS,
    };
  }

  setBounds(b, x) {
    const W = this.GRID_W;
    const H = this.GRID_H;

    for (let i = 1; i < W - 1; i++) {
      x[this.IX(i, 0)] = b === 2 ? -x[this.IX(i, 1)] : x[this.IX(i, 1)];
      x[this.IX(i, H - 1)] = b === 2 ? -x[this.IX(i, H - 2)] : x[this.IX(i, H - 2)];
    }

    for (let j = 1; j < H - 1; j++) {
      x[this.IX(0, j)] = b === 1 ? -x[this.IX(1, j)] : x[this.IX(1, j)];
      x[this.IX(W - 1, j)] = b === 1 ? -x[this.IX(W - 2, j)] : x[this.IX(W - 2, j)];
    }

    x[this.IX(0, 0)] = 0.5 * (x[this.IX(1, 0)] + x[this.IX(0, 1)]);
    x[this.IX(0, H - 1)] = 0.5 * (x[this.IX(1, H - 1)] + x[this.IX(0, H - 2)]);
    x[this.IX(W - 1, 0)] = 0.5 * (x[this.IX(W - 2, 0)] + x[this.IX(W - 1, 1)]);
    x[this.IX(W - 1, H - 1)] =
      0.5 * (x[this.IX(W - 2, H - 1)] + x[this.IX(W - 1, H - 2)]);
  }

  lin_solve(b, x, x0, a, c, iter = SOLVER_ITER) {
    const W = this.GRID_W;
    const H = this.GRID_H;
    const iters = Math.max(1, iter | 0);

    if (!Number.isFinite(a) || !Number.isFinite(c) || Math.abs(c) < EPS) return;
    const invC = 1 / c;

    for (let k = 0; k < iters; k++) {
      for (let j = 1; j < H - 1; j++) {
        for (let i = 1; i < W - 1; i++) {
          const idx = this.IX(i, j);
          const sum =
            x[this.IX(i - 1, j)] +
            x[this.IX(i + 1, j)] +
            x[this.IX(i, j - 1)] +
            x[this.IX(i, j + 1)];
          const nv = (x0[idx] + a * sum) * invC;
          x[idx] = Number.isFinite(nv) ? nv : 0;
        }
      }
      this.setBounds(b, x);
    }
  }

  diffuse(b, x, x0, diff, dt) {
    const W = this.GRID_W;
    const H = this.GRID_H;
    const d = Math.max(0, safeNumber(diff, 0));
    const t = Math.max(0, safeNumber(dt, 0));
    const a = t * d * (W - 2) * (H - 2);
    this.lin_solve(b, x, x0, a, 1 + 4 * a, SOLVER_ITER);
  }

  advect(b, d, d0, vx, vy, dt) {
    const W = this.GRID_W;
    const H = this.GRID_H;
    const t = Math.max(0, safeNumber(dt, 0));
    const dt0x = t * (W - 2);
    const dt0y = t * (H - 2);

    for (let j = 1; j < H - 1; j++) {
      for (let i = 1; i < W - 1; i++) {
        const idx = this.IX(i, j);

        let x = i - dt0x * safeNumber(vx[idx], 0);
        let y = j - dt0y * safeNumber(vy[idx], 0);

        x = clamp(x, 0.5, W - 1.5);
        y = clamp(y, 0.5, H - 1.5);

        const i0 = Math.floor(x);
        const i1 = i0 + 1;
        const j0 = Math.floor(y);
        const j1 = j0 + 1;

        const s1 = x - i0;
        const s0 = 1 - s1;
        const t1 = y - j0;
        const t0 = 1 - t1;

        const val =
          s0 * (t0 * d0[this.IX(i0, j0)] + t1 * d0[this.IX(i0, j1)]) +
          s1 * (t0 * d0[this.IX(i1, j0)] + t1 * d0[this.IX(i1, j1)]);

        d[idx] = Number.isFinite(val) ? val : 0;
      }
    }

    this.setBounds(b, d);
  }

  project(vx, vy, p, div) {
    const W = this.GRID_W;
    const H = this.GRID_H;
    const h = 1 / Math.max(1, Math.min(W, H) - 2);

    for (let j = 1; j < H - 1; j++) {
      for (let i = 1; i < W - 1; i++) {
        const idx = this.IX(i, j);

        const d =
          -0.5 *
          h *
          (safeNumber(vx[this.IX(i + 1, j)], 0) -
            safeNumber(vx[this.IX(i - 1, j)], 0) +
            safeNumber(vy[this.IX(i, j + 1)], 0) -
            safeNumber(vy[this.IX(i, j - 1)], 0));

        div[idx] = Number.isFinite(d) ? d : 0;
        p[idx] = 0;
      }
    }

    this.setBounds(0, div);
    this.setBounds(0, p);
    this.lin_solve(0, p, div, 1, 4, SOLVER_ITER);

    const invH = 1 / Math.max(EPS, h);

    for (let j = 1; j < H - 1; j++) {
      for (let i = 1; i < W - 1; i++) {
        const idx = this.IX(i, j);

        vx[idx] -= 0.5 * (p[this.IX(i + 1, j)] - p[this.IX(i - 1, j)]) * invH;
        vy[idx] -= 0.5 * (p[this.IX(i, j + 1)] - p[this.IX(i, j - 1)]) * invH;

        if (!Number.isFinite(vx[idx])) vx[idx] = 0;
        if (!Number.isFinite(vy[idx])) vy[idx] = 0;
      }
    }

    this.setBounds(1, vx);
    this.setBounds(2, vy);
  }

  _diffuseRGB(dstRGB, srcRGB, diff, dt) {
    const W = this.GRID_W;
    const H = this.GRID_H;
    const d = Math.max(0, safeNumber(diff, 0));
    const t = Math.max(0, safeNumber(dt, 0));
    const a = t * d * (W - 2) * (H - 2);
    const c = 1 + 4 * a;
    const invC = 1 / Math.max(EPS, c);

    dstRGB.set(srcRGB);

    for (let k = 0; k < SOLVER_ITER; k++) {
      for (let j = 1; j < H - 1; j++) {
        for (let i = 1; i < W - 1; i++) {
          const idx = this.IX(i, j);
          const o = idx * 3;

          const l = this.IX(i - 1, j) * 3;
          const r = this.IX(i + 1, j) * 3;
          const u = this.IX(i, j - 1) * 3;
          const dwn = this.IX(i, j + 1) * 3;

          for (let c = 0; c < 3; c++) {
            const nv =
              (srcRGB[o + c] + a * (dstRGB[l + c] + dstRGB[r + c] + dstRGB[u + c] + dstRGB[dwn + c])) *
              invC;
            dstRGB[o + c] = Number.isFinite(nv) ? nv : 0;
          }
        }
      }

      for (let x = 1; x < W - 1; x++) {
        const top = this.IX(x, 0) * 3;
        const topIn = this.IX(x, 1) * 3;
        const bot = this.IX(x, H - 1) * 3;
        const botIn = this.IX(x, H - 2) * 3;
        for (let c = 0; c < 3; c++) {
          dstRGB[top + c] = dstRGB[topIn + c];
          dstRGB[bot + c] = dstRGB[botIn + c];
        }
      }

      for (let y = 1; y < H - 1; y++) {
        const left = this.IX(0, y) * 3;
        const leftIn = this.IX(1, y) * 3;
        const right = this.IX(W - 1, y) * 3;
        const rightIn = this.IX(W - 2, y) * 3;
        for (let c = 0; c < 3; c++) {
          dstRGB[left + c] = dstRGB[leftIn + c];
          dstRGB[right + c] = dstRGB[rightIn + c];
        }
      }
    }
  }

  _advectRGB(dstRGB, srcRGB, vx, vy, dt) {
    const W = this.GRID_W;
    const H = this.GRID_H;
    const t = Math.max(0, safeNumber(dt, 0));
    const dt0x = t * (W - 2);
    const dt0y = t * (H - 2);

    for (let j = 1; j < H - 1; j++) {
      for (let i = 1; i < W - 1; i++) {
        const idx = this.IX(i, j);
        const out = idx * 3;

        let x = i - dt0x * safeNumber(vx[idx], 0);
        let y = j - dt0y * safeNumber(vy[idx], 0);

        x = clamp(x, 0.5, W - 1.5);
        y = clamp(y, 0.5, H - 1.5);

        const i0 = Math.floor(x);
        const i1 = i0 + 1;
        const j0 = Math.floor(y);
        const j1 = j0 + 1;

        const s1 = x - i0;
        const s0 = 1 - s1;
        const t1 = y - j0;
        const t0 = 1 - t1;

        const a00 = this.IX(i0, j0) * 3;
        const a01 = this.IX(i0, j1) * 3;
        const a10 = this.IX(i1, j0) * 3;
        const a11 = this.IX(i1, j1) * 3;

        for (let c = 0; c < 3; c++) {
          const v =
            s0 * (t0 * srcRGB[a00 + c] + t1 * srcRGB[a01 + c]) +
            s1 * (t0 * srcRGB[a10 + c] + t1 * srcRGB[a11 + c]);
          dstRGB[out + c] = Number.isFinite(v) ? v : 0;
        }
      }
    }
  }

  step(dt) {
    const t = clamp(safeNumber(dt, 0), 0, 0.033);

    this.vx0.set(this.vx);
    this.vy0.set(this.vy);

    this.diffuse(1, this.vx, this.vx0, this.viscosity, t);
    this.diffuse(2, this.vy, this.vy0, this.viscosity, t);
    this.project(this.vx, this.vy, this.p, this.div);

    this.vx0.set(this.vx);
    this.vy0.set(this.vy);

    this.advect(1, this.vx, this.vx0, this.vx0, this.vy0, t);
    this.advect(2, this.vy, this.vy0, this.vx0, this.vy0, t);
    this.project(this.vx, this.vy, this.p, this.div);

    this._diffuseRGB(this.density0, this.density, this.diffusion, t);
    this._advectRGB(this.density, this.density0, this.vx, this.vy, t);

    for (let i = 0; i < this.vx.length; i++) {
      this.vx[i] *= this.velocityFade;
      this.vy[i] *= this.velocityFade;
    }
    for (let i = 0; i < this.density.length; i++) {
      this.density[i] *= this.densityFade;
    }

    // Keep final cleanup pass
    this._sanitizeScalarField(this.vx);
    this._sanitizeScalarField(this.vy);
    this._sanitizeDensityField(this.density);
  }

  addDensityBlob(gridX, gridY, r, g, b, amount = 200, radius = 4) {
    const gx = clamp(Math.round(safeNumber(gridX, 0)), 1, this.GRID_W - 2);
    const gy = clamp(Math.round(safeNumber(gridY, 0)), 1, this.GRID_H - 2);

    const rr = clamp(safeNumber(r, 0), 0, 1);
    const gg = clamp(safeNumber(g, 0), 0, 1);
    const bb = clamp(safeNumber(b, 0), 0, 1);
    const amt = Math.max(0, safeNumber(amount, 0));
    const rad = Math.max(1, Math.floor(safeNumber(radius, 4)));

    const minX = clamp(gx - rad, 1, this.GRID_W - 2);
    const maxX = clamp(gx + rad, 1, this.GRID_W - 2);
    const minY = clamp(gy - rad, 1, this.GRID_H - 2);
    const maxY = clamp(gy + rad, 1, this.GRID_H - 2);

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = x - gx;
        const dy = y - gy;
        const dist = Math.hypot(dx, dy);
        if (dist > rad) continue;

        const falloff = 1 - dist / Math.max(EPS, rad);
        const add = amt * falloff;

        const o = this.IX(x, y) * 3;
        this.density[o] += rr * add;
        this.density[o + 1] += gg * add;
        this.density[o + 2] += bb * add;
      }
    }
  }

  addForce(cssX, cssY, dx, dy, strength = 1, color = null) {
    const css = this._getEffectiveCssSize();

    const xCss = clamp(safeNumber(cssX, 0), 0, css.width);
    const yCss = clamp(safeNumber(cssY, 0), 0, css.height);
    const ddx = safeNumber(dx, 0);
    const ddy = safeNumber(dy, 0);
    const s = clamp(safeNumber(strength, 1), 0, 100);

    const nx = css.valid ? xCss / css.width : 0.5;
    const ny = css.valid ? yCss / css.height : 0.5;

    const gx = clamp(Math.floor(nx * (this.GRID_W - 2)) + 1, 1, this.GRID_W - 2);
    const gy = clamp(Math.floor(ny * (this.GRID_H - 2)) + 1, 1, this.GRID_H - 2);

    const idx = this.IX(gx, gy);

    const velScale = 0.08 * s;
    const vxAdd = clamp(ddx * velScale, -20, 20);
    const vyAdd = clamp(ddy * velScale, -20, 20);

    this.vx[idx] = safeNumber(this.vx[idx] + vxAdd, 0);
    this.vy[idx] = safeNumber(this.vy[idx] + vyAdd, 0);

    let rgb = color;
    if (!rgb || !Array.isArray(rgb) || rgb.length !== 3) {
      rgb = [1.0, 0.6, 0.3];
    }

    // lowered from 200*s to 50*s
    this.addDensityBlob(gx, gy, rgb[0], rgb[1], rgb[2], 50 * s, 4);
  }

  resize(canvasWidth, canvasHeight, dpr = 1) {
    this.width = Math.max(1, safeNumber(canvasWidth, 1));
    this.height = Math.max(1, safeNumber(canvasHeight, 1));
    this.dpr = Math.max(1, safeNumber(dpr, 1));

    this.cssWidth = Math.max(1, this.width / this.dpr);
    this.cssHeight = Math.max(1, this.height / this.dpr);

    // Keep render buffer management, but DO NOT rebuild physics fields/grid
    if (
      !this._imageData ||
      this._renderCanvas.width !== this.GRID_W ||
      this._renderCanvas.height !== this.GRID_H
    ) {
      this._renderCanvas.width = this.GRID_W;
      this._renderCanvas.height = this.GRID_H;
      this._imageData = this._renderCtx.createImageData(this.GRID_W, this.GRID_H);
    }
  }

  render(ctx) {
    if (!ctx || !this._imageData) return;

    const px = this._imageData.data;
    const n = this.GRID_W * this.GRID_H;

    for (let i = 0; i < n; i++) {
      const d = i * 3;
      const p = i * 4;

      const r = clamp(this.density[d] * 0.7, 0, 255);
      const g = clamp(this.density[d + 1] * 0.7, 0, 255);
      const b = clamp(this.density[d + 2] * 0.7, 0, 255);

      px[p] = r | 0;
      px[p + 1] = g | 0;
      px[p + 2] = b | 0;
      px[p + 3] = clamp((r + g + b) * 0.75, 0, 255) | 0;
    }

    this._renderCtx.putImageData(this._imageData, 0, 0);

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(this._renderCanvas, 0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  }
}
