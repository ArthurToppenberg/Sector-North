import Phaser from 'phaser'
import { DPR, FONT_FAMILY, SPEED_CONTROL, DEPTH } from '../config'
import { makeFail, type Fail } from '../fail'

const fail: Fail = makeFail('game/SpeedControl')

interface SpeedButton {
  multiplier: number
  button: Phaser.GameObjects.Rectangle
  label: Phaser.GameObjects.Text
}

// Widened from the config's `as const` literals so the sanity checks below (and
// the mutable active-multiplier state) compare plain numbers, not literal types.
const OPTIONS: readonly { label: string; multiplier: number }[] = SPEED_CONTROL.options
const INITIAL_MULTIPLIER: number = SPEED_CONTROL.initialMultiplier

function assertOptions(): void {
  if (OPTIONS.length === 0) fail('SPEED_CONTROL.options must not be empty')
  const seen = new Set<number>()
  for (const { label, multiplier } of OPTIONS) {
    if (label.length === 0) fail('option label must not be empty')
    if (!Number.isFinite(multiplier) || multiplier < 0) {
      fail(`option "${label}" multiplier must be finite and >= 0, got ${multiplier}`)
    }
    if (seen.has(multiplier)) fail(`duplicate option multiplier ${multiplier}`)
    seen.add(multiplier)
  }
  if (!seen.has(INITIAL_MULTIPLIER)) {
    fail(`initialMultiplier ${INITIAL_MULTIPLIER} matches no option`)
  }
}

/**
 * Bottom-right radio row of simulation-speed buttons (PAUSE / 1x / 5x / 10x).
 * Exactly one option is active; pressing another reports its multiplier through
 * `onSelect`. Like the toolbar, the control never touches the sim itself — the
 * scene owns that wiring — and pressing the already-active option is a no-op,
 * not a re-fire.
 */
export class SpeedControl {
  // Needed by `reposition()` to re-pin to the (new) bottom-right corner on resize.
  private readonly scene: Phaser.Scene
  private readonly buttons: SpeedButton[]
  private activeMultiplier = INITIAL_MULTIPLIER
  private readonly onSelect: (multiplier: number) => void

  constructor(scene: Phaser.Scene, onSelect: (multiplier: number) => void) {
    assertOptions()
    this.scene = scene
    this.onSelect = onSelect
    this.buttons = OPTIONS.map((opt) => this.createButton(scene, opt.label, opt.multiplier))
    this.reposition()
    for (const entry of this.buttons) this.refreshLabel(entry)
  }

  private createButton(scene: Phaser.Scene, label: string, multiplier: number): SpeedButton {
    // Origin (0, 0) anchors the button's top-left corner to its position; the
    // label is centred over it. Final positions are set in `reposition`.
    const button = scene.add
      .rectangle(
        0,
        0,
        SPEED_CONTROL.buttonWidthScreen * DPR,
        SPEED_CONTROL.buttonHeightScreen * DPR,
        SPEED_CONTROL.buttonColor,
        SPEED_CONTROL.buttonAlpha,
      )
      .setOrigin(0, 0)
      .setStrokeStyle(SPEED_CONTROL.borderScreenWidth * DPR, SPEED_CONTROL.borderColor, SPEED_CONTROL.borderAlpha)
      .setDepth(DEPTH.toolbarButton)
      .setInteractive({ useHandCursor: true })

    const text = scene.add
      .text(0, 0, label, {
        fontFamily: FONT_FAMILY,
        fontSize: `${SPEED_CONTROL.fontScreenSize * DPR}px`,
        fontStyle: SPEED_CONTROL.fontWeight,
        color: SPEED_CONTROL.labelColor,
        resolution: DPR,
      })
      .setOrigin(0.5, 0.5)
      .setDepth(DEPTH.toolbarIcon)

    const entry: SpeedButton = { multiplier, button, label: text }

    button.on(Phaser.Input.Events.POINTER_UP, () => this.select(entry))
    button.on(Phaser.Input.Events.POINTER_OVER, () =>
      button.setFillStyle(SPEED_CONTROL.buttonColor, SPEED_CONTROL.buttonHoverAlpha),
    )
    button.on(Phaser.Input.Events.POINTER_OUT, () =>
      button.setFillStyle(SPEED_CONTROL.buttonColor, SPEED_CONTROL.buttonAlpha),
    )

    return entry
  }

  /**
   * The game objects this control owns, so the scene can route them to the fixed
   * UI camera (and tell the main camera to ignore them).
   */
  get objects(): Phaser.GameObjects.GameObject[] {
    return this.buttons.flatMap((b) => [b.button, b.label])
  }

  reposition(): void {
    const margin = SPEED_CONTROL.marginScreen * DPR
    const gap = SPEED_CONTROL.gapScreen * DPR
    const buttonWidth = SPEED_CONTROL.buttonWidthScreen * DPR
    const buttonHeight = SPEED_CONTROL.buttonHeightScreen * DPR
    const rowWidth = this.buttons.length * buttonWidth + (this.buttons.length - 1) * gap
    const left = this.scene.scale.width - margin - rowWidth
    const top = this.scene.scale.height - margin - buttonHeight
    for (let i = 0; i < this.buttons.length; i++) {
      const x = left + i * (buttonWidth + gap)
      const { button, label } = this.buttons[i]
      button.setPosition(x, top)
      // Centre the label within the (top-left-anchored) button rectangle.
      label.setPosition(x + buttonWidth / 2, top + buttonHeight / 2)
    }
  }

  private select(entry: SpeedButton): void {
    if (entry.multiplier === this.activeMultiplier) return
    this.activeMultiplier = entry.multiplier
    for (const b of this.buttons) this.refreshLabel(b)
    this.onSelect(entry.multiplier)
  }

  /** Reflect the selection via label opacity (no colour change — HUD rule). */
  private refreshLabel(entry: SpeedButton): void {
    entry.label.setAlpha(
      entry.multiplier === this.activeMultiplier ? SPEED_CONTROL.labelActiveAlpha : SPEED_CONTROL.labelInactiveAlpha,
    )
  }
}
