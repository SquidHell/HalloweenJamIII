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
  skyDay: 0xffbf5f,
  moon: 0xdfe6ff,
  sun: 0xfff7c2,
  ground: 0x3d3d52,
  groundDay: 0xe6c98a,
  groundLine: 0x8888a8,
  groundLineDay: 0xfff2c4,
  shadow: 0x0a0a1f,       // zone d'ombre : sombre = pas éclairé = sûr
  shadowFloor: 0x05050f,
  player: 0x9b5de5,
  playerBurn: 0xff7a1a,
  playerShade: 0x6a3fb0,  // vampire dans l'ombre
  villager: 0xf4a261,
  villagerBig: 0xe76f51,
  garlic: 0x8ac926,       // vert = danger
  orbGold: 0xffd166,
  orb: 0xe63946,
  fxBlood: 0xe63946,
  fxSmoke: 0x888888,
  fxEmber: 0xff7a1a,
  fxHeal: 0x9fb3ff,
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
  orbGoldRadius: 15,
  zoneH: 170,             // hauteur de la zone d'ombre au-dessus du sol de la plateforme
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
//  Décor : ciel plat + astre (lune la nuit / soleil le jour) + sol + traits.
//  D = "dayness" 0 (nuit) .. 1 (plein jour), calculé par Game.js.
// ---------------------------------------------------------------------------
export function createBackground(scene) {
  const sky = box(scene, W / 2, H / 2, W + 200, H + 200, COLORS.skyNight).setDepth(0);
  const star = dot(scene, W - 170, 120, 36, COLORS.moon).setDepth(1);
  const ground = box(scene, W / 2, GROUND + (H - GROUND) / 2 + 40, W + 200, H - GROUND + 80, COLORS.ground).setDepth(7);
  const line = box(scene, W / 2, GROUND + 2, W + 200, 4, COLORS.groundLine).setDepth(7.5);
  const dashes = [];
  for (let i = 0; i < 9; i++) dashes.push(box(scene, i * 160, GROUND + 50, 70, 5, COLORS.groundLine, 0.6).setDepth(7.5));

  return {
    update(D, speed, dt) {
      const c = lerpColor(COLORS.skyNight, COLORS.skyDay, D);
      sky.setFillStyle(c);
      scene.cameras.main.setBackgroundColor(c);
      // astre : lune -> soleil (plus grand, plus lumineux)
      const r = 36 + 30 * D;
      star.setFillStyle(lerpColor(COLORS.moon, COLORS.sun, D)).setDisplaySize(r * 2, r * 2);
      ground.setFillStyle(lerpColor(COLORS.ground, COLORS.groundDay, D));
      const lc = lerpColor(COLORS.groundLine, COLORS.groundLineDay, D);
      line.setFillStyle(lc);
      for (const d of dashes) { d.x -= speed * dt; if (d.x < -90) d.x += 1440; d.setFillStyle(lc); }
    },
  };
}

// ---------------------------------------------------------------------------
//  Vampire : un carré. Origine du conteneur = pieds, centre-bas.
//  Game.js applique squash/stretch sur le conteneur et appelle setLook(burning, shaded).
// ---------------------------------------------------------------------------
export function createPlayer(scene) {
  const { w, h } = DIMS.player;
  const body = box(scene, 0, -h / 2, w, h, COLORS.player);
  const c = scene.add.container(0, 0, [body]).setDepth(15);
  return {
    c,
    // burning : clignote orange au soleil ; shaded : plus sombre dans une zone d'ombre
    setLook(burning, shaded) { body.setFillStyle(burning ? COLORS.playerBurn : shaded ? COLORS.playerShade : COLORS.player); },
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
//  Orbe de sang (bonus) : un petit rond rouge ; doré = plus gros, plus de sang.
//  Origine = centre.
// ---------------------------------------------------------------------------
export function createOrb(scene, gold = false) {
  if (!gold) return scene.add.container(0, 0, [dot(scene, 0, 0, DIMS.orbRadius, COLORS.orb)]).setDepth(13);
  // doré = noyau or + anneau rouge (reste lisible sur le ciel orange du jour)
  const r = DIMS.orbGoldRadius;
  return scene.add.container(0, 0, [dot(scene, 0, 0, r + 5, COLORS.orb), dot(scene, 0, 0, r - 2, COLORS.orbGold)]).setDepth(13);
}

// ---------------------------------------------------------------------------
//  Zone d'ombre (abri du jour) : un volume SOMBRE (= pas éclairé) posé sur un sol.
//  Origine du conteneur = coin gauche au niveau du sol de la zone (y = 0).
//  Le vampire est à l'abri quand il est DANS le volume (largeur w, hauteur DIMS.zoneH).
// ---------------------------------------------------------------------------
export function createShelter(scene, w) {
  const vol = box(scene, w / 2, -DIMS.zoneH / 2, w, DIMS.zoneH, COLORS.shadow, 0.9);
  const floor = box(scene, w / 2, 14, w, 28, COLORS.shadowFloor);
  return scene.add.container(0, 0, [vol, floor]).setDepth(9);
}
