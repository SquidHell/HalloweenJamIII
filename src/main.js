import Phaser from 'phaser';
import { Game } from './scenes/Game.js';
import { W, H } from './config.js';
import { loadFont } from './font.js';

async function start() {
  await loadFont(); // police Waelek (public/fonts/) — tolère l'absence du fichier

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: W,
    height: H,
    backgroundColor: '#0b0614',
    disableContextMenu: true,
    render: { antialias: true, roundPixels: false },
    input: { activePointers: 3 },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [Game]
  });

  // Mobile en portrait : message "tournez le téléphone" + jeu en pause.
  const mq = window.matchMedia('(orientation: portrait) and (pointer: coarse)');
  const apply = () => {
    document.body.classList.toggle('portrait', mq.matches);
    try { mq.matches ? game.pause() : game.resume(); } catch (e) { /* jeu pas encore prêt */ }
  };
  mq.addEventListener('change', apply);
  game.events.once('ready', apply);

  window.__game = game;
}

start();
