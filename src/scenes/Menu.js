import Phaser from 'phaser';

export class Menu extends Phaser.Scene {
  constructor() { super('Menu'); }

  create() {
    const { width, height } = this.scale;
    this.add.text(width / 2, height / 2 - 60, '🎃 Halloween Jam III', {
      fontFamily: 'monospace', fontSize: '48px', color: '#ff7a1a'
    }).setOrigin(0.5);
    const start = this.add.text(width / 2, height / 2 + 40, 'Cliquer / toucher / ESPACE pour jouer', {
      fontFamily: 'monospace', fontSize: '20px', color: '#e8dcff'
    }).setOrigin(0.5);
    this.tweens.add({ targets: start, alpha: 0.3, duration: 700, yoyo: true, repeat: -1 });

    const go = () => this.scene.start('Game');
    this.input.once('pointerdown', go);
    this.input.keyboard.once('keydown-SPACE', go);
  }
}
