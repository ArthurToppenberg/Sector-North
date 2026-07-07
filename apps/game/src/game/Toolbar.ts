import Phaser from 'phaser'
import cityIconRaw from 'lucide-static/icons/building-2.svg?raw'
import { DPR, TOOLBAR, DEPTH } from './config'

/** Texture key for the rasterised toggle glyph, shared by preload and render. */
const ICON_TEXTURE_KEY = 'toolbar-city-labels'

/**
 * Lucide icons are authored with `stroke`/`fill` set to `currentColor`, but a
 * standalone SVG rasterised into a Phaser texture has no CSS colour context to
 * inherit — it would fall back to black and vanish on the black map. Bake the
 * HUD white (project rule: HUD is white or black only) straight into the markup
 * and hand Phaser a self-contained data URI.
 */
function iconDataUri(): string {
  const white = cityIconRaw.replaceAll('currentColor', '#ffffff')
  // Phaser's SVG loader `atob`s the data-URI payload, so it must be base64 (a
  // percent-encoded URI makes `atob` throw and the loader stalls, never firing
  // `create`). Lucide markup is pure ASCII, so `btoa` handles it directly.
  return `data:image/svg+xml;base64,${btoa(white)}`
}

/**
 * Top-left HUD toolbar. Today it holds a single icon button that toggles the
 * city markers (dots + names) on and off; it is built to grow (buttons lay out
 * rightward from the corner, spaced by `TOOLBAR.gapScreen`).
 *
 * Like every other HUD element it lives on the fixed UI camera, so it keeps a
 * constant on-screen size and ignores map pan/zoom. It owns its own toggle
 * state and reports changes through the `onToggle` callback the scene supplies —
 * it never reaches into the city layer directly, keeping the HUD decoupled from
 * what it controls.
 *
 * Project rule (HUD white/black only): the button is a translucent black square
 * with a white border and a white glyph. On/off is conveyed by *alpha* — a
 * full-strength vs dimmed glyph — not by any colour change.
 */
export class Toolbar {
  /**
   * Load the icon texture. Must run in the scene's `preload` so the texture
   * exists by the time the constructor builds the button in `create`.
   */
  static preload(scene: Phaser.Scene): void {
    scene.load.svg(ICON_TEXTURE_KEY, iconDataUri(), {
      width: TOOLBAR.iconScreenSize * DPR,
      height: TOOLBAR.iconScreenSize * DPR,
    })
  }

  /** The button surface — also the interactive hit target for clicks/hover. */
  private readonly button: Phaser.GameObjects.Rectangle
  /** The white glyph drawn on top of the button (non-interactive; clicks fall through to the button). */
  private readonly icon: Phaser.GameObjects.Image
  private readonly onToggle: (active: boolean) => void
  /** Whether the controlled feature (city names) is currently on. */
  private active: boolean

  constructor(scene: Phaser.Scene, opts: { initialActive: boolean; onToggle: (active: boolean) => void }) {
    this.onToggle = opts.onToggle
    this.active = opts.initialActive

    const size = TOOLBAR.buttonScreenSize * DPR

    // Origin (0, 0) anchors the button's top-left corner to its position, which
    // is exactly the screen corner we pin to; the icon is centred over it.
    this.button = scene.add
      .rectangle(0, 0, size, size, TOOLBAR.buttonColor, TOOLBAR.buttonAlpha)
      .setOrigin(0, 0)
      .setStrokeStyle(TOOLBAR.borderScreenWidth * DPR, TOOLBAR.borderColor, TOOLBAR.borderAlpha)
      .setDepth(DEPTH.toolbarButton)
      .setInteractive({ useHandCursor: true })

    this.icon = scene.add.image(0, 0, ICON_TEXTURE_KEY).setOrigin(0.5, 0.5).setDepth(DEPTH.toolbarIcon)

    // Click toggles the feature; hover just brightens the surface as an affordance.
    this.button.on(Phaser.Input.Events.POINTER_UP, this.toggle, this)
    this.button.on(Phaser.Input.Events.POINTER_OVER, () => this.button.setFillStyle(TOOLBAR.buttonColor, TOOLBAR.buttonHoverAlpha))
    this.button.on(Phaser.Input.Events.POINTER_OUT, () => this.button.setFillStyle(TOOLBAR.buttonColor, TOOLBAR.buttonAlpha))

    this.reposition()
    this.refreshIcon()
  }

  /**
   * The game objects this toolbar owns, so the scene can route them to the fixed
   * UI camera (and tell the main camera to ignore them).
   */
  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.button, this.icon]
  }

  /** Pin the toolbar to the top-left corner, inset by the toolbar margin. */
  reposition(): void {
    const margin = TOOLBAR.marginScreen * DPR
    const size = TOOLBAR.buttonScreenSize * DPR
    const left = margin
    const top = margin
    this.button.setPosition(left, top)
    // Centre the glyph within the (top-left-anchored) button square.
    this.icon.setPosition(left + size / 2, top + size / 2)
  }

  private toggle(): void {
    this.active = !this.active
    this.refreshIcon()
    this.onToggle(this.active)
  }

  /** Reflect on/off state via glyph opacity (no colour change — HUD rule). */
  private refreshIcon(): void {
    this.icon.setAlpha(this.active ? TOOLBAR.iconActiveAlpha : TOOLBAR.iconInactiveAlpha)
  }
}
