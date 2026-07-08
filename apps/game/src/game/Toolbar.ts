import Phaser from 'phaser'
import cityIconRaw from 'lucide-static/icons/building-2.svg?raw'
import airportIconRaw from 'lucide-static/icons/plane.svg?raw'
import { DPR, TOOLBAR, DEPTH } from './config'
import { iconDataUri } from './svgIcon'

/**
 * The toggle buttons the toolbar can show, each with its Lucide source SVG and a
 * stable Phaser texture key. Adding a toolbar toggle is a matter of adding an
 * entry here and wiring its `onToggle` where the toolbar is constructed.
 */
const ICONS = {
  cities: { key: 'toolbar-cities', raw: cityIconRaw },
  airports: { key: 'toolbar-airports', raw: airportIconRaw },
} as const

export type ToolbarButtonId = keyof typeof ICONS

/** Configuration for one toolbar button, supplied by the scene. */
export interface ToolbarButtonConfig {
  id: ToolbarButtonId
  initialActive: boolean
  onToggle: (active: boolean) => void
}

/** One built button: its surface, glyph, current state and toggle callback. */
interface ToolbarButton {
  button: Phaser.GameObjects.Rectangle
  icon: Phaser.GameObjects.Image
  active: boolean
  onToggle: (active: boolean) => void
}

/**
 * Top-left HUD toolbar of icon buttons — currently the city-name and airport
 * toggles. Buttons lay out rightward from the corner, spaced by
 * `TOOLBAR.gapScreen`, so the row grows as toggles are added.
 *
 * Like every other HUD element it lives on the fixed UI camera, so it keeps a
 * constant on-screen size and ignores map pan/zoom. Each button owns its own
 * state and reports changes through the `onToggle` callback the scene supplies —
 * it never reaches into the layers directly, keeping the HUD decoupled from what
 * it controls.
 *
 * Project rule (HUD white/black only): each button is a translucent black square
 * with a white border and a white glyph. On/off is conveyed by *alpha* — a
 * full-strength vs dimmed glyph — not by any colour change.
 */
export class Toolbar {
  /**
   * Load every icon texture. Must run in the scene's `preload` so the textures
   * exist by the time the constructor builds the buttons in `create`.
   */
  static preload(scene: Phaser.Scene): void {
    for (const { key, raw } of Object.values(ICONS)) {
      scene.load.svg(key, iconDataUri(raw), {
        width: TOOLBAR.iconScreenSize * DPR,
        height: TOOLBAR.iconScreenSize * DPR,
      })
    }
  }

  private readonly buttons: ToolbarButton[]

  constructor(scene: Phaser.Scene, configs: ToolbarButtonConfig[]) {
    // Fail fast on a misconfigured toolbar rather than silently rendering
    // nothing, a broken glyph, or crashing later with an opaque message.
    if (configs.length === 0) {
      throw new Error('Toolbar requires at least one button config; received none.')
    }
    const seen = new Set<ToolbarButtonId>()
    for (const cfg of configs) {
      if (!(cfg.id in ICONS)) {
        throw new Error(`Toolbar received an unknown button id "${cfg.id}".`)
      }
      if (seen.has(cfg.id)) {
        throw new Error(`Toolbar received a duplicate button id "${cfg.id}".`)
      }
      seen.add(cfg.id)
      // The glyph texture must already be loaded — a missing texture would draw
      // Phaser's magenta placeholder (also a HUD white/black violation), so
      // demand that Toolbar.preload ran instead of degrading to that.
      const { key } = ICONS[cfg.id]
      if (!scene.textures.exists(key)) {
        throw new Error(`Toolbar icon texture "${key}" is not loaded — call Toolbar.preload(scene) in the scene's preload().`)
      }
    }

    const size = TOOLBAR.buttonScreenSize * DPR

    this.buttons = configs.map((cfg) => {
      // Origin (0, 0) anchors the button's top-left corner to its position; the
      // icon is centred over it. Final positions are set in `reposition`.
      const button = scene.add
        .rectangle(0, 0, size, size, TOOLBAR.buttonColor, TOOLBAR.buttonAlpha)
        .setOrigin(0, 0)
        .setStrokeStyle(TOOLBAR.borderScreenWidth * DPR, TOOLBAR.borderColor, TOOLBAR.borderAlpha)
        .setDepth(DEPTH.toolbarButton)
        .setInteractive({ useHandCursor: true })

      const icon = scene.add
        .image(0, 0, ICONS[cfg.id].key)
        .setOrigin(0.5, 0.5)
        .setDepth(DEPTH.toolbarIcon)

      const entry: ToolbarButton = { button, icon, active: cfg.initialActive, onToggle: cfg.onToggle }

      // Click toggles the feature; hover just brightens the surface as an affordance.
      button.on(Phaser.Input.Events.POINTER_UP, () => this.toggle(entry))
      button.on(Phaser.Input.Events.POINTER_OVER, () => button.setFillStyle(TOOLBAR.buttonColor, TOOLBAR.buttonHoverAlpha))
      button.on(Phaser.Input.Events.POINTER_OUT, () => button.setFillStyle(TOOLBAR.buttonColor, TOOLBAR.buttonAlpha))

      return entry
    })

    this.reposition()
    for (const entry of this.buttons) this.refreshIcon(entry)
  }

  /**
   * The game objects this toolbar owns, so the scene can route them to the fixed
   * UI camera (and tell the main camera to ignore them).
   */
  get objects(): Phaser.GameObjects.GameObject[] {
    return this.buttons.flatMap((b) => [b.button, b.icon])
  }

  /** Pin the toolbar to the top-left corner; buttons flow rightward. */
  reposition(): void {
    const margin = TOOLBAR.marginScreen * DPR
    const size = TOOLBAR.buttonScreenSize * DPR
    const gap = TOOLBAR.gapScreen * DPR
    const top = margin
    for (let i = 0; i < this.buttons.length; i++) {
      const left = margin + i * (size + gap)
      const { button, icon } = this.buttons[i]
      button.setPosition(left, top)
      // Centre the glyph within the (top-left-anchored) button square.
      icon.setPosition(left + size / 2, top + size / 2)
    }
  }

  private toggle(entry: ToolbarButton): void {
    entry.active = !entry.active
    this.refreshIcon(entry)
    entry.onToggle(entry.active)
  }

  /** Reflect on/off state via glyph opacity (no colour change — HUD rule). */
  private refreshIcon(entry: ToolbarButton): void {
    entry.icon.setAlpha(entry.active ? TOOLBAR.iconActiveAlpha : TOOLBAR.iconInactiveAlpha)
  }
}
