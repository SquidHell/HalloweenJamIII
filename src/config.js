// Constantes globales + petits utilitaires.
export const W = 1280;        // largeur logique (16:9)
export const H = 720;         // hauteur logique
export const GROUND = 600;    // y du sol
export const PX = 280;        // x fixe du vampire à l'écran

export const FONT = "Waelek, 'Trebuchet MS', 'Segoe UI', Arial, sans-serif";

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];

export function lerpColor(c1, c2, t) {
  t = clamp(t);
  const r = lerp((c1 >> 16) & 255, (c2 >> 16) & 255, t);
  const g = lerp((c1 >> 8) & 255, (c2 >> 8) & 255, t);
  const b = lerp(c1 & 255, c2 & 255, t);
  return ((r | 0) << 16) | ((g | 0) << 8) | (b | 0);
}
