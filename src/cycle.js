// Planning du cycle jour/nuit : NUIT n -> JOUR n -> NUIT n+1 -> ...
// Tout est en secondes de jeu. La difficulté monte avec n.
export const DAWN_WARN = 3.5; // alerte avant le lever du soleil (fin de nuit)

export const nightLen = (n) => Math.max(13, 18 - 1.2 * (n - 1));
export const dayLen = (n) => Math.min(16, 8 + 1.2 * (n - 1));

export class Cycle {
  constructor() { this.reset(); }

  reset() { this.segs = [{ type: 'night', n: 1, t0: 0, t1: nightLen(1) }]; }

  // génère les segments jusqu'à couvrir le temps t
  extend(t) {
    for (;;) {
      const last = this.segs[this.segs.length - 1];
      if (last.t1 > t + 1) return;
      if (last.type === 'night') this.segs.push({ type: 'day', n: last.n, t0: last.t1, t1: last.t1 + dayLen(last.n) });
      else this.segs.push({ type: 'night', n: last.n + 1, t0: last.t1, t1: last.t1 + nightLen(last.n + 1) });
    }
  }

  at(t) {
    this.extend(t);
    for (const s of this.segs) if (t < s.t1) return s;
    return this.segs[this.segs.length - 1];
  }
}
