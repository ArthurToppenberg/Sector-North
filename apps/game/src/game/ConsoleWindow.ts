import Phaser from 'phaser'
import { DPR, FONT_FAMILY, CONSOLE, DEPTH } from './config'
import { log, type LogEntry } from '../log/logger'

function fail(message: string): never {
  throw new Error(`[game/ConsoleWindow] ${message}`)
}

/**
 * One display line: elapsed seconds (right-aligned), a fixed-width level tag, then
 * the message. The tag is how level reads without colour — the HUD white/black rule.
 */
function formatEntry(entry: LogEntry): string {
  const seconds = (entry.timeMs / 1000).toFixed(1).padStart(7)
  const level = entry.level.toUpperCase().padEnd(5)
  return `${seconds}  ${level}  ${entry.message}`
}

/**
 * Bottom-left developer console: a fixed HUD panel that renders the shared
 * logger's buffer as a scrollable, monochrome text log. Toggled by the toolbar's
 * developer button. Lives on the fixed UI camera like the rest of the HUD, so it
 * keeps a constant on-screen size regardless of the map's zoom/pan.
 *
 * A single Text object holds the whole log; scrolling is done by cropping it to
 * the viewport (crop coordinates are in the text's own texture space, so they are
 * immune to camera transforms — no geometry mask needed). The view follows the
 * tail (newest line) until the user wheels up, then holds until they scroll back
 * to the bottom.
 */
export class ConsoleWindow {
  private readonly scene: Phaser.Scene
  private readonly onCloseRequested: () => void

  private readonly panel: Phaser.GameObjects.Rectangle
  private readonly title: Phaser.GameObjects.Text
  private readonly closeButton: Phaser.GameObjects.Rectangle
  private readonly closeGlyph: Phaser.GameObjects.Text
  private readonly logText: Phaser.GameObjects.Text
  private readonly unsubscribe: () => void

  /** Panel + inner content sizes in device pixels (fixed; only position moves). */
  private readonly panelWidth: number
  private readonly panelHeight: number
  private readonly innerWidth: number

  /** Log viewport rect in device pixels, recomputed in `layout`. */
  private viewX = 0
  private viewY = 0
  private viewHeight = 0

  /**
   * Pixels the log is scrolled down from its top. When `followTail` it is pinned
   * to the bottom (newest visible) and re-pins as lines arrive; a wheel-up breaks
   * the follow and holds the view until the user scrolls back to the bottom.
   */
  private scrollTop = 0
  private followTail = true

  /** Log content changed while hidden; re-rendered lazily on the next show. */
  private dirty = true
  private isVisible = false

  /** Last string pushed to `logText`, so an unchanged buffer skips re-rastering. */
  private lastText = ''

