import Phaser from 'phaser';
import { W, H, GROUND, PX, FONT, clamp, lerp, rand, pick, lerpColor } from '../config.js';
import { Fx } from '../fx.js';
import { sfx } from '../audio.js';
import { Cycle, DAWN_WARN } from '../cycle.js';
import * as Art from '../art.js';
const { COLORS, DIMS } = Art;

// ---------------------------------------------------------------- réglages
const GRAVITY = 2600;
const HOLD_GRAVITY = 0.6;     // gravité réduite en montée quand on maintient
const JUMP_V = 800;
const CUT = 0.4;              // relâcher tôt = petit saut
const BOUNCE_V = 690;         // rebond sur villageois (sans maintenir)
const BOUNCE_HOLD_V = 880;    // rebond en maintenant
const BUFFER = 0.13;          // buffer d'input
const COYOTE = 0.1;           // saut toléré juste après avoir quitté une plateforme
const MAX_BLOOD = 100;
const HEAL_RATE = 9;          // sang/s récupéré sur une plateforme d'ombre
const BEST_KEY = 'bb_best';
const HALF_W = 22;            // demi-largeur de support du vampire

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
    this.D = 0;
    this.cycle = new Cycle();
    this.entities = { shelters: [], villagers: [], garlics: [], orbs: [] };

    this.cameras.main.setBackgroundColor(COLORS.skyNight);
    Art.initShapes(this);
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

  // --- formes (voir art.js)
  box(x, y, w, h, color, alpha) { return Art.box(this, x, y, w, h, color, alpha); }
  dot(x, y, r, color, alpha) { return Art.dot(this, x, y, r, color, alpha); }

  // ---------------------------------------------------------------- décor
  buildBackground() {
    this.bg = Art.createBackground(this);
    this.burnOverlay = this.box(W / 2, H / 2, W + 200, H + 200, COLORS.burnOverlay, 0).setDepth(30);
  }

  // ---------------------------------------------------------------- joueur
  buildPlayer() {
    this.plArt = Art.createPlayer(this);
    this.pl = this.plArt.c.setPosition(PX, GROUND);
    this.P = { y: GROUND, prevY: GROUND, vy: 0, grounded: true, plat: null, sx: 1, sy: 1, inv: 0, canCut: false };
  }

  // ---------------------------------------------------------------- HUD
  buildHud() {
    const d = 40;
    this.hud = [];
    // sang (haut gauche)
    const barX = 44, barY = 58, barW = 380;
    this.barW = barW;
    this.barBorder = this.box(barX - 5, barY, barW + 10, 36, 0xffffff, 0.85).setOrigin(0, 0.5).setDepth(d - 1);
    this.barBg = this.box(barX - 2, barY, barW + 4, 30, 0x120a22, 0.9).setOrigin(0, 0.5).setDepth(d);
    this.barFill = this.box(barX, barY, barW, 24, 0xd1203b).setOrigin(0, 0.5).setDepth(d + 1);
    this.barLabel = this.txt(barX, barY - 34, 'BLOOD', 22, '#ff8fa3', { ox: 0 });
    // phase (haut centre) : nom + temps restant avant le changement
    const pw = 330, px = W / 2 - pw / 2, py = 66;
    this.phW = pw;
    this.phLabel = this.txt(W / 2, 30, 'NIGHT 1', 38, '#9fb3ff');
    this.phBorder = this.box(px - 4, py, pw + 8, 24, 0xffffff, 0.85).setOrigin(0, 0.5).setDepth(d - 1);
    this.phBg = this.box(px - 2, py, pw + 4, 20, 0x120a22, 0.9).setOrigin(0, 0.5).setDepth(d);
    this.phFill = this.box(px, py, pw, 14, 0x6c8cff).setOrigin(0, 0.5).setDepth(d + 1);
    this.phX = px;
    // score (haut droite)
    this.scoreText = this.txt(W - 44, 40, '0', 56, '#ffffff', { ox: 1 });
    this.bestText = this.txt(W - 44, 88, '', 22, '#cccccc', { ox: 1 });
    // annonces
    this.chainText = this.txt(W / 2, 150, '', 54, '#ffd166').setVisible(false);
    this.hintText = this.txt(W / 2, 560, '', 30, '#ffffff').setVisible(false);
    this.banner = this.txt(W / 2, 260, '', 84, '#ffffff', { depth: 42, style: { strokeThickness: 10 } }).setVisible(false);
    this.bannerSub = this.txt(W / 2, 335, '', 32, '#ffffff', { depth: 42 }).setVisible(false);
    this.hud.push(this.barBorder, this.barBg, this.barFill, this.barLabel, this.phLabel, this.phBorder, this.phBg, this.phFill,
      this.scoreText, this.bestText, this.chainText, this.hintText, this.banner, this.bannerSub);
  }

  buildTitle() {
    const d = 45;
    this.titleGroup = [];
    const t1 = this.txt(W / 2, 200, 'BITE & BOUNCE', 96, '#ffffff', { depth: d });
    const sub = this.txt(W / 2, 330, 'NIGHT: you come out. Land on villagers to bite and bounce!\nDAWN: hide. Hop onto the blue shadow platforms!', 28, '#dddddd', { depth: d });
    this.startText = this.txt(W / 2, 480, 'TAP  /  SPACE  TO  START', 40, '#ffffff', { depth: d });
    this.tweens.add({ targets: this.startText, alpha: 0.25, duration: 520, yoyo: true, repeat: -1 });
    this.howText = this.txt(W / 2, 540, 'TAP = HOP     HOLD = JUMP HIGHER', 24, '#ffffff', { depth: d });
    this.titleBest = this.txt(W / 2, 650, '', 24, '#cccccc', { depth: d });
    this.jamText = this.txt(W / 2, 698, 'Goedware Halloween Jam III  -  "It only comes out at night"', 16, '#999999', { depth: d, style: { strokeThickness: 3 } });
    this.soundBtn = this.txt(W - 30, H - 30, '', 22, '#ffffff', { depth: d, ox: 1, oy: 1 });
    this.soundBtn.setPadding(14, 10).setInteractive({ useHandCursor: true });
    this.soundBtn.on('pointerdown', () => this.toggleMute());
    this.fsBtn = this.txt(30, H - 30, 'FULLSCREEN', 22, '#ffffff', { depth: d, ox: 0, oy: 1 });
    this.fsBtn.setPadding(14, 10).setInteractive({ useHandCursor: true });
    this.fsBtn.on('pointerdown', () => this.toggleFullscreen());
    if (!document.fullscreenEnabled && !document.webkitFullscreenEnabled) this.fsBtn.setVisible(false);
    this.titleGroup.push(t1, sub, this.startText, this.howText, this.titleBest, this.jamText, this.soundBtn, this.fsBtn);
    this.refreshSoundBtn();
  }

  buildDead() {
    const d = 48;
    this.deadGroup = [];
    this.deadDim = this.box(W / 2, H / 2, W + 200, H + 200, 0x07030f, 0.62).setDepth(d - 1);
    const t = this.txt(W / 2, 200, 'TURNED TO ASH', 110, '#ff8a3d', { depth: d, style: { strokeThickness: 12 } });
    this.deadScore = this.txt(W / 2, 330, '', 60, '#ffffff', { depth: d });
    this.deadBest = this.txt(W / 2, 400, '', 32, '#cccccc', { depth: d });
    this.deadStats = this.txt(W / 2, 455, '', 24, '#dddddd', { depth: d });
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
    this.banner.setVisible(false);
    this.bannerSub.setVisible(false);
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
    this.cycle.reset();
    this.t = 0; this.speed = 400; this.D = 0; this.n = 1;
    this.phase = 'night'; this.prevPhase = null; this.seg = this.cycle.at(0);
    this.days = 0;
    this.blood = MAX_BLOOD; this.bonus = 0; this.dist = 0;
    this.chain = 0; this.maxChain = 0; this.bites = 0;
    this.buffer = 0; this.coyote = 0; this.smokeT = 0; this.trailT = 0; this.dustT = 0; this.hurtFlash = 0;
    this.bannerT = 0; this.hintT = 0; this.burning = false; this.onShelter = false;
    this.timeScale = 1; this.hitstop = 0; this.deadT = 0;
    this.lastTop = GROUND - 130;
    const P = this.P;
    Object.assign(P, { y: GROUND, prevY: GROUND, vy: 0, grounded: true, plat: null, sx: 1, sy: 1, inv: 0, canCut: false });
    this.pl.setPosition(PX, GROUND).setScale(1).setAlpha(1).setVisible(true);
    this.nextX = 900;
    this.spawnAhead();
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
    this.hintText.setText('TAP = hop     HOLD = jump higher').setVisible(true).setAlpha(1);
  }

  // ---------------------------------------------------------------- génération
  addShelter(x, w, top) {
    const c = Art.createShelter(this, w).setPosition(x, top);
    this.entities.shelters.push({ x, w, top, c });
  }

  spawnVillager(x, big) {
    const a = Art.createVillager(this, big);
    a.c.x = x;
    this.entities.villagers.push({
      c: a.c, kind: 'villager', x, big, w: a.w, h: a.h, top: GROUND - a.h,
      walk: big ? 40 : 90, dead: false, hit: false,
    });
  }

  spawnGarlic(x, y) {
    const c = Art.createGarlic(this).setPosition(x, y);
    this.entities.garlics.push({ c, x, baseY: y, ph: Math.random() * 6, r: DIMS.garlicRadius });
  }

  spawnOrb(x, y) {
    const c = Art.createOrb(this).setPosition(x, y);
    this.entities.orbs.push({ c, x, baseY: y, ph: Math.random() * 6 });
  }

  // Remplit le monde devant le joueur. Le contenu dépend de la phase qu'il
  // traversera quand il y arrivera (temps d'arrivée ~ distance / vitesse).
  spawnAhead() {
    let guard = 0;
    while (this.nextX < W + 900 && guard++ < 60) {
      const tAhead = Math.max(0, (this.nextX - PX) / this.speed);
      const tt = this.t + tAhead;
      const seg = this.cycle.at(tt);
      const tr = seg.t1 - tt;

      if (seg.type === 'night' && tr > DAWN_WARN + 1.1) { this.spawnNight(seg.n); continue; }

      if (seg.type === 'night') {
        // fin de nuit : un temps calme, puis les abris arrivent ~1 s avant le soleil
        this.nextX = Math.max(this.nextX, PX + (seg.t1 - 1.2 - this.t) * this.speed);
        this.spawnShelter(seg.n);
      } else if (tr > 1.6) {
        this.spawnShelter(seg.n);
      } else {
        // fin de journée : plus d'abris, on saute à la nuit suivante
        this.nextX = Math.max(this.nextX, PX + (seg.t1 - this.t) * this.speed + 120);
      }
    }
  }

  // NUIT : villageois, ail, orbes
  spawnNight(n) {
    const c = this.nextX;
    const garlicW = clamp(0.05 + 0.05 * (n - 1), 0, 0.3);
    const r = Math.random();
    if (r < 0.42) {
      this.spawnVillager(c, Math.random() < 0.28);
      this.nextX += rand(280, 400);
    } else if (r < 0.7 - garlicW) {
      const k = pick([2, 2, 3]);
      let x = c;
      for (let i = 0; i < k; i++) { this.spawnVillager(x, Math.random() < 0.2); x += rand(330, 460); }
      this.nextX = x;
    } else if (r < 0.7) {
      const k = pick([1, 1, 2]);
      for (let i = 0; i < k; i++) this.spawnGarlic(c + i * 90, GROUND - rand(70, 190));
      this.nextX += 90 * k + rand(210, 320);
    } else {
      const k = 6, span = 280, hgt = rand(90, 170);
      for (let i = 0; i < k; i++) {
        const f = i / (k - 1);
        this.spawnOrb(c + f * span, GROUND - 40 - Math.sin(f * Math.PI) * hgt);
      }
      this.nextX += span + 120;
    }
  }

  // JOUR : une plateforme d'ombre, de plus en plus courte et espacée
  spawnShelter(n) {
    const k = clamp((n - 1) / 7);
    const L = lerp(520, 300, k) * rand(0.9, 1.1);
    const G = lerp(160, 300, k) * rand(0.9, 1.1);
    const top = clamp(this.lastTop + rand(-55, 55), GROUND - 175, GROUND - 95);
    this.lastTop = top;
    const x = this.nextX;
    this.addShelter(x, L, top);
    this.spawnOrb(x + L * 0.35, top - 45);
    this.spawnOrb(x + L * 0.65, top - 45);
    this.nextX += L + G;
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
    this.D = 0;
    this.scrollWorld(150, dt);
    const P = this.P;
    if (P.grounded) { this.titleHop = (this.titleHop || 0) + dt; if (this.titleHop > 0.9) { this.titleHop = 0; P.vy = -560; P.grounded = false; P.sx = 0.8; P.sy = 1.3; } }
    P.vy += GRAVITY * dt; P.y += P.vy * dt;
    if (P.y >= GROUND) { P.y = GROUND; P.vy = 0; if (!P.grounded) { P.sx = 1.25; P.sy = 0.75; } P.grounded = true; }
    this.drawPlayer(dt, false);
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

  // ---- phases : NIGHT / DAWN (alerte) / DAY
  updatePhase(dt) {
    const seg = this.cycle.at(this.t);
    this.seg = seg;
    const tr = seg.t1 - this.t;
    const el = this.t - seg.t0;
    this.phase = seg.type === 'day' ? 'day' : (tr < DAWN_WARN ? 'dawn' : 'night');
    if (this.phase !== this.prevPhase) { this.onPhase(this.prevPhase, this.phase, seg); this.prevPhase = this.phase; }

    // "dayness" : pilote le ciel, l'astre et le sol
    let target = 0;
    if (seg.type === 'night') target = tr < DAWN_WARN ? 0.6 * (1 - tr / DAWN_WARN) : 0;
    else if (tr < 1.2) target = tr / 1.2;
    else target = el < 0.5 ? 0.6 + 0.4 * (el / 0.5) : 1;
    this.D += (target - this.D) * Math.min(1, dt * 6);

    this.n = seg.n;
    this.speed = 400 + Math.min(seg.n - 1, 8) * 25;
    this.burning = this.phase === 'day' && !this.onShelter;
  }

  onPhase(prev, next, seg) {
    if (next === 'night') {
      if (prev === null) {
        this.showBanner('NIGHT 1', 'Land on villagers to bite them!', '#9fb3ff');
      } else {
        this.days += 1;
        const b = 300 * this.days;
        this.bonus += b;
        sfx.night();
        this.showBanner(`NIGHT ${seg.n}`, `Day ${this.days} survived!  +${b}`, '#9fb3ff');
      }
    } else if (next === 'dawn') {
      sfx.dawn();
      this.showBanner('DAWN!', 'Hop onto the blue platforms', '#ffb86b');
      if (this.days === 0) {
        this.hintT = 7;
        this.hintText.setText('Stand ON the blue platforms to stay safe').setVisible(true).setAlpha(1);
      }
    } else if (next === 'day') {
      this.cameras.main.flash(220, 255, 210, 120);
      this.shakeAmt = Math.max(this.shakeAmt, 8);
    }
  }

  showBanner(text, sub, color) {
    this.bannerT = 2.2;
    this.banner.setText(text).setColor(color).setVisible(true).setAlpha(1).setScale(1.5);
    this.bannerSub.setText(sub).setVisible(true).setAlpha(1);
    this.tweens.add({ targets: this.banner, scale: 1, duration: 240, ease: 'Back.out' });
  }

  // ---- partie
  updatePlay(dt) {
    const P = this.P;
    this.t += dt;
    this.updatePhase(dt);
    const speed = this.speed;
    this.dist += speed * dt;
    sfx.setIntensity(clamp(this.D * 0.6 + clamp((this.n - 1) / 6) * 0.4));

    this.scrollWorld(speed, dt);
    this.updateEntities(dt, speed);

    this.nextX -= speed * dt;
    this.spawnAhead();

    // --- physique du vampire (sol + plateformes à sens unique)
    if (this.buffer > 0) this.buffer -= dt;
    if (this.coyote > 0) this.coyote -= dt;
    P.prevY = P.y;
    if (this.buffer > 0 && (P.grounded || this.coyote > 0)) this.jump();
    const gmul = (P.vy < 0 && this.held) ? HOLD_GRAVITY : 1;
    P.vy += GRAVITY * gmul * dt;
    P.y += P.vy * dt;

    let floor = GROUND, plat = null;
    if (P.vy >= 0) {
      for (const s of this.entities.shelters) {
        if (PX + HALF_W > s.x && PX - HALF_W < s.x + s.w && P.prevY <= s.top + 2 && P.y >= s.top && s.top < floor) { floor = s.top; plat = s; }
      }
    }
    if (P.y >= floor) {
      P.y = floor;
      if (!P.grounded) this.land();
      P.vy = 0; P.grounded = true; P.plat = plat;
    } else {
      if (P.grounded) this.coyote = COYOTE; // on vient de quitter le support en marchant
      P.grounded = false; P.plat = null;
    }
    if (P.inv > 0) P.inv -= dt;
    this.onShelter = !!P.plat;

    this.collide(dt);

    // --- soleil : brûle le jour hors abri ; soigne sur une plateforme d'ombre
    this.burning = this.phase === 'day' && !this.onShelter;
    if (this.burning) {
      this.blood -= Math.min(40, 12 + 3 * this.n) * dt;
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = 0.045;
        this.fx.spawn('circle', PX + rand(-18, 18), P.y - rand(10, 60), { vx: rand(-60, 20), vy: rand(-170, -80), life: rand(0.4, 0.8), size: rand(10, 20), color: COLORS.fxSmoke, alpha: 0.8 });
        if (Math.random() < 0.55) this.fx.spawn('square', PX + rand(-20, 20), P.y - rand(10, 60), { vx: rand(-80, 40), vy: rand(-240, -120), life: rand(0.3, 0.6), size: rand(4, 8), color: COLORS.fxEmber });
      }
      this.sizzleT = (this.sizzleT || 0) - dt;
      if (this.sizzleT <= 0) { this.sizzleT = 0.35; sfx.sizzle(); }
    } else if (this.phase === 'day' && this.onShelter) {
      this.blood = Math.min(MAX_BLOOD, this.blood + HEAL_RATE * dt);
      this.healT = (this.healT || 0) - dt;
      if (this.blood < MAX_BLOOD && this.healT <= 0) {
        this.healT = 0.12;
        this.fx.spawn('circle', PX + rand(-24, 24), P.y - rand(5, 50), { vx: 0, vy: -90, life: 0.5, size: rand(5, 9), color: COLORS.fxHeal, alpha: 0.8 });
      }
    }
    this.blood = clamp(this.blood, 0, MAX_BLOOD);

    // traînée en l'air + poussière de course
    if (!P.grounded) {
      this.trailT -= dt;
      if (this.trailT <= 0) { this.trailT = 0.035; this.fx.spawn('square', PX - 8, P.y - 28, { life: 0.28, size: 40, color: COLORS.player, alpha: 0.3, depth: 14 }); }
    } else {
      this.dustT -= dt;
      if (this.dustT <= 0) { this.dustT = 0.07; this.fx.spawn('circle', PX - 18, P.y - 4, { vx: -speed * 0.5, vy: rand(-90, -20), life: 0.35, size: rand(6, 12), color: COLORS.fxDust, alpha: 0.6 }); }
    }

    this.drawPlayer(dt, true);
    this.updateHud(dt);

    if (this.blood <= 0) this.die();
  }

  jump() {
    const P = this.P;
    P.vy = -JUMP_V; P.grounded = false; P.plat = null; P.canCut = true; this.buffer = 0; this.coyote = 0;
    P.sx = 0.78; P.sy = 1.3;
    sfx.jump();
    this.fx.burst('circle', PX, P.y - 2, 6, { speed: 160, spread: 1.6, angle: -Math.PI / 2, life: 0.3, size: 8, color: COLORS.fxDust, alpha: 0.7, g: 400 });
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
    this.fx.burst('circle', PX, P.y - 3, hard ? 12 : 7, { speed: 260, spread: 2.4, angle: -Math.PI / 2, life: 0.4, size: hard ? 12 : 9, color: COLORS.fxDust, alpha: 0.75, g: 500 });
  }

  bounce(v) {
    const P = this.P;
    const holdBonus = this.held || this.buffer > 0 ? BOUNCE_HOLD_V : BOUNCE_V;
    P.vy = -(holdBonus + (v.big ? 70 : 0) + Math.min(this.chain, 5) * 18);
    P.grounded = false; P.plat = null; P.canCut = false; this.buffer = 0;
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
        this.fx.burst('circle', gx, gy, 10, { speed: 320, life: 0.5, size: 10, color: COLORS.garlic });
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
        this.fx.burst('circle', o.x, o.c.y, 5, { speed: 200, life: 0.35, size: 7, color: COLORS.orb });
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
    this.fx.burst('circle', v.x, GROUND - v.h, 18, { speed: 460, spread: 3.2, angle: -Math.PI / 2, life: 0.7, size: 12, color: COLORS.fxBlood, g: 1400 });
    this.fx.burst('square', v.x, GROUND - 30, 8, { speed: 300, life: 0.5, size: 10, color: v.big ? COLORS.villagerBig : COLORS.villager, g: 900, spin: 8 });
    this.fx.spawn('circle', v.x, GROUND - 30, { life: 0.25, size: 120, color: 0xffffff, alpha: 0.6, shrink: false });
    this.popup(v.x, GROUND - v.h - 10, `+${pts}`, '#ffd166', 34 + this.chain * 3);
    const cam = this.cameras.main;
    this.tweens.killTweensOf(cam);
    cam.setZoom(1.045 + Math.min(this.chain, 5) * 0.004);
    this.tweens.add({ targets: cam, zoom: 1, duration: 260, ease: 'Quad.out' });
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
    P.vy = Math.min(P.vy, -380); P.grounded = false; P.plat = null; P.canCut = false;
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
    this.deadBest.setText(isBest ? 'NEW BEST!' : `BEST  ${this.best}`).setColor(isBest ? '#ffd166' : '#cccccc');
    this.deadStats.setText(`${this.days} day${this.days === 1 ? '' : 's'} survived     ${this.bites} bites     best chain x${this.maxChain}`);
    this.deadGroup.forEach((o) => o.setVisible(false));
    this.hud.forEach((o) => { if (o !== this.scoreText && o !== this.bestText) o.setVisible(false); });
    this.burnOverlay.setAlpha(0.25);
  }

  score() { return ((this.dist / 80) | 0) + this.bonus; }

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

    for (const s of E.shelters) { s.x -= speed * dt; s.c.x = s.x; }
    rm(E.shelters, (s) => s.x + s.w < -80);

    for (const v of E.villagers) {
      v.x -= (speed + v.walk) * dt;
      v.c.x = v.x;
    }
    rm(E.villagers, (v) => v.x < -120);

    for (const g of E.garlics) {
      g.x -= speed * dt; g.c.x = g.x; g.ph += dt * 4;
      g.c.y = g.baseY + Math.sin(g.ph) * 9;
    }
    rm(E.garlics, (g) => g.x < -80 || g.gone);

    for (const o of E.orbs) {
      o.x -= speed * dt; o.c.x = o.x; o.ph += dt * 5;
      if (!o.magnet) o.c.y = o.baseY + Math.sin(o.ph) * 5;
    }
    rm(E.orbs, (o) => o.x < -60 || o.gone);
  }

  // ---------------------------------------------------------------- rendu
  drawPlayer(dt, playing) {
    const P = this.P, pl = this.pl;
    P.sx += (1 - P.sx) * Math.min(1, dt * 14);
    P.sy += (1 - P.sy) * Math.min(1, dt * 14);
    pl.setPosition(PX, P.y).setScale(P.sx, P.sy);
    if (playing) {
      pl.setAlpha(P.inv > 0 && Math.sin(this.t * 60) > 0 ? 0.25 : 1); // clignote si invulnérable
      this.plArt.setBurning(this.burning && Math.sin(this.t * 40) > 0);
    }
  }

  updateHud(dt) {
    // sang
    const pct = this.blood / MAX_BLOOD;
    this.barFill.setDisplaySize(Math.max(0.01, this.barW * pct), 24);
    const low = pct < 0.3;
    this.barFill.setFillStyle(low ? (Math.sin(this.t * 14) > 0 ? 0xff5c3a : 0xd1203b) : lerpColor(0xd1203b, 0xff3b5c, pct));
    this.barBorder.setFillStyle(low ? 0xff5c3a : 0xffffff);
    this.barLabel.setScale(low ? 1 + Math.sin(this.t * 14) * 0.06 : 1);
    this.scoreText.setText(String(this.score()));
    this.bestText.setText(this.best ? `BEST ${this.best}` : '');

    // phase : nom + barre de temps restant
    const seg = this.seg, tr = Math.max(0, seg.t1 - this.t);
    let label, color, fill;
    if (this.phase === 'night') { label = `NIGHT ${seg.n}`; color = '#9fb3ff'; fill = 0x6c8cff; }
    else if (this.phase === 'dawn') {
      label = `DAWN IN ${Math.ceil(tr)}`; color = Math.sin(this.t * 14) > 0 ? '#ffb86b' : '#ffffff'; fill = 0xffb86b;
    } else { label = `DAY ${seg.n}  -  HIDE!`; color = '#ffd166'; fill = 0xffd166; }
    this.phLabel.setText(label).setColor(color);
    const total = seg.t1 - seg.t0;
    this.phFill.setDisplaySize(Math.max(0.01, this.phW * (tr / total)), 14).setFillStyle(fill);

    // voile rouge : brûlure + sang bas
    let a = 0;
    if (this.burning) a = 0.05 + 0.13 * (1 - pct);
    if (low) a += 0.08 + Math.sin(this.t * 12) * 0.05;
    if (this.hurtFlash > 0) { this.hurtFlash -= dt; a += 0.2; }
    this.burnOverlay.setAlpha(clamp(a, 0, 0.5));

    if (this.hintT > 0) {
      this.hintT -= dt;
      if (this.hintT < 1.2) this.hintText.setAlpha(clamp(this.hintT / 1.2));
      if (this.hintT <= 0) this.hintText.setVisible(false);
    }
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      const al = clamp(this.bannerT / 0.6);
      this.banner.setAlpha(al); this.bannerSub.setAlpha(al);
      if (this.bannerT <= 0) { this.banner.setVisible(false); this.bannerSub.setVisible(false); }
    }
    if (this.chain < 2) this.chainText.setVisible(false);
  }

  // décor (voir art.js)
  scrollWorld(speed, dt) { this.bg.update(this.D, speed, dt); }

  updateShake(dt) {
    const cam = this.cameras.main;
    if (this.shakeAmt > 0.2) {
      cam.setScroll(rand(-1, 1) * this.shakeAmt, rand(-1, 1) * this.shakeAmt);
      this.shakeAmt *= Math.max(0, 1 - 12 * dt);
    } else if (cam.scrollX || cam.scrollY) cam.setScroll(0, 0);
  }
}
