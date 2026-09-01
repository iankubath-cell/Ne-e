import { FluidSim } from "./fluid.js";
import { TouchHandler } from "./touch.js";
import { SynthEngine } from "./audio.js";
import { freqForY, colourForFreq, colourForNote } from "./harmony.js";
import { DisplayOptimizer } from "./display.js";
import { VoidCorners } from "./voids.js";
import { DebugOverlay } from "./debug.js";

const canvas = document.getElementById("app-canvas");
if (!canvas) throw new Error("Canvas element #app-canvas not found.");

const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
if (!ctx) throw new Error("2D context could not be initialized.");

const prevent = (e) => e.preventDefault();
["gesturestart", "gesturechange", "gestureend"].forEach((type) => {
  window.addEventListener(type, prevent, { passive: false });
});

const fluid = new FluidSim();
const synth = new SynthEngine();
const activeVoices = new Map();
const display = new DisplayOptimizer(() => resizeCanvasToViewport());
const voids = new VoidCorners(synth, canvas);
const debug = new URLSearchParams(location.search).has("debug") ? new DebugOverlay(canvas, voids) : null;

const touch = new TouchHandler(canvas, {
  onStart: (x, y, pointerId) => {
    synth.ensureContext();

    const { freq } = freqForY(y, canvas.clientHeight || 1);
    const color = colourForFreq(freq);
    const voice = synth.startVoice(freq);
    if (voice) activeVoices.set(pointerId, voice);

    fluid.addForce(x, y, 0, 0, 1.5, color);
    voids.touchStart(pointerId, x, y, canvas.clientWidth || 1, canvas.clientHeight || 1);
    debug?.pointer(pointerId, x, y);
  },

  onMove: (x, y, dx, dy, pointerId) => {
    const voice = activeVoices.get(pointerId);
    if (voice) {
      const { freq } = freqForY(y, canvas.clientHeight || 1);
      voice.glideTo(freq);

      const color = colourForFreq(freq);
      const speed = Math.hypot(dx, dy);
      const strength = Math.min(2.5, 1 + speed * 0.05);
      fluid.addForce(x, y, dx, dy, strength, color);
    }
    voids.update(pointerId, x, y, canvas.clientWidth || 1, canvas.clientHeight || 1);
    debug?.pointer(pointerId, x, y);
  },

  onEnd: (pointerId) => {
    const voice = activeVoices.get(pointerId);
    if (voice) {
      voice.release();
      activeVoices.delete(pointerId);
    }
    voids.touchEnd(pointerId);
    debug?.touchEnd(pointerId);
  },
});

function resizeCanvasToViewport() {
  const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, display.dprCap));
  const cssWidth = Math.max(1, window.innerWidth);
  const cssHeight = Math.max(1, window.innerHeight);

  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.floor(cssWidth * dpr);
  canvas.height = Math.floor(cssHeight * dpr);

  fluid.resize(canvas.width, canvas.height, dpr);
}

let resizeTimer = null;
function scheduleResize() {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    resizeCanvasToViewport();
    resizeTimer = null;
  }, 150);
}

function initialSplash() {
  const cx = canvas.clientWidth * 0.5;
  const cy = canvas.clientHeight * 0.5;

  const splashes = [
    { x: cx - canvas.clientWidth * 0.08, y: cy, color: colourForNote(0) },
    { x: cx + canvas.clientWidth * 0.08, y: cy - canvas.clientHeight * 0.03, color: colourForNote(4) },
    { x: cx, y: cy + canvas.clientHeight * 0.08, color: colourForNote(9) },
  ];

  for (const s of splashes) {
    const dx = (Math.random() * 2 - 1) * 16;
    const dy = (Math.random() * 2 - 1) * 16;
    fluid.addForce(s.x, s.y, dx, dy, 1.8, s.color);
  }
}

resizeCanvasToViewport();
initialSplash();

window.addEventListener("resize", scheduleResize);
window.addEventListener("orientationchange", () => {
  resizeCanvasToViewport();
  scheduleResize();
});

let lastTime = performance.now();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    lastTime = performance.now();
    display.resetSamples();
    try { synth.ensureContext().catch(() => {}); } catch {}
  } else {
    for (const [id, voice] of activeVoices.entries()) {
      voice.kill();
      activeVoices.delete(id);
    }
    voids.resetAll();
    debug?.reset();
  }
});

function animate(now) {
  const frameMs = now - lastTime;
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;

  for (const [id, voice] of activeVoices.entries()) {
    if (!voice || voice.released) {
      activeVoices.delete(id);
    }
  }

  voids.apply(Array.from(activeVoices.values()));
  if (activeVoices.size === 0) display.sample(frameMs);
  fluid.step(dt);
  fluid.render(ctx);
  voids.render(ctx);
  debug?.render(ctx);

  requestAnimationFrame(animate);
}

requestAnimationFrame(animate);

if (location.hostname === "localhost") {
  window.__nee = { fluid, touch, synth, activeVoices, display, voids, debug };
}
