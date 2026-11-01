// ============================================================================
//  ART.JS - toute l'apparence du jeu est ici.
//  Chaque élément est une forme de base (carré / rond) servant d'exemple.
//  Pour passer à du vrai art plus tard : remplacer le contenu des fonctions
//  create*() ci-dessous (sprites, animations...) sans toucher au gameplay.
//  Contrat avec Game.js : les tailles de collision viennent de DIMS.
// ============================================================================
import { W, H, GROUND, lerpColor } from './config.js';
import Phaser from 'phaser';

// ---- Palette (à changer en un seul endroit)
export const COLORS = {
  skyNight: 0x1b1b2f,
  skyDawn: 0x9c5a3c,
  ground: 0x3d3d52,
  groundDawn: 0x6b5446,
  groundLine: 0x8888a8,
  shade: 0x000000,        // colonne d'ombre (alpha 0.5)
  player: 0x9b5de5,
  playerBurn: 0xff7a1a,
  villager: 0xf4a261,
  villagerBig: 0xe76f51,
  garlic: 0xdde5b6,
  orb: 0xe63946,
  fxBlood: 0xe63946,
  fxSmoke: 0x888888,
  fxEmber: 0xff7a1a,
  fxHeal: 0x7fd6ff,
  fxDust: 0x8888a8,
  burnOverlay: 0xff3b1f,
};

// ---- Dimensions (hitbox = affichage) : x = largeur, y = hauteur, en pixels
export const DIMS = {
  player: { w: 50, h: 50 },
  villager: { w: 36, h: 64 },
  villagerBig: { w: 52, h: 96 },
  garlicRadius: 22,
  orbRadius: 11,
};

// ---------------------------------------------------------------------------
//  Primitives : sprites carrés / ronds teintés (textures générées en code)
// ---------------------------------------------------------------------------
export function initShapes(scene) {
  if (!scene.textures.exists('sq')) {
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffffff, 1); g.fillRect(0, 0, 16, 16); g.generateTexture('sq', 16, 16);
    g.clear(); g.fillStyle(0xffffff, 1); g.fillCircle(32, 32, 32); g.generateTexture('ci', 64, 64);
    g.destroy();
  }
  const IP = Phaser.GameObjects.Image.prototype;
  if (!IP.setFillStyle) {
    IP.setFillStyle = function (c, a) { this.setTint(c); if (a !== undefined) this.setAlpha(a); return this; };
  }
}

// x, y = centre ; w, h en pixels
export function box(scene, x, y, w, h, color = 0xffffff, alpha = 1) {
  return scene.add.image(x, y, 'sq').setDisplaySize(w, h).setTint(color).setAlpha(alpha);
}

// x, y = centre ; r = rayon
export function dot(scene, x, y, r, color = 0xffffff, alpha = 1) {
  return scene.add.image(x, y, 'ci').setDisplaySize(r * 2, r * 2).setTint(color).setAlpha(alpha);
}

// ---------------------------------------------------------------------------
//  Décor : ciel plat (change de couleur avec l'aube) + sol + traits de défilement
// ---------------------------------------------------------------------------
export function createBackground(scene) {
  const sky = box(scene, W / 2, H / 2, W + 200, H + 200, COLORS.skyNight).setDepth(0);
  const ground = box(scene, W / 2, GROUND + (H - GROUND) / 2 + 40, W + 200, H - GROUND + 80, COLORS.ground).setDepth(7);
  const line = box(scene, W / 2, GROUND + 2, W + 200, 4, COLORS.groundLine).setDepth(7.5);
  const dashes = [];
  for (let i = 0; i < 9; i++) dashes.push(box(scene, i * 160, GROUND + 50, 70, 5, COLORS.groundLine, 0.6).setDepth(7.5));

  return {
    // I = intensité de l'aube (0..1), speed = vitesse du monde (px/s)
    update(I, speed, dt) {
      const c = lerpColor(COLORS.skyNight, COLORS.skyDawn, I);
      sky.setFillStyle(c);
      scene.cameras.main.setBackgroundColor(c);
      ground.setFillStyle(lerpColor(COLORS.ground, COLORS.groundDawn, I));
      for (const d of dashes) { d.x -= speed * dt; if (d.x < -90) d.x += 1440; }
    },
  };
}

// ---------------------------------------------------------------------------
//  Vampire : un carré. Origine du conteneur = pieds, centre-bas.
//  Game.js applique squash/stretch sur le conteneur et appelle setBurning().
// ---------------------------------------------------------------------------
export function createPlayer(scene) {
  const { w, h } = DIMS.player;
  const body = box(scene, 0, -h / 2, w, h, COLORS.player);
  const c = scene.add.container(0, 0, [body]).setDepth(15);
  return {
    c,
    setBurning(on) { body.setFillStyle(on ? COLORS.playerBurn : COLORS.player); },
  };
}

// ---------------------------------------------------------------------------
//  Villageois (cible à mordre) : un rectangle. Origine = pieds.
// ---------------------------------------------------------------------------
export function createVillager(scene, big) {
  const d = big ? DIMS.villagerBig : DIMS.villager;
  const body = box(scene, 0, -d.h / 2, d.w, d.h, big ? COLORS.villagerBig : COLORS.villager);
  const c = scene.add.container(0, GROUND, [body]).setDepth(12);
  return { c, w: d.w, h: d.h };
}

// ---------------------------------------------------------------------------
//  Ail (danger) : un rond. Origine = centre.
// ---------------------------------------------------------------------------
export function createGarlic(scene) {
  return scene.add.container(0, 0, [dot(scene, 0, 0, DIMS.garlicRadius, COLORS.garlic)]).setDepth(13);
}

// ---------------------------------------------------------------------------
//  Orbe de sang (bonus) : un petit rond. Origine = centre.
// ---------------------------------------------------------------------------
export function createOrb(scene) {
  return scene.add.container(0, 0, [dot(scene, 0, 0, DIMS.orbRadius, COLORS.orb)]).setDepth(13);
}

// ---------------------------------------------------------------------------
//  Zone d'ombre (safe) : un rectangle sombre de la largeur w, toute la hauteur.
//  Origine du conteneur = coin haut-gauche de la zone.
// ---------------------------------------------------------------------------
export function createShade(scene, w) {
  const col = box(scene, w / 2, H / 2, w, H, COLORS.shade, 0.5);
  return scene.add.container(0, 0, [col]).setDepth(9);
}
