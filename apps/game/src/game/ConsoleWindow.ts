import Phaser from 'phaser'
import { DPR, FONT_FAMILY, CONSOLE, DEPTH } from './config'
import { log, type LogEntry } from '../log/logger'

function fail(message: string): never {
  throw new Error(`[game/ConsoleWindow] ${message}`)
}

function formatEntry(entry: LogEntry): string {
  const seconds = (entry.timeMs / 1000).toFixed(1).padStart(7)
  const level = entry.level.toUpperCase().padEnd(5)
  return `${seconds}  ${level}  ${entry.message}`
}

/**
 * Developer console: a draggable HUD panel that renders the shared logger's
 * buffer as a scrollable, monochrome text log. It opens docked at the bottom-left
 * and can be dragged anywhere. Toggled by the toolbar's developer button. Lives on
 * the fixed UI camera like the rest of the HUD, so it keeps a constant on-screen
 * size regardless of the map's zoom/pan.
 *
 * Clipping is done by CONTENT, not a mask or crop: the Text only ever holds the
 * wrapped lines that fit the viewport, so nothing can render outside it. (Crop
 * lands in the wrong space for a DPR-scaled Text texture, and geometry masks are
 * unreliable across the two-camera setup — both were tried.) Scroll position is an
 * offset into the wrapped lines; a scroll bar on the right reflects it and can be
 * dragged. The view follows the newest line until the user scrolls up, then holds
 * until they return to the bottom.
 */
export class ConsoleWindow {
  private readonly scene: Phaser.Scene
  private readonly onCloseRequested: () => void

  private readonly panel: Phaser.GameObjects.Rectangle
  private readonly title: Phaser.GameObjects.Text
  private readonly closeButton: Phaser.GameObjects.Rectangle
  private readonly closeGlyph: Phaser.GameObjects.Text
  private readonly logText: Phaser.GameObjects.Text
  private readonly scrollTrack: Phaser.GameObjects.Rectangle
  /** Track hit area, resized in `layout` — a Rectangle's default hit area is
   * captured once at `setInteractive` and would not follow `setSize`. */
  private readonly scrollTrackHit: Phaser.Geom.Rectangle
  private readonly scrollThumb: Phaser.GameObjects.Rectangle
  private readonly unsubscribe: () => void

  private readonly panelWidth: number
  private readonly panelHeight: number
  private readonly innerWidth: number
  /** Log text column width (inner width minus the scroll-bar gutter). */
  private readonly textWidth: number
  private readonly scrollbarWidth: number
  /** Rendered height of the first log line, and the added height per extra line. */
  private readonly firstLineHeight: number
  private readonly lineHeight: number

  /** Panel top-left in device pixels — the single source of truth for its place. */
  private originX = 0
  private originY = 0

  /** Log viewport rect in device pixels, recomputed in `layout`. */
  private viewX = 0
  private viewY = 0
  private viewHeight = 0

  /** Every wrapped line of the current buffer, and the topmost one shown. */
  private allLines: string[] = []
  private scrollLine = 0
  private followTail = true

  /** Log content changed while hidden; re-rendered lazily on the next show. */
  private dirty = true
  private isVisible = false

  /** Cache guards so an unchanged buffer/slice skips re-wrapping and re-rastering. */
  private lastFullText = ''
  private shownText = ''

