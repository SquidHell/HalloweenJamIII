// Mini système de particules (ronds et carrés uniquement), avec pool.
import { rand } from './config.js';

export class Fx {
  constructor(scene, depth = 20) {
    this.scene = scene;
    this.depth = depth;
    this.list = [];
    this.pool = { circle: [], square: [] };
  }

  spawn(kind, x, y, o = {}) {
    const { vx = 0, vy = 0, g = 0, life = 0.5, size = 8, color = 0xffffff, alpha = 1,
      shrink = true, spin = 0, drag = 0, depth = this.depth } = o;
    let go = this.pool[kind].pop();
    if (!go) {
      go = this.scene.add.image(0, 0, kind === 'circle' ? 'ci' : 'sq');
    }
    go.setVisible(true).setActive(true).setPosition(x, y).setTint(color).setAlpha(alpha)
      .setDepth(depth).setRotation(rand(0, 6.28));
    this.fit(go, kind, size, 1);
    this.list.push({ go, kind, vx, vy, g, life, max: life, size, shrink, spin, drag, alpha });
    return go;
  }

  // cercle : size = rayon ; carré : size = côté
  fit(go, kind, size, k) { const d = (kind === 'circle' ? size * 2 : size) * k; go.setDisplaySize(d, d); }

  burst(kind, x, y, n, o = {}) {
    const { speed = 300, spread = 6.283, angle = 0, ...rest } = o;
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const s = speed * rand(0.35, 1);
      this.spawn(kind, x, y, { ...rest, vx: Math.cos(a) * s, vy: Math.sin(a) * s });
    }
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.go.setVisible(false).setActive(false);
        this.pool[p.kind].push(p.go);
        this.list.splice(i, 1);
        continue;
      }
      if (p.drag) { const d = Math.max(0, 1 - p.drag * dt); p.vx *= d; p.vy *= d; }
      p.vy += p.g * dt;
      p.go.x += p.vx * dt;
      p.go.y += p.vy * dt;
      p.go.rotation += p.spin * dt;
      const k = p.life / p.max;
      p.go.setAlpha(p.alpha * Math.min(1, k * 1.6));
      if (p.shrink) this.fit(p.go, p.kind, p.size, 0.25 + 0.75 * k);
    }
  }

  clear() {
    for (const p of this.list) { p.go.setVisible(false).setActive(false); this.pool[p.kind].push(p.go); }
    this.list.length = 0;
  }
}
