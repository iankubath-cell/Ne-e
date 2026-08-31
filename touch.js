export class TouchHandler {
  /**
   * @param {HTMLElement} target
   * @param {{
   *   onStart?: (x:number, y:number, pointerId:number)=>void,
   *   onMove?: (x:number, y:number, dx:number, dy:number, pointerId:number)=>void,
   *   onEnd?: (pointerId:number)=>void
   * }} callbacks
   */
  constructor(target, callbacks = {}) {
    this.target = target;
    this.callbacks = callbacks;
    this.pointers = new Map();
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

  _invalidateRectCache() {
    this._rectCache = null;
  }

  _getRect() {
    if (!this._rectCache) this._rectCache = this.target.getBoundingClientRect();
    return this._rectCache;
  }

  _toLocalXY(e) {
    const rect = this._getRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  _emitMove(x, y, dx, dy, pointerId) {
    if (typeof this.callbacks.onMove === "function") {
      this.callbacks.onMove(x, y, dx, dy, pointerId);
    }
  }

  _debugLog(label, e) {
    if (window.__neeDebug) {
      console.log(`[touch] ${label}`, {
        pointerId: e.pointerId,
        activeCount: this.pointers.size,
      });
    }
  }

  _handlePointerDown(e) {
    this._debugLog("pointerdown", e);
    e.preventDefault();
    this._rectCache = this.target.getBoundingClientRect();

    if (this.target.setPointerCapture) {
      try {
        this.target.setPointerCapture(e.pointerId);
      } catch {}
    }

    const { x, y } = this._toLocalXY(e);

    const p = {
      id: e.pointerId,
      x,
      y,
      lastX: x,
      lastY: y,
    };

    this.pointers.set(e.pointerId, p);

    if (typeof this.callbacks.onStart === "function") {
      this.callbacks.onStart(x, y, e.pointerId);
    }

    this._emitMove(x, y, 0, 0, e.pointerId);
  }

  _handlePointerMove(e) {
    this._debugLog("pointermove", e);
    e.preventDefault();
    const p = this.pointers.get(e.pointerId);
    if (!p) return;

    const { x, y } = this._toLocalXY(e);
    const dx = x - p.lastX;
    const dy = y - p.lastY;

    p.x = x;
    p.y = y;

    this._emitMove(x, y, dx, dy, e.pointerId);

    p.lastX = x;
    p.lastY = y;
  }

  _finalizePointer(e) {
    e.preventDefault();

    const p = this.pointers.get(e.pointerId);
    if (!p) return;

    if (typeof this.callbacks.onEnd === "function") {
      this.callbacks.onEnd(p.id);
    }

    if (this.target.releasePointerCapture) {
      try {
        this.target.releasePointerCapture(e.pointerId);
      } catch {}
    }

    this.pointers.delete(e.pointerId);
  }

  _handlePointerUp(e) {
    this._debugLog("pointerup", e);
    this._finalizePointer(e);
  }

  _handlePointerCancel(e) {
    this._debugLog("pointercancel", e);
    this._finalizePointer(e);
  }

  _handlePointerLeave(e) {
    this._debugLog("pointerleave", e);
    // Avoid dropping fingers on Android/browser retargeting quirks while captured.
    if (this.target.hasPointerCapture?.(e.pointerId)) {
      return;
    }
    this._finalizePointer(e);
  }

  _handleVisibilityChange() {
    if (document.visibilityState !== "visible") {
      for (const [pointerId, p] of this.pointers.entries()) {
        if (typeof this.callbacks.onEnd === "function") {
          this.callbacks.onEnd(p.id);
        }
        if (this.target.releasePointerCapture) {
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