  constructor(scene: Phaser.Scene, onCloseRequested: () => void) {
    this.scene = scene
    this.onCloseRequested = onCloseRequested

    this.panelWidth = CONSOLE.widthScreen * DPR
    this.panelHeight = CONSOLE.heightScreen * DPR
    const pad = CONSOLE.paddingScreen * DPR
    this.innerWidth = this.panelWidth - pad * 2
    if (this.innerWidth <= 0) fail(`console width ${CONSOLE.widthScreen} is too small for its padding`)

    const border = CONSOLE.borderScreenWidth * DPR
    const contentDepth = DEPTH.consoleContent

    // Panel surface — interactive so it can swallow wheel events (see `attachWheel`).
    this.panel = scene.add
      .rectangle(0, 0, this.panelWidth, this.panelHeight, CONSOLE.panelColor, CONSOLE.panelAlpha)
      .setOrigin(0, 0)
      .setStrokeStyle(border, CONSOLE.borderColor, CONSOLE.borderAlpha)
      .setDepth(DEPTH.consolePanel)
      .setInteractive()
    this.attachWheel(this.panel)

    const closeSize = CONSOLE.closeButtonScreenSize * DPR
    this.closeButton = scene.add
      .rectangle(0, 0, closeSize, closeSize, CONSOLE.panelColor, CONSOLE.panelAlpha)
      .setOrigin(0, 0)
      .setStrokeStyle(border, CONSOLE.borderColor, CONSOLE.borderAlpha)
      .setDepth(contentDepth)
      .setInteractive({ useHandCursor: true })
    this.closeButton.on(Phaser.Input.Events.POINTER_UP, () => this.onCloseRequested())
    this.closeButton.on(Phaser.Input.Events.POINTER_OVER, () => this.setCloseHovered(true))
    this.closeButton.on(Phaser.Input.Events.POINTER_OUT, () => this.setCloseHovered(false))
    // The close button sits on top of the panel, so a wheel over it would miss the
    // panel's handler and leak through to the map zoom; swallow it here too.
    this.attachWheel(this.closeButton)

    this.closeGlyph = scene.add
      .text(0, 0, '×', {
        fontFamily: FONT_FAMILY,
        fontStyle: CONSOLE.titleFontWeight,
        fontSize: `${CONSOLE.closeGlyphFontScreenSize * DPR}px`,
        color: CONSOLE.titleColor,
        resolution: DPR,
      })
      .setOrigin(0.5, 0.5)
      .setDepth(contentDepth)

    this.title = scene.add
      .text(0, 0, CONSOLE.title, {
        fontFamily: FONT_FAMILY,
        fontStyle: CONSOLE.titleFontWeight,
        fontSize: `${CONSOLE.titleFontScreenSize * DPR}px`,
        color: CONSOLE.titleColor,
        resolution: DPR,
      })
      .setOrigin(0, 0)
      .setDepth(contentDepth)

    this.logText = scene.add
      .text(0, 0, '', {
        fontFamily: FONT_FAMILY,
        fontStyle: CONSOLE.logFontWeight,
        fontSize: `${CONSOLE.logFontScreenSize * DPR}px`,
        color: CONSOLE.logColor,
        resolution: DPR,
        lineSpacing: CONSOLE.lineSpacingScreen * DPR,
        wordWrap: { width: this.innerWidth, useAdvancedWrap: true },
      })
      .setOrigin(0, 0)
      .setDepth(contentDepth)

    // Subscribe for the life of the window; the buffer's history is read via
    // `snapshot()` on each render, so no backlog replay is needed here.
    this.unsubscribe = log.subscribe(() => this.onLogEntry())

    this.layout()
    this.setVisible(false)
  }

  /**
   * Scroll the log on wheel and STOP the event so the scene-level wheel-zoom
   * (`CameraController`) doesn't also fire — otherwise scrolling the console would
   * zoom the map underneath it. `stopPropagation` on the per-object wheel event
   * cancels Phaser's follow-up scene `POINTER_WHEEL`.
   */
  private attachWheel(target: Phaser.GameObjects.GameObject): void {
    // Phaser 4 emits the per-object wheel as GAMEOBJECT_POINTER_WHEEL (args:
    // pointer, dx, dy, dz, event); the plain GAMEOBJECT_WHEEL is a plugin-level
    // event and never fires on the object itself.
    target.on(
      Phaser.Input.Events.GAMEOBJECT_POINTER_WHEEL,
      (_p: Phaser.Input.Pointer, _dx: number, deltaY: number, _dz: number, event: Phaser.Types.Input.EventData) => {
        this.onWheel(deltaY)
        event.stopPropagation()
      },
    )
  }