  constructor(scene: Phaser.Scene, onCloseRequested: () => void) {
    this.scene = scene
    this.onCloseRequested = onCloseRequested

    this.panelWidth = CONSOLE.widthScreen * DPR
    this.panelHeight = CONSOLE.heightScreen * DPR
    const pad = CONSOLE.paddingScreen * DPR
    this.innerWidth = this.panelWidth - pad * 2
    if (this.innerWidth <= 0) fail(`console width ${CONSOLE.widthScreen} is too small for its padding`)
    this.scrollbarWidth = CONSOLE.scrollbarWidthScreen * DPR
    this.textWidth = this.innerWidth - this.scrollbarWidth - CONSOLE.scrollbarGapScreen * DPR
    if (this.textWidth <= 0) fail(`console width ${CONSOLE.widthScreen} is too small for its scroll bar`)

    const border = CONSOLE.borderScreenWidth * DPR
    const contentDepth = DEPTH.consoleContent

    // Panel surface — interactive so it can swallow wheel events (see `attachWheel`)
    // and act as the drag handle. The (non-interactive) title/log text on top lets a
    // drag start straight through it; the close button and scroll bar, their own
    // interactive objects, are excluded. Dragging a draggable object also stops the
    // camera panning underneath (see `CameraController`).
    this.panel = scene.add
      .rectangle(0, 0, this.panelWidth, this.panelHeight, CONSOLE.panelColor, CONSOLE.panelAlpha)
      .setOrigin(0, 0)
      .setStrokeStyle(border, CONSOLE.borderColor, CONSOLE.borderAlpha)
      .setDepth(DEPTH.consolePanel)
      .setInteractive()
    this.attachWheel(this.panel)
    scene.input.setDraggable(this.panel)
    this.panel.on(Phaser.Input.Events.DRAG, (_p: Phaser.Input.Pointer, dragX: number, dragY: number) => {
      this.originX = dragX
      this.originY = dragY
      this.layout()
    })

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
        wordWrap: { width: this.textWidth, useAdvancedWrap: true },
      })
      .setOrigin(0, 0)
      .setDepth(contentDepth)

    // Measure the log font's line box so the viewport can be sized in whole lines.
    // A one-line render gives the first line's height; a two-line render adds one
    // full line advance (glyph height + lineSpacing).
    this.logText.setText('M')
    this.firstLineHeight = this.logText.height
    this.logText.setText('M\nM')
    this.lineHeight = Math.max(1, this.logText.height - this.firstLineHeight)
    this.logText.setText('')

    // Track first, thumb second so the thumb draws on top. The track is the drag
    // target (fixed size → stable hit area); the thumb is a visual indicator.
    this.scrollTrack = scene.add
      .rectangle(0, 0, this.scrollbarWidth, 1, CONSOLE.borderColor, CONSOLE.scrollbarTrackAlpha)
      .setOrigin(0, 0)
      .setDepth(contentDepth)
    this.scrollTrackHit = new Phaser.Geom.Rectangle(0, 0, this.scrollbarWidth, 1)
    this.scrollTrack.setInteractive(this.scrollTrackHit, Phaser.Geom.Rectangle.Contains)
    this.attachWheel(this.scrollTrack)
    scene.input.setDraggable(this.scrollTrack)
    this.scrollTrack.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.scrollToPointer(p))
    this.scrollTrack.on(Phaser.Input.Events.DRAG, (p: Phaser.Input.Pointer) => this.scrollToPointer(p))
    this.scrollTrack.on(Phaser.Input.Events.POINTER_OVER, () =>
      this.scrollThumb.setFillStyle(CONSOLE.borderColor, CONSOLE.scrollbarThumbHoverAlpha),
    )
    this.scrollTrack.on(Phaser.Input.Events.POINTER_OUT, () =>
      this.scrollThumb.setFillStyle(CONSOLE.borderColor, CONSOLE.scrollbarThumbAlpha),
    )

    this.scrollThumb = scene.add
      .rectangle(0, 0, this.scrollbarWidth, 1, CONSOLE.borderColor, CONSOLE.scrollbarThumbAlpha)
      .setOrigin(0, 0)
      .setDepth(contentDepth)

    // Subscribe for the life of the window; the buffer's history is read via
    // `snapshot()` on each render, so no backlog replay is needed here.
    this.unsubscribe = log.subscribe(() => this.onLogEntry())

    // Open docked at the bottom-left; the user can drag it anywhere from there.
    // `scale.height` is already in device pixels (the canvas is sized at CSS×DPR).
    const margin = CONSOLE.marginScreen * DPR
    this.originX = margin
    this.originY = Math.max(margin, this.scene.scale.height - margin - this.panelHeight)
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
    return [this.panel, this.title, this.closeButton, this.closeGlyph, this.logText, this.scrollTrack, this.scrollThumb]
  }

  setVisible(visible: boolean): void {
    this.isVisible = visible
    this.panel.setVisible(visible)
    this.title.setVisible(visible)
    this.closeButton.setVisible(visible)
    this.closeGlyph.setVisible(visible)
    this.logText.setVisible(visible)
    this.scrollTrack.setVisible(visible)
    this.scrollThumb.setVisible(visible)
    // A hidden panel must not eat clicks or wheel events meant for the map.
    if (this.panel.input) this.panel.input.enabled = visible
    if (this.closeButton.input) this.closeButton.input.enabled = visible
    if (this.scrollTrack.input) this.scrollTrack.input.enabled = visible
    if (visible) this.renderIfDirty()
  }

  /** Keep the (draggable) panel on screen after a resize; its origin is absolute. */
  reposition(): void {
    const { width, height } = this.scene.scale
    this.originX = Phaser.Math.Clamp(this.originX, 0, Math.max(0, width - this.panelWidth))
    this.originY = Phaser.Math.Clamp(this.originY, 0, Math.max(0, height - this.panelHeight))
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
    const maxOffset = this.maxOffset()
    if (maxOffset === 0) return
    const step = Math.max(1, Math.round((Math.abs(deltaY) / 100) * CONSOLE.wheelLinesPerNotch))
    this.scrollLine = Phaser.Math.Clamp(this.scrollLine + Math.sign(deltaY) * step, 0, maxOffset)
    this.followTail = this.scrollLine >= maxOffset
    this.applyScroll()
  }

  /** Drag/click on the scroll track: centre the thumb on the pointer. */
  private scrollToPointer(pointer: Phaser.Input.Pointer): void {
    const maxOffset = this.maxOffset()
    const travel = this.viewHeight - this.thumbHeight()
    if (maxOffset === 0 || travel <= 0) return
    const t = Phaser.Math.Clamp((pointer.y - this.viewY - this.thumbHeight() / 2) / travel, 0, 1)
    this.scrollLine = Math.round(t * maxOffset)
    this.followTail = this.scrollLine >= maxOffset
    this.applyScroll()
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
    const full = log
      .snapshot()
      .map(formatEntry)
      .join('\n')
    if (full !== this.lastFullText) {
      this.lastFullText = full
      // Wrap once against the text column so scrolling counts real visual lines.
      this.allLines = full === '' ? [] : this.logText.getWrappedText(full)
    }
    this.applyScroll()
  }

  /** How many whole lines fit the viewport (first line plus as many advances as fit). */
  private visibleLineCount(): number {
    if (this.viewHeight < this.firstLineHeight) return 0
    return 1 + Math.floor((this.viewHeight - this.firstLineHeight) / this.lineHeight)
  }

  /** Topmost line index the log can be scrolled to (content lines beyond the viewport). */
  private maxOffset(): number {
    return Math.max(0, this.allLines.length - this.visibleLineCount())
  }

  /** Scroll-thumb height: track shrunk by the fraction of lines off-screen, floored. */
  private thumbHeight(): number {
    const total = this.allLines.length
    const visible = this.visibleLineCount()
    if (total <= visible || total === 0) return this.viewHeight
    return Math.max(CONSOLE.scrollbarMinThumbScreen * DPR, (this.viewHeight * visible) / total)
  }

  /** Show the line slice at the current offset and place the scroll thumb. */
  private applyScroll(): void {
    const maxOffset = this.maxOffset()
    this.scrollLine = this.followTail ? maxOffset : Phaser.Math.Clamp(this.scrollLine, 0, maxOffset)

    const visible = this.visibleLineCount()
    const slice = this.allLines.slice(this.scrollLine, this.scrollLine + visible).join('\n')
    if (slice !== this.shownText) {
      this.shownText = slice
      this.logText.setText(slice)
    }
    this.logText.setPosition(this.viewX, this.viewY)

    const th = this.thumbHeight()
    const travel = this.viewHeight - th
    const t = maxOffset > 0 ? this.scrollLine / maxOffset : 0
    this.scrollThumb.setSize(this.scrollbarWidth, th)
    this.scrollThumb.setPosition(this.viewX + this.innerWidth - this.scrollbarWidth, this.viewY + travel * t)
  }

  /** Place the panel and its chrome from the current origin, then measure the log viewport. */
  private layout(): void {
    const pad = CONSOLE.paddingScreen * DPR
    const ax = this.originX
    const ay = this.originY

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

    this.scrollTrack.setSize(this.scrollbarWidth, this.viewHeight)
    this.scrollTrackHit.height = this.viewHeight
    this.scrollTrack.setPosition(this.viewX + this.innerWidth - this.scrollbarWidth, this.viewY)

    this.applyScroll()
  }
}
