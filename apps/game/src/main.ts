import Phaser from 'phaser'
// Self-hosted HUD typeface (no CDN). Only the weights we actually use.
import '@fontsource/chakra-petch/latin-400.css'
import '@fontsource/chakra-petch/latin-600.css'
import { DPR, FONT_FAMILY, APP_READY_EVENT } from './game/config'
import { MainScene } from './game/MainScene'

// DOM contract with index.html: the mount that Phaser draws into and the boot
// spinner overlaid on it. Both are fixed build-time markup, so a missing one is
// a bug we crash on rather than paper over.
const MOUNT_ID = 'game'
const LOADER_ID = 'loader'

// Font size used only to probe `document.fonts` for readiness. `load()`/`check()`
// are size-agnostic (any size resolves the same face), so the exact value is
// irrelevant — it exists just to name the literal shared by both probes.
const FONT_PROBE_PX = 16

/** Look up a required DOM element, throwing loudly if index.html is missing it. */
function requireElement(id: string): HTMLElement {
  const el = document.getElementById(id)
  if (!el) throw new Error(`[boot] required element #${id} not found`)
  return el
}

function createGameConfig(mount: HTMLElement): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.AUTO,
    parent: mount,
    backgroundColor: '#000000',
    scale: {
      mode: Phaser.Scale.NONE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      // Backing store sized at cssPixels * DPR, scaled back via `zoom` so all
      // in-game coordinates are device pixels.
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
}

// Phaser rasterises text onto a canvas, so the HUD font must be fully loaded
// before the first draw or it silently falls back. Load the weights we use, and
// fail loudly if the font never arrives rather than shipping a wrong typeface.
async function loadHudFont(): Promise<void> {
  const probe = (weight: number) => `${weight} ${FONT_PROBE_PX}px "${FONT_FAMILY}"`
  await Promise.all([
    document.fonts.load(probe(400)),
    document.fonts.load(probe(600)),
  ])
  if (!document.fonts.check(probe(600))) {
    throw new Error(`[boot] HUD font "${FONT_FAMILY}" failed to load`)
  }
}

async function boot(mount: HTMLElement, loader: HTMLElement): Promise<void> {
  await loadHudFont()

  const game = new Phaser.Game(createGameConfig(mount))

  // Tear down the boot loader once the scene has finished creating (world
  // projected, toolbar SVG loaded). Registered before `create` can run — the
  // loader queues asynchronously, so the event fires after this handler is set.
  game.events.once(APP_READY_EVENT, () => loader.remove())

  // Keep the canvas matched to the window at full device resolution.
  window.addEventListener('resize', () => {
    game.scale.resize(window.innerWidth * DPR, window.innerHeight * DPR)
  })
}

// Resolve the required DOM up front so a missing mount fails immediately, before
// any async work — there is no sane place to render without it.
const mount = requireElement(MOUNT_ID)
const loader = requireElement(LOADER_ID)

// Fail loudly AND visibly: a boot failure (e.g. the HUD font never loading)
// would otherwise be a silent black screen with only an unhandled rejection in
// the console. Surface it in the page so the failure can't hide.
boot(mount, loader).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  mount.textContent = `Boot failed: ${message}`
  throw err
})
