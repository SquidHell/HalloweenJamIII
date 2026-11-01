import Phaser from 'phaser';

// Scène de jeu : point de départ du prototype.
export class Game extends Phaser.Scene {
  constructor() { super('Game'); }

  create() {
    const { width, height } = this.scale;
    this.player = this.add.circle(width / 2, height / 2, 16, 0xff7a1a);
    this.physics.add.existing(this.player);
    this.player.body.setCollideWorldBounds(true);

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys('W,A,S,D');
    this.add.text(12, 12, 'Flèches / ZQSD-WASD pour bouger', {
      fontFamily: 'monospace', fontSize: '14px', color: '#e8dcff'
    });
  }

  update() {
    const speed = 220;
    const k = this.cursors, w = this.wasd;
    const x = (k.right.isDown || w.D.isDown ? 1 : 0) - (k.left.isDown || w.A.isDown ? 1 : 0);
    const y = (k.down.isDown || w.S.isDown ? 1 : 0) - (k.up.isDown || w.W.isDown ? 1 : 0);
    this.player.body.setVelocity(x * speed, y * speed);
    this.player.body.velocity.normalize().scale(speed * (x || y ? 1 : 0));
  }
}
