import Phaser from 'phaser'
// Self-hosted HUD typeface (no CDN). Only the weights we actually use.
import '@fontsource/chakra-petch/400.css'
import '@fontsource/chakra-petch/600.css'
import { DPR, FONT_FAMILY } from './game/config'
import { MainScene } from './game/MainScene'

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#000000',
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

// Phaser rasterises text onto a canvas, so the HUD font must be fully loaded
// before the first draw or it silently falls back. Load the weights we use, and
// fail loudly if the font never arrives rather than shipping a wrong typeface.
async function boot() {
  await Promise.all([
    document.fonts.load(`400 16px "${FONT_FAMILY}"`),
    document.fonts.load(`600 16px "${FONT_FAMILY}"`),
  ])
  if (!document.fonts.check(`600 16px "${FONT_FAMILY}"`)) {
    throw new Error(`[boot] HUD font "${FONT_FAMILY}" failed to load`)
  }

  const game = new Phaser.Game(config)

  // Keep the canvas matched to the window at full device resolution.
  window.addEventListener('resize', () => {
    game.scale.resize(window.innerWidth * DPR, window.innerHeight * DPR)
  })
}

// Fail loudly AND visibly: a boot failure (e.g. the HUD font never loading)
// would otherwise be a silent black screen with only an unhandled rejection in
// the console. Surface it in the page so the failure can't hide.
boot().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  const parent = document.getElementById('game') ?? document.body
  parent.textContent = `Boot failed: ${message}`
  throw err
})
