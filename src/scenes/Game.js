import Phaser from 'phaser';
import { W, H, GROUND, PX, FONT, clamp, lerp, rand, pick, lerpColor } from '../config.js';
import { Fx } from '../fx.js';
import { sfx } from '../audio.js';

// ---------------------------------------------------------------- réglages
const GRAVITY = 2600;
const HOLD_GRAVITY = 0.6;     // gravité réduite en montée quand on maintient
const JUMP_V = 800;
const CUT = 0.4;              // relâcher tôt = petit saut
const BOUNCE_V = 690;         // rebond sur villageois (sans maintenir)
const BOUNCE_HOLD_V = 880;    // rebond en maintenant
const BUFFER = 0.13;          // buffer d'input
const MAX_BLOOD = 100;
const BEST_KEY = 'bb_best';

const NIGHT = 0x0b0614, MID = 0x2a1148, DAWN = 0xa8393a, SUN = 0xffa24a;
const skyColor = (I) => (I < 0.5 ? lerpColor(NIGHT, MID, I / 0.5)
  : I < 0.85 ? lerpColor(MID, DAWN, (I - 0.5) / 0.35) : lerpColor(DAWN, SUN, (I - 0.85) / 0.15));

const SKIN = 0xf2c9a0;
const VILLAGER_COLORS = [0x6b8e5a, 0x7a5c3a, 0x5a6b8e, 0x8e5a6b, 0x8e8a5a];

function loadBest() { try { return +localStorage.getItem(BEST_KEY) || 0; } catch (e) { return 0; } }
function saveBest(v) { try { localStorage.setItem(BEST_KEY, String(v)); } catch (e) { /* ignore */ } }

export class Game extends Phaser.Scene {
  constructor() { super('Game'); }

  // ================================================================ création
  create() {
    this.best = loadBest();
    this.hitstop = 0;
    this.timeScale = 1;
    this.shakeAmt = 0;
    this.held = false;
    this.downIds = new Set();
    this.state = 'title';
    this.entities = { shades: [], villagers: [], garlics: [], orbs: [] };

    this.cameras.main.setBackgroundColor(NIGHT);
    this.initShapes();
    this.fx = new Fx(this, 20);

    this.buildBackground();
    this.buildPlayer();
    this.buildHud();
    this.buildTitle();
    this.buildDead();
    this.setupInput();

    this.resetRun();
    this.setState('title');

    if (location.search.includes('debug')) window.__bb = this;
  }

  txt(x, y, str, size, color = '#ffffff', o = {}) {
    return this.add.text(x, y, str, {
      fontFamily: FONT, fontSize: `${size}px`, color,
      stroke: o.stroke || '#0b0614', strokeThickness: Math.max(3, size / 7),
      align: o.align || 'center', resolution: 2,
      ...(o.style || {}),
    }).setOrigin(o.ox ?? 0.5, o.oy ?? 0.5).setDepth(o.depth ?? 40);
  }


