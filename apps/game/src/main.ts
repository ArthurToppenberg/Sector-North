import Phaser from 'phaser'

// Render at the display's true pixel density. Phaser does not do this itself, so we
// size the canvas backing store at `cssPixels * DPR` and scale it back down via the
// `zoom` config. All in-game coordinates are therefore in device pixels.
const DPR = Math.max(window.devicePixelRatio || 1, 1)

class MainScene extends Phaser.Scene {
  constructor() {
    super('MainScene')
  }

  create() {
    this.layout()
    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this)
  }

  private layout() {
    const { width, height } = this.scale
    this.children.removeAll()

    this.add
      .text(width / 2, height / 2 - 40 * DPR, 'Sector-North', {
        fontFamily: 'monospace',
        fontSize: `${48 * DPR}px`,
        color: '#ffffff',
      })
      .setOrigin(0.5)

    this.add
      .text(width / 2, height / 2 + 20 * DPR, 'Phaser + Vite is running', {
        fontFamily: 'monospace',
        fontSize: `${18 * DPR}px`,
        color: '#8fd3ff',
      })
      .setOrigin(0.5)

    const box = this.add.rectangle(width / 2, height / 2 + 120 * DPR, 60 * DPR, 60 * DPR, 0x8fd3ff)
    this.tweens.add({
      targets: box,
      angle: 360,
      duration: 3000,
      repeat: -1,
    })
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#0b1e2d',
  scale: {
    mode: Phaser.Scale.NONE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: window.innerWidth * DPR,
    height: window.innerHeight * DPR,
    zoom: 1 / DPR,
  },
  render: {
    antialias: true,
    antialiasGL: true,
    roundPixels: false,
  },
  scene: [MainScene],
}

const game = new Phaser.Game(config)

// Keep the canvas matched to the window at full device resolution.
window.addEventListener('resize', () => {
  game.scale.resize(window.innerWidth * DPR, window.innerHeight * DPR)
})