  /** Every object the window owns, so the owner can route them to the UI camera. */
  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.panel, this.title, this.closeButton, this.closeGlyph, this.logText]
  }

  setVisible(visible: boolean): void {
    this.isVisible = visible
    this.panel.setVisible(visible)
    this.title.setVisible(visible)
    this.closeButton.setVisible(visible)
    this.closeGlyph.setVisible(visible)
    this.logText.setVisible(visible)
    // A hidden panel must not eat clicks or wheel events meant for the map.
    if (this.panel.input) this.panel.input.enabled = visible
    if (this.closeButton.input) this.closeButton.input.enabled = visible
    if (visible) this.renderIfDirty()
  }

  /** Re-pin the panel to the (new) bottom-left corner after a resize. */
  reposition(): void {
    this.layout()
  }

  destroy(): void {
    this.unsubscribe()
    for (const obj of this.objects) obj.destroy()
  }

  private onLogEntry(): void {
    this.dirty = true
    if (this.isVisible) this.renderIfDirty()
  }

  private onWheel(deltaY: number): void {
    const maxScroll = this.maxScroll()
    if (maxScroll === 0) return
    // deltaY > 0 (wheel toward the user) scrolls toward newer lines (down = larger
    // scrollTop); deltaY < 0 scrolls toward older. Re-follow the tail once the
    // user scrolls back to the very bottom.
    this.scrollTop = Phaser.Math.Clamp(this.scrollTop + deltaY * CONSOLE.wheelFactor * DPR, 0, maxScroll)
    this.followTail = this.scrollTop >= maxScroll
    this.applyCrop()
  }

  private setCloseHovered(hovered: boolean): void {
    if (hovered) {
      this.closeButton.setFillStyle(CONSOLE.borderColor, CONSOLE.closeButtonHoverFillAlpha)
      this.closeGlyph.setColor(CONSOLE.closeGlyphHoverColor)
    } else {
      this.closeButton.setFillStyle(CONSOLE.panelColor, CONSOLE.panelAlpha)
      this.closeGlyph.setColor(CONSOLE.titleColor)
    }
  }

  private renderIfDirty(): void {
    if (!this.dirty) return
    this.dirty = false
    const text = log
      .snapshot()
      .map(formatEntry)
      .join('\n')
    if (text !== this.lastText) {
      this.lastText = text
      this.logText.setText(text)
    }
    this.applyCrop()
  }

  /** Max pixels the log can scroll: content taller than the viewport, else 0. */
  private maxScroll(): number {
    return Math.max(0, this.logText.height - this.viewHeight)
  }

  /**
   * Show the viewport-height slice of the log starting at `scrollTop`. Phaser
   * draws a cropped object offset by the crop's origin (render: `y = -originY +
   * crop.y`), so the text is moved *up* by `scrollTop` to cancel that offset and
   * keep the visible slice pinned at the fixed viewport position.
   */
  private applyCrop(): void {
    const maxScroll = this.maxScroll()
    this.scrollTop = this.followTail ? maxScroll : Phaser.Math.Clamp(this.scrollTop, 0, maxScroll)
    this.logText.setPosition(this.viewX, this.viewY - this.scrollTop)
    this.logText.setCrop(0, this.scrollTop, this.innerWidth, this.viewHeight)
  }

  /** Place the panel and its chrome, then measure out the log viewport. */
  private layout(): void {
    const pad = CONSOLE.paddingScreen * DPR
    // Panel width is fixed; only the vertical (bottom) anchor tracks the resize.
    const screenHeight = this.scene.scale.height
    const ax = CONSOLE.marginScreen * DPR
    // Bottom-anchored: sit `margin` above the bottom edge. Clamp so a viewport
    // shorter than the panel doesn't push it off the top.
    const ay = Math.max(CONSOLE.marginScreen * DPR, screenHeight - CONSOLE.marginScreen * DPR - this.panelHeight)

    this.panel.setPosition(ax, ay)

    const closeSize = CONSOLE.closeButtonScreenSize * DPR
    // Header: title top-left, close button top-right, sharing the first row.
    this.closeButton.setPosition(ax + this.panelWidth - pad - closeSize, ay + pad)
    this.closeGlyph.setPosition(ax + this.panelWidth - pad - closeSize / 2, ay + pad + closeSize / 2)
    this.title.setPosition(ax + pad, ay + pad)

    const headerHeight = Math.max(closeSize, this.title.height)
    const headerGap = CONSOLE.headerGapScreen * DPR
    this.viewX = ax + pad
    this.viewY = ay + pad + headerHeight + headerGap
    this.viewHeight = ay + this.panelHeight - pad - this.viewY
    if (this.viewHeight <= 0) fail(`console height ${CONSOLE.heightScreen} is too small for its header + padding`)

    this.applyCrop()
  }
}