  // --- formes : sprites carrés / ronds teintés (1 seul atlas => rendu batché, léger sur mobile)
  initShapes() {
    if (!this.textures.exists('sq')) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0xffffff, 1); g.fillRect(0, 0, 16, 16); g.generateTexture('sq', 16, 16);
      g.clear(); g.fillStyle(0xffffff, 1); g.fillCircle(32, 32, 32); g.generateTexture('ci', 64, 64);
      g.destroy();
    }
    const IP = Phaser.GameObjects.Image.prototype;
    if (!IP.setFillStyle) {
      IP.setFillStyle = function (c, a) { this.setTint(c); if (a !== undefined) this.setAlpha(a); return this; };
    }
  }

  // x, y = centre ; w,h en pixels
  box(x, y, w, h, color = 0xffffff, alpha = 1) {
    return this.add.image(x, y, 'sq').setDisplaySize(w, h).setTint(color).setAlpha(alpha);
  }

  // x, y = centre ; r = rayon
  dot(x, y, r, color = 0xffffff, alpha = 1) {
    return this.add.image(x, y, 'ci').setDisplaySize(r * 2, r * 2).setTint(color).setAlpha(alpha);
  }

  // ---------------------------------------------------------------- décor
  buildBackground() {
    const add = this.add;
    this.sky = this.box(W / 2, H / 2, W + 200, H + 200, NIGHT).setDepth(0);
    // lueur d'horizon : couches empilées (dégradé sans texture)
    this.horizons = [90, 170, 250, 330, 410, 490].map((h) => this.box(W / 2, GROUND - h / 2, W + 200, h, 0xff8a3d, 0).setDepth(0.5));

    this.stars = [];
    for (let i = 0; i < 60; i++) {
      const s = this.dot(rand(0, W), rand(10, GROUND - 200), rand(1, 2.6), 0xffffff, 1).setDepth(1);
      s.ph = rand(0, 6.28);
      this.stars.push(s);
    }
    this.moonGlow = this.dot(190, 130, 70, 0xcfd8ff, 0.12).setDepth(1);
    this.moon = this.dot(190, 130, 42, 0xeef1ff, 1).setDepth(1);
    this.moonCut = this.dot(208, 118, 38, NIGHT, 1).setDepth(1);

    this.sunGlow2 = this.dot(1010, H + 200, 330, 0xff9a4a, 0.1).setDepth(2);
    this.sunGlow = this.dot(1010, H + 200, 190, 0xffc46b, 0.22).setDepth(2);
    this.sun = this.dot(1010, H + 200, 96, 0xffe3a0, 1).setDepth(2);

    this.layers = [
      this.makeSkyline(0.12, 3, 90, 260, 70, 150),
      this.makeSkyline(0.32, 4, 70, 200, 90, 190),
    ];

    this.ground = this.box(W / 2, GROUND + (H - GROUND) / 2 + 40, W + 200, H - GROUND + 80, 0x241640).setDepth(7);
    this.groundTop = this.box(W / 2, GROUND + 3, W + 200, 8, 0x4a2f7a).setDepth(7.5);
    this.dashes = [];
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < 9; i++) {
        const d = this.box(i * 160 + r * 80, GROUND + 38 + r * 42, 70 - r * 20, 6, 0x4a2f7a).setDepth(7.5);
        d.row = r;
        this.dashes.push(d);
      }
    }
    this.speedLines = [];
    for (let i = 0; i < 9; i++) {
      const l = this.box(rand(0, W), rand(30, GROUND - 20), rand(80, 200), 3, 0xffffff, 0.14).setDepth(21);
      this.speedLines.push(l);
    }
    // voile rouge de brûlure + voile solaire
    this.burnOverlay = this.box(W / 2, H / 2, W + 200, H + 200, 0xff3b1f, 0).setDepth(30);
  }

  makeSkyline(factor, depth, minH, maxH, minW, maxW) {
    const rects = [];
    let x = -60;
    while (x < W + 300) {
      const w = rand(minW, maxW);
      const r = this.box(x, GROUND, w, rand(minH, maxH), 0x150a2b).setOrigin(0, 1).setDepth(depth);
      // fenêtres allumées
      r.wins = [];
      rects.push(r);
      x += w + rand(0, 16);
    }
    return { factor, rects };
  }

  // ---------------------------------------------------------------- joueur
  buildPlayer() {
    const a = this.add;
    const cape = this.box(-8, -27, 60, 50, 0x8d1b2f);
    const capeTail = this.box(-36, -20, 34, 18, 0x8d1b2f);
    const foot1 = this.box(-10, -4, 16, 8, 0x1b0f33);
    const foot2 = this.box(12, -4, 16, 8, 0x1b0f33);
    const body = this.box(0, -29, 50, 50, 0x5b34a8);
    const rim = this.box(0, -29, 56, 56, 0xb9a6ff, 0.9);
    const collar = this.box(0, -9, 50, 8, 0x8d1b2f);
    const hair = this.box(0, -52, 52, 14, 0x0b0614);
    const face = this.box(4, -34, 40, 26, 0xe9e3f5);
    const eye1 = this.dot(8, -37, 6, 0xffffff);
    const eye2 = this.dot(24, -37, 6, 0xffffff);
    const pup1 = this.dot(10, -37, 3, 0xd1203b);
    const pup2 = this.dot(26, -37, 3, 0xd1203b);
    const mouth = this.box(17, -25, 22, 4, 0x4a0f1c);
    const fang1 = this.box(11, -21, 5, 9, 0xffffff);
    const fang2 = this.box(23, -21, 5, 9, 0xffffff);
    this.pl = a.container(PX, GROUND, [cape, capeTail, foot1, foot2, rim, body, collar, hair, face, eye1, eye2, pup1, pup2, mouth, fang1, fang2]).setDepth(15);
    this.plParts = { body, capeTail, foot1, foot2, mouth, fang1, fang2 };
    this.P = { y: GROUND, prevY: GROUND, vy: 0, grounded: true, sx: 1, sy: 1, inv: 0, canCut: false, phase: 0, jumpAge: 0 };
  }

  // ---------------------------------------------------------------- HUD
  buildHud() {
    const d = 40;
    this.hud = [];
    const barX = 44, barY = 58, barW = 380;
    this.barW = barW;
    this.barBorder = this.box(barX - 5, barY, barW + 10, 36, 0xffffff, 0.85).setOrigin(0, 0.5).setDepth(d - 1);
    this.barBg = this.box(barX - 2, barY, barW + 4, 30, 0x120a22, 0.9).setOrigin(0, 0.5).setDepth(d);
    this.barFill = this.box(barX, barY, barW, 24, 0xd1203b).setOrigin(0, 0.5).setDepth(d + 1);
    this.barLabel = this.txt(barX, barY - 34, 'BLOOD', 22, '#ff8fa3', { ox: 0 });
    this.scoreText = this.txt(W - 44, 40, '0', 56, '#ffffff', { ox: 1 });
    this.bestText = this.txt(W - 44, 88, '', 22, '#c7b8ff', { ox: 1 });
    this.chainText = this.txt(W / 2, 100, '', 54, '#ffd166').setVisible(false);
    this.hintText = this.txt(W / 2, 200, '', 30, '#ffffff').setVisible(false);
    this.hud.push(this.barBorder, this.barBg, this.barFill, this.barLabel, this.scoreText, this.bestText, this.chainText, this.hintText);
  }

  buildTitle() {
    const d = 45;
    this.titleGroup = [];
    const t1 = this.txt(W / 2, 175, 'BITE', 150, '#ff5c7a', { depth: d, style: { strokeThickness: 14 } });
    const t2 = this.txt(W / 2, 300, '& BOUNCE', 110, '#ffd166', { depth: d, style: { strokeThickness: 12 } });
    this.titleTween = this.tweens.add({ targets: [t1, t2], scale: { from: 0.97, to: 1.04 }, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    const sub = this.txt(W / 2, 395, 'The sun is rising. Hop from shadow to shadow.\nLand on villagers to bite and bounce!', 28, '#e8dcff', { depth: d });
    this.startText = this.txt(W / 2, 490, 'TAP  /  SPACE  TO  START', 40, '#ffffff', { depth: d });
    this.tweens.add({ targets: this.startText, alpha: 0.25, duration: 520, yoyo: true, repeat: -1 });
    this.howText = this.txt(W / 2, 545, 'TAP = HOP     HOLD = HIGHER     STAY IN THE SHADE', 22, '#9fe3ff', { depth: d });
    this.titleBest = this.txt(W / 2, 660, '', 24, '#c7b8ff', { depth: d });
    this.jamText = this.txt(W / 2, 698, 'Goedware Halloween Jam III  -  "It only comes out at night"', 16, '#8d7fb8', { depth: d, style: { strokeThickness: 3 } });
    this.soundBtn = this.txt(W - 30, H - 30, '', 22, '#ffffff', { depth: d, ox: 1, oy: 1 });
    this.soundBtn.setPadding(14, 10).setInteractive({ useHandCursor: true });
    this.soundBtn.on('pointerdown', () => this.toggleMute());
    this.fsBtn = this.txt(30, H - 30, 'FULLSCREEN', 22, '#ffffff', { depth: d, ox: 0, oy: 1 });
    this.fsBtn.setPadding(14, 10).setInteractive({ useHandCursor: true });
    this.fsBtn.on('pointerdown', () => this.toggleFullscreen());
    if (!document.fullscreenEnabled && !document.webkitFullscreenEnabled) this.fsBtn.setVisible(false);
    this.titleGroup.push(t1, t2, sub, this.startText, this.howText, this.titleBest, this.jamText, this.soundBtn, this.fsBtn);
    this.refreshSoundBtn();
  }

  buildDead() {
    const d = 48;
    this.deadGroup = [];
    this.deadDim = this.box(W / 2, H / 2, W + 200, H + 200, 0x07030f, 0.62).setDepth(d - 1);
    const t = this.txt(W / 2, 200, 'TURNED TO ASH', 110, '#ff8a3d', { depth: d, style: { strokeThickness: 12 } });
    this.deadScore = this.txt(W / 2, 330, '', 60, '#ffffff', { depth: d });
    this.deadBest = this.txt(W / 2, 400, '', 32, '#c7b8ff', { depth: d });
    this.deadStats = this.txt(W / 2, 455, '', 24, '#e8dcff', { depth: d });
    this.retryText = this.txt(W / 2, 560, 'TAP / SPACE TO RETRY', 44, '#ffffff', { depth: d });
    this.tweens.add({ targets: this.retryText, alpha: 0.25, duration: 520, yoyo: true, repeat: -1 });
    this.deadGroup.push(this.deadDim, t, this.deadScore, this.deadBest, this.deadStats, this.retryText);
    this.deadTitle = t;
  }

  // ---------------------------------------------------------------- input
  setupInput() {
    this.input.addPointer(2);
    this.input.on('pointerdown', (p, over) => {
      if (over && over.length) return; // boutons
      this.downIds.add(p.id);
      this.press();
    });
    const up = (p) => { this.downIds.delete(p.id); if (!this.downIds.size) this.release(); };
    this.input.on('pointerup', up);
    this.input.on('pointerupoutside', up);
    const kb = this.input.keyboard;
    for (const k of ['SPACE', 'UP', 'W', 'ENTER']) {
      kb.on(`keydown-${k}`, (e) => { if (!e.repeat) this.press(); });
      kb.on(`keyup-${k}`, () => this.release());
    }
    kb.on('keydown-M', () => this.toggleMute());
    kb.on('keydown-F', () => this.toggleFullscreen());
    this.game.events.on('hidden', () => sfx.suspend());
    this.game.events.on('visible', () => sfx.unlock());
  }

  press() {
    sfx.unlock();
    this.held = true;
    this.buffer = BUFFER;
    if (this.state === 'title') this.startRun();
    else if (this.state === 'dead' && this.deadT > 0.6) { this.resetRun(); this.startRun(); }
  }

  release() {
    this.held = false;
    const P = this.P;
    if (this.state === 'play' && P.canCut && P.vy < 0) { P.vy *= CUT; P.canCut = false; }
  }

  toggleMute() { sfx.unlock(); sfx.setMuted(!sfx.muted); this.refreshSoundBtn(); if (!sfx.muted) sfx.ui(); }
  refreshSoundBtn() { this.soundBtn.setText(sfx.muted ? 'SOUND: OFF  [M]' : 'SOUND: ON  [M]'); }
  toggleFullscreen() { this.scale.isFullscreen ? this.scale.stopFullscreen() : this.scale.startFullscreen(); }

  // ---------------------------------------------------------------- états
  setState(s) {
    this.state = s;
    const title = s === 'title', dead = s === 'dead';
    this.titleGroup.forEach((o) => o.setVisible(title));
    this.deadGroup.forEach((o) => o.setVisible(dead));
    if (s === 'play') this.hud.forEach((o) => o.setVisible(true));
    this.hud.forEach((o) => { if (title) o.setVisible(false); });
    this.chainText.setVisible(false);
    this.hintText.setVisible(false);
    this.pl.setVisible(s !== 'dead');
    this.titleBest.setText(this.best ? `BEST  ${this.best}` : '');
    if (dead) this.deadT = 0;
  }

  resetRun() {
    for (const k of Object.keys(this.entities)) {
      this.entities[k].forEach((e) => e.c.destroy());
      this.entities[k].length = 0;
    }
    this.fx.clear();
    this.t = 0; this.I = 0.1; this.speed = 140;
    this.blood = MAX_BLOOD; this.bonus = 0; this.dist = 0;
    this.chain = 0; this.maxChain = 0; this.bites = 0; this.bestChain = 0;
    this.buffer = 0; this.smokeT = 0; this.trailT = 0; this.dustT = 0; this.hurtFlash = 0;
    this.timeScale = 1; this.hitstop = 0; this.deadT = 0;
    const P = this.P;
    Object.assign(P, { y: GROUND, prevY: GROUND, vy: 0, grounded: true, sx: 1, sy: 1, inv: 0, canCut: false, phase: 0 });
    this.pl.setPosition(PX, GROUND).setScale(1).setAlpha(1).setVisible(true);
    // zone d'ombre de départ + premières sections
    this.addShade(-300, 1100);
    this.nextX = 800;
    while (this.nextX < W + 800) this.nextX = this.spawnSection(this.nextX);
    this.cameras.main.setZoom(1);
    this.burnOverlay.setAlpha(0);
    sfx.setIntensity(0);
  }

  startRun() {
    this.resetRun();
    this.setState('play');
    sfx.startMusic();
    sfx.ui();
    this.hintT = 6;
    this.hintText.setText('HOLD to jump higher - land on villagers!').setVisible(true).setAlpha(1);
  }

  // ---------------------------------------------------------------- génération
  addShade(x, w) {
    const bw = rand(150, 230), bh = rand(230, 440);
    const col = this.box(0, 0, w, H, 0x05020c, 0.5).setOrigin(0, 0);
    const bx = w - bw - rand(0, 40);
    const bld = this.box(bx, GROUND, bw, bh, 0x120a22).setOrigin(0, 1);
    const kids = [bld];
    const cols = Math.max(2, (bw / 46) | 0), rows = Math.max(2, ((bh - 30) / 56) | 0);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (Math.random() < 0.45) {
          kids.push(this.box(bx + 18 + c * ((bw - 36) / cols), GROUND - bh + 24 + r * 56, 18, 26, 0xffd36b, 0.85).setOrigin(0, 0));
        }
      }
    }
    // petite rangée de "lampadaire" (carré + rond) pour que la zone soit lisible
    const lampX = Math.max(30, bx - rand(120, 260));
    kids.push(this.box(lampX, GROUND, 8, 150, 0x2a1a4a).setOrigin(0.5, 1));
    kids.push(this.dot(lampX, GROUND - 156, 14, 0xffe08a, 0.95));
    kids.push(col);
    const c = this.add.container(x, 0, kids).setDepth(9);
    this.entities.shades.push({ x, w, c, col });
  }

  makeVillager(x, big) {
    const s = big ? 1.4 : 1;
    const color = big ? 0xa14b3a : pick(VILLAGER_COLORS);
    const a = this.add;
    const leg1 = this.box(-8, -6, 10, 12, 0x2b1d14);
    const leg2 = this.box(8, -6, 10, 12, 0x2b1d14);
    const body = this.box(0, -34, 34, 44, color);
    const fork = this.box(24, -42, 4, 66, 0x5a3b1c);
    const prong = this.box(24, -78, 14, 4, 0x9aa0a6);
    const prong1 = this.box(18, -83, 3, 8, 0x9aa0a6);
    const prong2 = this.box(30, -83, 3, 8, 0x9aa0a6);
    const head = this.dot(0, -66, 15, SKIN);
    const hat = this.box(0, -78, 32, 7, 0x3b2a1a);
    const hat2 = this.box(0, -86, 18, 12, 0x3b2a1a);
    const eyeL = this.dot(-5, -67, 2.6, 0x1b1020);
    const eyeR = this.dot(5, -67, 2.6, 0x1b1020);
    const mouth = this.dot(0, -58, 3, 0x1b1020);
    const c = this.add.container(x, GROUND, [leg1, leg2, fork, prong, prong1, prong2, body, head, hat, hat2, eyeL, eyeR, mouth]).setDepth(12).setScale(s);
    return {
      c, kind: 'villager', x, big, w: 34 * s, top: GROUND - 92 * s + 8 * s, h: 92 * s,
      walk: big ? 40 : 90, ph: rand(0, 6), dead: false, hit: false,
      parts: { leg1, leg2, eyeL, eyeR, mouth }, s,
    };
  }

  spawnVillager(x, big) {
    this.entities.villagers.push(this.makeVillager(x, big));
  }

  spawnGarlic(x, y) {
    const a = this.add;
    const bulb = this.dot(0, 0, 22, 0xf4f0d8);
    const c1 = this.dot(-12, 4, 11, 0xe7e2c4);
    const c2 = this.dot(12, 4, 11, 0xe7e2c4);
    const tip = this.box(0, -26, 6, 14, 0xb9d68a);
    const e1 = this.dot(-6, -2, 2.6, 0x2c5c1e);
    const e2 = this.dot(6, -2, 2.6, 0x2c5c1e);
    const c = this.add.container(x, y, [c1, c2, bulb, tip, e1, e2]).setDepth(13);
    this.entities.garlics.push({ c, x, baseY: y, ph: rand(0, 6), r: 24 });
  }

  spawnOrb(x, y) {
    const o = this.dot(0, 0, 11, 0xd1203b);
    const h = this.dot(-3, -3, 3.5, 0xff9aa9);
    const c = this.add.container(x, y, [o, h]).setDepth(13);
    this.entities.orbs.push({ c, x, baseY: y, ph: rand(0, 6) });
  }

  // une "section" = zone ensoleillée (avec contenu) + zone d'ombre
  spawnSection(startX) {
    const I = this.I || 0;
    const gap = lerp(430, 1350, I) * rand(0.88, 1.12);
    const shadeLen = lerp(760, 400, I) * rand(0.92, 1.1);
    let c = startX + 170;
    const end = startX + gap - 140;
    while (c < end) {
      const r = Math.random();
      const garlicW = 0.12 + I * 0.2;
      if (r < 0.42) {
        this.spawnVillager(c, Math.random() < 0.28);
        c += rand(280, 400);
      } else if (r < 0.66) {
        const n = pick([2, 2, 3]);
        for (let i = 0; i < n; i++) { this.spawnVillager(c, Math.random() < 0.2); c += rand(330, 460); }
      } else if (r < 0.66 + garlicW) {
        const n = pick([1, 1, 2]);
        for (let i = 0; i < n; i++) { this.spawnGarlic(c + i * 90, GROUND - rand(70, 190)); }
        c += 90 * n + rand(210, 320);
      } else {
        const n = 6, span = 280, hgt = rand(90, 170);
        for (let i = 0; i < n; i++) {
          const k = i / (n - 1);
          this.spawnOrb(c + k * span, GROUND - 40 - Math.sin(k * Math.PI) * hgt);
        }
        c += span + 120;
      }
    }
    const shadeX = startX + gap;
    this.addShade(shadeX, shadeLen);
    // quelques orbes dans l'ombre pour récompenser le repos
    if (Math.random() < 0.6) {
      for (let i = 0; i < 3; i++) this.spawnOrb(shadeX + shadeLen * 0.3 + i * 70, GROUND - 40);
    }
    if (Math.random() < 0.3) this.spawnVillager(shadeX + shadeLen * 0.55, false);
    return shadeX + shadeLen;
  }

  // ================================================================ boucle
  update(time, delta) {
    const raw = Math.min(delta / 1000, 1 / 20);
    this.fx.update(raw * (this.state === 'dead' ? this.timeScale : 1));

    let dt = raw * this.timeScale;
    if (this.hitstop > 0) { this.hitstop -= raw; dt = 0; }

    if (this.state === 'title') this.updateTitle(raw);
    else if (this.state === 'play') this.updatePlay(dt);
    else if (this.state === 'dead') this.updateDead(raw);

    this.updateShake(raw);
  }

  // ---- écran titre : le vampire fait des petits sauts automatiques
  updateTitle(dt) {
    this.I = 0.1;
    this.scrollWorld(150, dt);
    const P = this.P;
    if (P.grounded) { this.titleHop = (this.titleHop || 0) + dt; if (this.titleHop > 0.9) { this.titleHop = 0; P.vy = -560; P.grounded = false; P.sx = 0.8; P.sy = 1.3; } }
    P.vy += GRAVITY * dt; P.y += P.vy * dt;
    if (P.y >= GROUND) { P.y = GROUND; P.vy = 0; if (!P.grounded) { P.sx = 1.25; P.sy = 0.75; } P.grounded = true; }
    this.drawPlayer(dt, 150, false);
  }

  updateDead(dt) {
    this.deadT += dt;
    this.timeScale = this.deadT < 0.55 ? lerp(0.25, 1, this.deadT / 0.55) : 1;
    this.speed = Math.max(0, this.speed - this.speed * 4 * dt);
    this.scrollWorld(this.speed, dt * this.timeScale);
    if (this.deadT > 0.45 && !this.deadShown) {
      this.deadShown = true;
      this.deadGroup.forEach((o) => o.setVisible(true));
      const fade = this.deadGroup.slice(1, -1); // le texte "retry" a son propre clignotement
      fade.forEach((o) => o.setAlpha(0));
      this.tweens.add({ targets: fade, alpha: 1, duration: 300 });
      this.deadTitle.setScale(1.6);
      this.tweens.add({ targets: this.deadTitle, scale: 1, duration: 380, ease: 'Back.out' });
    }
  }

  // ---- partie
  updatePlay(dt) {
    const P = this.P;
    this.t += dt;
    this.I = clamp(this.t / 105);
    this.speed = lerp(390, 720, clamp(this.t / 125));
    const speed = this.speed;
    this.dist += speed * dt;
    sfx.setIntensity(this.I);

    this.scrollWorld(speed, dt);
    this.updateEntities(dt, speed);

    // spawn
    this.nextX -= speed * dt;
    while (this.nextX < W + 900) this.nextX = this.spawnSection(this.nextX);

    // --- physique du vampire
    if (this.buffer > 0) this.buffer -= dt;
    P.prevY = P.y;
    if (P.grounded && this.buffer > 0) this.jump();
    const gmul = (P.vy < 0 && this.held) ? HOLD_GRAVITY : 1;
    P.vy += GRAVITY * gmul * dt;
    P.y += P.vy * dt;
    if (P.y >= GROUND) {
      P.y = GROUND;
      if (!P.grounded) this.land();
      P.vy = 0; P.grounded = true;
    } else if (P.y < GROUND - 1) { P.grounded = false; }
    if (P.inv > 0) P.inv -= dt;

    // --- collisions
    this.collide(dt);

    // --- soleil / ombre
    const inShade = this.entities.shades.some((z) => z.x <= PX && PX <= z.x + z.w);
    this.inShade = inShade;
    if (inShade) {
      this.blood = Math.min(MAX_BLOOD, this.blood + 9 * dt);
      this.smokeT = 0;
      this.dustT += dt;
    } else {
      this.blood -= (8 + 30 * this.I) * dt;
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = 0.045;
        this.fx.spawn('circle', PX + rand(-18, 18), P.y - rand(10, 60), { vx: rand(-60, 20), vy: rand(-170, -80), life: rand(0.4, 0.8), size: rand(10, 20), color: pick([0x6b6b78, 0x4a4a55, 0x8a8a96]), alpha: 0.8 });
        if (Math.random() < 0.55) this.fx.spawn('square', PX + rand(-20, 20), P.y - rand(10, 60), { vx: rand(-80, 40), vy: rand(-240, -120), life: rand(0.3, 0.6), size: rand(4, 8), color: pick([0xff7a1a, 0xffc24d, 0xff3b1f]) });
      }
      this.sizzleT = (this.sizzleT || 0) - dt;
      if (this.sizzleT <= 0) { this.sizzleT = 0.35; sfx.sizzle(); }
    }
    if (inShade && this.blood < MAX_BLOOD) {
      this.healT = (this.healT || 0) - dt;
      if (this.healT <= 0) {
        this.healT = 0.12;
        this.fx.spawn('circle', PX + rand(-24, 24), P.y - rand(5, 50), { vx: 0, vy: -90, life: 0.5, size: rand(5, 9), color: 0x7fd6ff, alpha: 0.8 });
      }
    }
    this.blood = clamp(this.blood, 0, MAX_BLOOD);

    // traînée en l'air + poussière de course
    if (!P.grounded) {
      this.trailT -= dt;
      if (this.trailT <= 0) { this.trailT = 0.035; this.fx.spawn('square', PX - 8, P.y - 28, { life: 0.28, size: 40, color: 0x8d1b2f, alpha: 0.35, depth: 14 }); }
    } else {
      this.dustT -= dt;
      if (this.dustT <= 0) { this.dustT = 0.07; this.fx.spawn('circle', PX - 18, GROUND - 4, { vx: -speed * 0.5, vy: rand(-90, -20), life: 0.35, size: rand(6, 12), color: 0x6a5a90, alpha: 0.6 }); }
    }

    this.drawPlayer(dt, speed, true);
    this.updateHud(dt);

    // aube + mort
    if (this.blood <= 0) this.die();
  }

  jump() {
    const P = this.P;
    P.vy = -JUMP_V; P.grounded = false; P.canCut = true; this.buffer = 0;
    P.sx = 0.78; P.sy = 1.3;
    sfx.jump();
    this.fx.burst('circle', PX, GROUND - 2, 6, { speed: 160, spread: 1.6, angle: -Math.PI / 2, life: 0.3, size: 8, color: 0x8f7fc4, alpha: 0.7, g: 400 });
  }

  land() {
    const P = this.P;
    const hard = P.vy > 900;
    P.sx = hard ? 1.45 : 1.25; P.sy = hard ? 0.62 : 0.78;
    P.canCut = false;
    this.chain = 0;
    this.chainText.setVisible(false);
    sfx.land();
    if (hard) this.shakeAmt = Math.max(this.shakeAmt, 5);
    this.fx.burst('circle', PX, GROUND - 3, hard ? 12 : 7, { speed: 260, spread: 2.4, angle: -Math.PI / 2, life: 0.4, size: hard ? 12 : 9, color: 0x8f7fc4, alpha: 0.75, g: 500 });
  }

  bounce(v) {
    const P = this.P;
    const holdBonus = this.held || this.buffer > 0 ? BOUNCE_HOLD_V : BOUNCE_V;
    P.vy = -(holdBonus + (v.big ? 70 : 0) + Math.min(this.chain, 5) * 18);
    P.grounded = false; P.canCut = false; this.buffer = 0;
    P.sx = 0.7; P.sy = 1.4;
  }

  collide(dt) {
    const P = this.P;
    const feet = P.y, prev = P.prevY, top = feet - 52;
    const E = this.entities;

    for (const v of E.villagers) {
      if (v.dead) continue;
      const dx = Math.abs(v.x - PX);
      if (dx > 24 + v.w / 2 + 36) continue;
      const falling = P.vy > 0;
      if (falling && feet >= v.top && prev <= v.top + 30) {
        this.biteVillager(v);
      } else if (!v.hit && feet > v.top + 24 && top < GROUND && dx < 24 + v.w / 2 - 2) {
        v.hit = true;
        if (P.inv <= 0) this.hurt(9, v.x, 'WHACK!');
      }
    }
    for (const g of E.garlics) {
      if (g.gone) continue;
      const gx = g.x, gy = g.c.y;
      const nx = clamp(gx, PX - 22, PX + 22), ny = clamp(gy, top + 4, feet - 4);
      if ((gx - nx) ** 2 + (gy - ny) ** 2 < (g.r - 3) ** 2) {
        g.gone = true;
        this.fx.burst('circle', gx, gy, 10, { speed: 320, life: 0.5, size: 10, color: 0xdff2b0 });
        g.c.setVisible(false);
        if (P.inv <= 0) this.hurt(18, gx, 'GARLIC!');
      }
    }
    for (const o of E.orbs) {
      if (o.gone) continue;
      const dxo = PX - o.x, dyo = (feet - 26) - o.c.y;
      const d2 = dxo * dxo + dyo * dyo;
      if (d2 < 170 * 170) { // aimant
        const k = Math.min(1, dt * 9);
        o.x += dxo * k; o.c.y += dyo * k;
        o.baseY = o.c.y; o.magnet = true;
      }
      if (d2 < 40 * 40) {
        o.gone = true; o.c.setVisible(false);
        this.blood = Math.min(MAX_BLOOD, this.blood + 2.5);
        this.bonus += 10;
        sfx.orb();
        this.fx.burst('circle', o.x, o.c.y, 5, { speed: 200, life: 0.35, size: 7, color: 0xff5c7a });
      }
    }
  }

  biteVillager(v) {
    v.dead = true;
    this.chain += 1;
    this.bites += 1;
    this.maxChain = Math.max(this.maxChain, this.chain);
    const gain = 18 + Math.min(this.chain, 5) * 4 + (v.big ? 12 : 0);
    this.blood = Math.min(MAX_BLOOD, this.blood + gain);
    const pts = (v.big ? 250 : 100) * this.chain;
    this.bonus += pts;
    this.bounce(v);
    this.hitstop = 0.055;
    this.shakeAmt = Math.max(this.shakeAmt, 7 + this.chain);
    sfx.bite(this.chain);
    // juice
    this.fx.burst('circle', v.x, v.c.y - v.top + GROUND - 20, 18, { speed: 460, spread: 3.2, angle: -Math.PI / 2, life: 0.7, size: 12, color: pick([0xd1203b, 0xff3b5c, 0x9d0e26]), g: 1400 });
    this.fx.burst('square', v.x, GROUND - 30, 8, { speed: 300, life: 0.5, size: 10, color: v.big ? 0xa14b3a : 0xf2c9a0, g: 900, spin: 8 });
    this.fx.spawn('circle', v.x, GROUND - 30, { life: 0.25, size: 120, color: 0xffffff, alpha: 0.6, shrink: false });
    this.popup(v.x, GROUND - v.h - 10, `+${pts}`, '#ffd166', 34 + this.chain * 3);
    const cam = this.cameras.main;
    this.tweens.killTweensOf(cam);
    cam.setZoom(1.045 + Math.min(this.chain, 5) * 0.004);
    this.tweens.add({ targets: cam, zoom: 1, duration: 260, ease: 'Quad.out' });
    this.plParts.mouth.setDisplaySize(22, 10);
    this.time.delayedCall(120, () => this.plParts.mouth.setDisplaySize(22, 4));
    if (this.chain >= 2) {
      this.chainText.setText(`CHAIN x${this.chain}`).setVisible(true).setScale(1.5).setAlpha(1);
      this.tweens.add({ targets: this.chainText, scale: 1, duration: 200, ease: 'Back.out' });
    }
    v.c.destroy();
  }

  hurt(dmg, x, label) {
    const P = this.P;
    this.blood = Math.max(0, this.blood - dmg);
    P.inv = 0.9;
    P.vy = Math.min(P.vy, -380); P.grounded = false; P.canCut = false;
    P.sx = 1.3; P.sy = 0.8;
    this.chain = 0; this.chainText.setVisible(false);
    this.hitstop = 0.08;
    this.hurtFlash = 0.35;
    this.shakeAmt = 14;
    sfx.hurt();
    this.cameras.main.flash(120, 255, 90, 60);
    this.fx.burst('square', PX, P.y - 30, 14, { speed: 380, life: 0.5, size: 10, color: pick([0xff7a1a, 0xffd166, 0xffffff]), g: 700 });
    this.popup(PX, P.y - 90, label, '#ff6b4a', 38);
  }

  die() {
    this.state = 'dead';
    this.deadT = 0; this.deadShown = false;
    this.timeScale = 0.25;
    sfx.die();
    sfx.stopMusic();
    const P = this.P;
    const cam = this.cameras.main;
    cam.flash(160, 255, 220, 160);
    this.shakeAmt = 26;
    this.pl.setVisible(false);
    this.fx.burst('square', PX, P.y - 30, 34, { speed: 560, life: 1.1, size: 16, color: pick([0x3a3a46, 0x5a5a66, 0x20123b]), g: 500, spin: 6, drag: 1.2 });
    this.fx.burst('circle', PX, P.y - 30, 26, { speed: 420, life: 1.0, size: 14, color: pick([0xff7a1a, 0xffc24d, 0xff3b1f, 0x888894]), g: -120, drag: 1.4 });
    const score = this.score();
    const isBest = score > this.best;
    if (isBest) { this.best = score; saveBest(score); }
    this.deadScore.setText(`SCORE  ${score}`);
    this.deadBest.setText(isBest ? 'NEW BEST!' : `BEST  ${this.best}`).setColor(isBest ? '#ffd166' : '#c7b8ff');
    this.deadStats.setText(`${this.bites} bites     best chain x${this.maxChain}     ${(this.dist / 100) | 0} m`);
    this.deadGroup.forEach((o) => o.setVisible(false));
    this.hud.forEach((o) => { if (o !== this.scoreText && o !== this.bestText) o.setVisible(false); });
    this.burnOverlay.setAlpha(0.25);
  }

  score() { return ((this.dist / 40) | 0) + this.bonus; }

  popup(x, y, str, color, size) {
    const t = this.txt(x, y, str, size, color, { depth: 35 });
    t.setScale(0.5);
    this.tweens.add({ targets: t, scale: 1.15, duration: 120, ease: 'Back.out' });
    this.tweens.add({ targets: t, y: y - 70, alpha: 0, delay: 250, duration: 550, onComplete: () => t.destroy() });
  }

  // ---------------------------------------------------------------- entités
  updateEntities(dt, speed) {
    const E = this.entities;
    const rm = (arr, fn) => { for (let i = arr.length - 1; i >= 0; i--) { if (fn(arr[i])) { arr[i].c.destroy(); arr.splice(i, 1); } } };

    for (const z of E.shades) { z.x -= speed * dt; z.c.x = z.x; }
    rm(E.shades, (z) => z.x + z.w < -80);

    for (const v of E.villagers) {
      v.x -= (speed + v.walk) * dt;
      v.c.x = v.x;
      v.ph += dt * 14;
      const bob = Math.abs(Math.sin(v.ph)) * 5;
      v.c.y = GROUND - bob;
      v.parts.leg1.y = -6 - Math.max(0, Math.sin(v.ph)) * 6;
      v.parts.leg2.y = -6 - Math.max(0, -Math.sin(v.ph)) * 6;
      const near = v.x - PX < 420 && v.x > PX - 40;
      const mk = near ? 1.9 : 1, ek = near ? 1.5 : 1;
      v.parts.mouth.setDisplaySize(6 * mk, 6 * mk);
      v.parts.eyeL.setDisplaySize(5.2 * ek, 5.2 * ek);
      v.parts.eyeR.setDisplaySize(5.2 * ek, 5.2 * ek);
    }
    rm(E.villagers, (v) => v.x < -120);

    for (const g of E.garlics) {
      g.x -= speed * dt; g.c.x = g.x; g.ph += dt * 4;
      g.c.y = g.baseY + Math.sin(g.ph) * 9;
      g.c.rotation = Math.sin(g.ph * 0.7) * 0.25;
    }
    rm(E.garlics, (g) => g.x < -80 || g.gone);

    for (const o of E.orbs) {
      o.x -= speed * dt; o.c.x = o.x; o.ph += dt * 5;
      if (!o.magnet) o.c.y = o.baseY + Math.sin(o.ph) * 5;
      o.c.setScale(1 + Math.sin(o.ph * 1.5) * 0.12);
    }
    rm(E.orbs, (o) => o.x < -60 || o.gone);
  }

  // ---------------------------------------------------------------- rendu
  drawPlayer(dt, speed, playing) {
    const P = this.P, pl = this.pl, pp = this.plParts;
    P.sx += (1 - P.sx) * Math.min(1, dt * 14);
    P.sy += (1 - P.sy) * Math.min(1, dt * 14);
    pl.setPosition(PX, P.y).setScale(P.sx, P.sy);
    P.phase += dt * speed * 0.03;
    if (P.grounded) {
      pp.foot1.y = -4 - Math.max(0, Math.sin(P.phase)) * 9;
      pp.foot2.y = -4 - Math.max(0, -Math.sin(P.phase)) * 9;
    } else { pp.foot1.y = -10; pp.foot2.y = -10; }
    pp.capeTail.setAngle(clamp(-P.vy / 40, -25, 25) + Math.sin(P.phase * 1.5) * 6);
    // clignotement invulnérable + brûlure
    if (playing) {
      if (P.inv > 0) pl.setAlpha(Math.sin(this.t * 60) > 0 ? 1 : 0.25); else pl.setAlpha(1);
      pp.body.setFillStyle(!this.inShade && Math.sin(this.t * 40) > 0 ? 0xb8431f : 0x5b34a8);
    }
  }

  updateHud(dt) {
    const pct = this.blood / MAX_BLOOD;
    this.barFill.setDisplaySize(Math.max(0.01, this.barW * pct), 24);
    const low = pct < 0.3;
    this.barFill.setFillStyle(low ? (Math.sin(this.t * 14) > 0 ? 0xff5c3a : 0xd1203b) : lerpColor(0xd1203b, 0xff3b5c, pct));
    this.barBorder.setFillStyle(low ? 0xff5c3a : 0xffffff);
    this.barLabel.setScale(low ? 1 + Math.sin(this.t * 14) * 0.06 : 1);
    this.scoreText.setText(String(this.score()));
    this.bestText.setText(this.best ? `BEST ${this.best}` : '');
    // voile rouge : plus il reste peu de sang et plus on est au soleil
    let a = 0;
    if (!this.inShade) a = 0.04 + 0.13 * (1 - pct) + 0.05 * this.I;
    if (low) a += 0.08 + Math.sin(this.t * 12) * 0.05;
    if (this.hurtFlash > 0) { this.hurtFlash -= dt; a += 0.2; }
    this.burnOverlay.setAlpha(clamp(a, 0, 0.5));
    if (this.hintT > 0) {
      this.hintT -= dt;
      if (this.hintT < 1.2) this.hintText.setAlpha(clamp(this.hintT / 1.2));
      if (this.hintT <= 0) this.hintText.setVisible(false);
    }
    if (this.chain < 2) this.chainText.setVisible(false);
  }

  // décor : parallaxe, ciel, soleil, sol
  scrollWorld(speed, dt) {
    const I = this.I;
    const sky = skyColor(I);
    this.sky.setFillStyle(sky);
    const hc = lerpColor(0x7a2b8a, 0xff8a3d, I);
    for (const h of this.horizons) h.setFillStyle(hc).setAlpha(clamp(I * 0.14, 0, 0.14));
    this.cameras.main.setBackgroundColor(sky);

    const starA = clamp(1 - I * 1.4);
    for (const s of this.stars) { s.setAlpha(starA * (0.55 + 0.45 * Math.sin(this.time.now / 400 + s.ph))); }
    this.moonGlow.setAlpha(0.12 * starA);
    this.moon.setAlpha(starA);
    this.moonCut.setFillStyle(sky).setAlpha(starA);

    const sy = lerp(H + 170, 360, clamp(I * 1.15));
    this.sun.setY(sy);
    const gs = 380 * (1 + Math.sin(this.time.now / 500) * 0.04);
    this.sunGlow.setY(sy).setDisplaySize(gs, gs);
    this.sun.setAlpha(clamp(I * 3));
    this.sunGlow2.setY(sy).setAlpha(clamp(I * 1.3) * 0.14);
    this.sunGlow.setAlpha(clamp(I * 1.3) * 0.28);

    const cols = [lerpColor(0x1a0f33, 0x6a2c46, I), lerpColor(0x110826, 0x43203a, I)];
    this.layers.forEach((L, li) => {
      let maxR = -1e9;
      for (const r of L.rects) maxR = Math.max(maxR, r.x + r.displayWidth);
      for (const r of L.rects) {
        r.x -= speed * L.factor * dt;
        if (r.x + r.displayWidth < -40) {
          const w = rand(70, 190);
          r.setDisplaySize(w, rand(80, li ? 220 : 270));
          r.x = maxR + rand(0, 16);
          maxR = r.x + r.displayWidth;
        }
        r.setFillStyle(cols[li]);
      }
    });

    this.ground.setFillStyle(lerpColor(0x241640, 0x7a4a34, I));
    this.groundTop.setFillStyle(lerpColor(0x4a2f7a, 0xffb86b, I));
    const dcol = lerpColor(0x3a2566, 0x946040, I);
    for (const d of this.dashes) {
      d.x -= speed * dt;
      if (d.x < -90) d.x += 1440;
      d.setFillStyle(dcol);
    }
    const sl = clamp((speed - 300) / 420);
    for (const l of this.speedLines) {
      l.x -= speed * 2.6 * dt;
      if (l.x < -220) { l.x = W + rand(0, 300); l.y = rand(30, GROUND - 30); }
      l.setAlpha(0.03 + sl * 0.18);
    }
  }

  updateShake(dt) {
    const cam = this.cameras.main;
    if (this.shakeAmt > 0.2) {
      cam.setScroll(rand(-1, 1) * this.shakeAmt, rand(-1, 1) * this.shakeAmt);
      this.shakeAmt *= Math.max(0, 1 - 12 * dt);
    } else if (cam.scrollX || cam.scrollY) cam.setScroll(0, 0);
  }
}
