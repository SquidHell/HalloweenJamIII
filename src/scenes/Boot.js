import Phaser from 'phaser';

// Charge les assets ici (public/assets/...) puis lance le menu.
export class Boot extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    const { width, height } = this.scale;
    const bar = this.add.rectangle(width / 2 - 150, height / 2, 0, 12, 0xff7a1a).setOrigin(0, 0.5);
    this.load.on('progress', (p) => { bar.width = 300 * p; });
    // Exemple : this.load.image('ghost', 'assets/ghost.png');
  }

  create() { this.scene.start('Menu'); }
}
