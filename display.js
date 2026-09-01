export class DisplayOptimizer {
  constructor(onCapChanged) {
    this.onCapChanged = onCapChanged;
    this._dprCap = 2;
    this.samples = [];
    this.lastChange = 0;
    this.COOLDOWN_MS = 5000;
    this.WINDOW = 120;
  }

  get dprCap() {
    return this._dprCap;
  }

  sample(dtMs) {
    this.samples.push(dtMs);
    if (this.samples.length > this.WINDOW) this.samples.shift();
    if (this.samples.length !== this.WINDOW || performance.now() - this.lastChange <= this.COOLDOWN_MS || this.dprCap <= 1) return;
    const mean = this.samples.reduce((sum, sample) => sum + sample, 0) / this.samples.length;
    if (mean <= 22) return;
    this._dprCap = this.dprCap === 2 ? 1.5 : 1;
    this.lastChange = performance.now();
    this.samples = [];
    this.onCapChanged(this.dprCap);
  }

  resetSamples() {
    this.samples = [];
    this.lastChange = performance.now();
  }
}