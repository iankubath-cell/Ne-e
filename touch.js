const PALETTE = ["#FF6B4A", "#4A9FFF", "#FFD93D", "#6BCB77", "#FF6BCB", "#4AFFD9"];

export class TouchHandler {
  /**
   * @param {HTMLElement} target
   * @param {{ onMove?: (x:number, y:number, dx:number, dy:number, color:string|number[])=>void }} callbacks
   */
  constructor(target, callbacks = {}) {
    this.target = target;
    this.callbacks = callbacks;
    this.pointers = new Map();
    this._paletteIndex = 0;

    this._rectCache = null;

    this._onPointerDown = this._handlePointerDown.bind(this);
    this._onPointerMove = this._handlePointerMove.bind(this);
    this._onPointerUp = this._handlePointerUp.bind(this);
    this._onPointerCancel = this._handlePointerCancel.bind(this);
    this._onPointerLeave = this._handlePointerLeave.bind(this);
    this._onVisibilityChange = this._handleVisibilityChange.bind(this);
    this._onResize = this._invalidateRectCache.bind(this);

    this.target.addEventListener("pointerdown", this._onPointerDown, { passive: false });
    this.target.addEventListener("pointermove", this._onPointerMove, { passive: false });
    this.target.addEventListener("pointerup", this._onPointerUp, { passive: false });
    this.target.addEventListener("pointercancel", this._onPointerCancel, { passive: false });
    this.target.addEventListener("pointerleave", this._onPointerLeave, { passive: false });

    document.addEventListener("visibilitychange", this._onVisibilityChange, { passive: true });
    window.addEventListener("resize", this._onResize);
    window.addEventListener("orientationchange", this._onResize);
  }

  _nextColor() {
    const color = PALETTE[this._paletteIndex % PALETTE.length];
    this._paletteIndex += 1;
    return color;
  }

  _hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return [r, g, b];
  }

  _invalidateRectCache() {
    this._rectCache = null;
  }

  _getRect() {
    if (!this._rectCache) {
      this._rectCache = this.target.getBoundingClientRect();
    }
    return this._rectCache;
  }

  _toLocalXY(e) {
    const rect = this._getRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  _emitMove(x, y, dx, dy, color) {
    if (typeof this.callbacks.onMove === "function") {
      this.callbacks.onMove(x, y, dx, dy, color);
    }
  }

  _handlePointerDown(e) {
    e.preventDefault();

    // refresh rect cache at start of interaction
    this._rectCache = this.target.getBoundingClientRect();

    if (this.target.setPointerCapture) {
      try {
        this.target.setPointerCapture(e.pointerId);
      } catch {}
    }

    const { x, y } = this._toLocalXY(e);
    const colorHex = this._nextColor();
    const colorRgb = this._hexToRgb(colorHex);

    const p = {
      id: e.pointerId,
      x,
      y,
      lastX: x,
      lastY: y,
      color: colorRgb, // normalized RGB [0..1]
      colorHex,
    };

    this.pointers.set(e.pointerId, p);
    this._emitMove(p.x, p.y, 0, 0, p.color);
  }

  _handlePointerMove(e) {
    e.preventDefault();
    const p = this.pointers.get(e.pointerId);
    if (!p) return;

    const { x, y } = this._toLocalXY(e);
    const dx = x - p.lastX;
    const dy = y - p.lastY;

    p.x = x;
    p.y = y;

    this._emitMove(x, y, dx, dy, p.color);

    p.lastX = x;
    p.lastY = y;
  }

  _finalizePointer(e) {
    e.preventDefault();

    if (this.target.releasePointerCapture) {
      try {
        this.target.releasePointerCapture(e.pointerId);
      } catch {}
    }

    this.pointers.delete(e.pointerId);
  }

  _handlePointerUp(e) {
    this._finalizePointer(e);
  }

  _handlePointerCancel(e) {
    this._finalizePointer(e);
  }

  _handlePointerLeave(e) {
    this._finalizePointer(e);
  }

  _handleVisibilityChange() {
    if (document.visibilityState !== "visible") {
      // release capture for all active pointers before clearing
      if (this.target.releasePointerCapture) {
        for (const pointerId of this.pointers.keys()) {
          try {
            this.target.releasePointerCapture(pointerId);
          } catch {}
        }
      }
      this.pointers.clear();
    }
  }

  destroy() {
    this.target.removeEventListener("pointerdown", this._onPointerDown);
    this.target.removeEventListener("pointermove", this._onPointerMove);
    this.target.removeEventListener("pointerup", this._onPointerUp);
    this.target.removeEventListener("pointercancel", this._onPointerCancel);
    this.target.removeEventListener("pointerleave", this._onPointerLeave);

    document.removeEventListener("visibilitychange", this._onVisibilityChange);
    window.removeEventListener("resize", this._onResize);
    window.removeEventListener("orientationchange", this._onResize);

    this.pointers.clear();
    this._rectCache = null;
  }
}
