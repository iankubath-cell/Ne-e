import { FluidSim } from "./fluid.js";
import { TouchHandler } from "./touch.js";

/**
 * Ñe'ẽ — app bootstrap
 * - Fullscreen canvas
 * - DPR-aware sizing
 * - Debounced resize
 * - Immediate + settle resize on orientation change
 * - Visibility-safe timing
 * - Pointer -> fluid force wiring
 */

// Canvas null-check BEFORE getContext()
const canvas = document.getElementById("app-canvas");
if (!canvas) {
  throw new Error("Canvas element #app-canvas not found.");
}

const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
if (!ctx) {
  throw new Error("2D context could not be initialized.");
}

// Allow ?debug=1 to enable debug logging/markers without devtools
if (location.search.includes("debug")) {
  window.__neeDebug = true;
}

// Keep only gesture blocking for iOS pinch-zoom
const prevent = (e) => e.preventDefault();
["gesturestart", "gesturechange", "gestureend"].forEach((type) => {
  window.addEventListener(type, prevent, { passive: false });
});

const fluid = new FluidSim();

// Touch -> fluid force wiring
const touch = new TouchHandler(canvas, {
  onMove: (x, y, dx, dy, color) => {
    const speed = Math.hypot(dx, dy);
    const strength = Math.min(2.5, 1 + speed * 0.05);
    fluid.addForce(x, y, dx, dy, strength, color);
  },
});

function resizeCanvasToViewport() {
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
  const cssWidth = Math.max(1, window.innerWidth);
  const cssHeight = Math.max(1, window.innerHeight);

  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;

  // Backing store in device pixels
  canvas.width = Math.floor(cssWidth * dpr);
  canvas.height = Math.floor(cssHeight * dpr);

  fluid.resize(canvas.width, canvas.height, dpr);
}

// Debounced resize (buffer-heavy operations settle after layout changes)
let resizeTimer = null;
function scheduleResize() {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    resizeCanvasToViewport();
    resizeTimer = null;
  }, 150);
}

// Initial color splash
function initialSplash() {
  const cx = canvas.clientWidth * 0.5;
  const cy = canvas.clientHeight * 0.5;

  const blobs = [
    { x: cx - canvas.clientWidth * 0.18, y: cy, color: [1, 0.42, 0.29] }, // orange
    { x: cx + canvas.clientWidth * 0.18, y: cy - canvas.clientHeight * 0.08, color: [0.29, 0.62, 1] }, // blue
    { x: cx, y: cy + canvas.clientHeight * 0.18, color: [1, 0.42, 0.8] }, // magenta
  ];

  for (const b of blobs) {
    const dx = (Math.random() * 2 - 1) * 40;
    const dy = (Math.random() * 2 - 1) * 40;
    fluid.addForce(b.x, b.y, dx, dy, 4.0, b.color);
  }
}

// Initial setup
resizeCanvasToViewport();
setTimeout(() => {
  initialSplash();
}, 200);

window.addEventListener("resize", scheduleResize);

// Improvement: immediate + debounced orientation handling
window.addEventListener("orientationchange", () => {
  resizeCanvasToViewport();
  scheduleResize();
});

// Visibility-safe timing reset
let lastTime = performance.now();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    lastTime = performance.now();
  }
});

function animate(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;

  fluid.step(dt);
  fluid.render(ctx);

  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);

// Dev-only debug hook
if (location.hostname === "localhost") {
  window.__nee = { fluid, touch };
}
