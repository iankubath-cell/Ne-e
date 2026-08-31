export const PENTATONIC_FREQS = [
  130.81,
  146.83,
  164.81,
  196.0,
  220.0,
  261.63,
  293.66,
  329.63,
  392.0,
  440.0,
];

export const NOTE_COLOURS = [
  [0.55, 0.08, 0.12],
  [0.95, 0.25, 0.15],
  [1.0, 0.45, 0.12],
  [1.0, 0.75, 0.15],
  [0.65, 0.85, 0.2],
  [0.2, 0.85, 0.4],
  [0.1, 0.8, 0.7],
  [0.15, 0.65, 1.0],
  [0.45, 0.35, 1.0],
  [0.8, 0.25, 0.95],
];

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function pitchFromY(cssY, cssHeight) {
  const h = Number.isFinite(cssHeight) && cssHeight > 0 ? cssHeight : 1;
  const y = Number.isFinite(cssY) ? cssY : h * 0.5;
  const t = 1 - clamp(y / h, 0, 1);
  const n = PENTATONIC_FREQS.length;
  const idx = Math.floor(t * n);
  return clamp(idx, 0, n - 1);
}

export function freqForY(cssY, cssHeight) {
  const h = Number.isFinite(cssHeight) && cssHeight > 0 ? cssHeight : 1;
  const y = Number.isFinite(cssY) ? cssY : h * 0.5;
  const t = 1 - clamp(y / h, 0, 1);

  const n = PENTATONIC_FREQS.length;
  const pos = clamp(t, 0, 1) * (n - 1);
  const i0 = Math.floor(pos);
  const i1 = Math.min(i0 + 1, n - 1);
  const frac = pos - i0;

  const f0 = PENTATONIC_FREQS[i0];
  const f1 = PENTATONIC_FREQS[i1];
  const freq = f0 + (f1 - f0) * frac;

  return { freq, index: Math.round(pos) };
}

export function colourForNote(index) {
  const i = clamp(index | 0, 0, NOTE_COLOURS.length - 1);
  return [...NOTE_COLOURS[i]];
}

export function colourForFreq(freq) {
  const n = PENTATONIC_FREQS.length;
  const f = Number.isFinite(freq) && freq > 0 ? freq : PENTATONIC_FREQS[0];

  if (f <= PENTATONIC_FREQS[0]) return [...NOTE_COLOURS[0]];
  if (f >= PENTATONIC_FREQS[n - 1]) return [...NOTE_COLOURS[n - 1]];

  let lo = 0;
  while (lo < n - 1 && !(PENTATONIC_FREQS[lo] <= f && f <= PENTATONIC_FREQS[lo + 1])) {
    lo++;
  }

  const hi = Math.min(lo + 1, n - 1);
  const f0 = PENTATONIC_FREQS[lo];
  const f1 = PENTATONIC_FREQS[hi];
  const t = f1 > f0 ? clamp((f - f0) / (f1 - f0), 0, 1) : 0;

  const a = NOTE_COLOURS[lo];
  const b = NOTE_COLOURS[hi];

  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}
