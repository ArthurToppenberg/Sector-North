import Phaser from 'phaser'
import { makeFail, type Fail } from '../fail'
import { DPR, FONT_FAMILY, CONSOLE, DEPTH } from '../config'
import { log, type LogEntry } from '../../log/logger'
import { commands, parseCommandLine, type CommandOutput } from '../../commands/registry'

const fail: Fail = makeFail('game/ConsoleWindow')

function formatEntry(entry: LogEntry): string {
  const seconds = (entry.timeMs / 1000).toFixed(1).padStart(7)
  const level = entry.level.toUpperCase().padEnd(5)
  return `${seconds}  ${level}  ${entry.message}`
}

/** One rendered log line: its text plus the colour for its level. */
interface VisualLine {
  readonly text: string
  readonly color: string
}

/** Render a thrown/rejected value for the log. `Error.message` only exists on `Error` —
 * a command that throws a string or plain object would otherwise log `undefined`. */
function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export class ConsoleWindow {
  private readonly scene: Phaser.Scene
  private readonly onCloseRequested: () => void

  private readonly panel: Phaser.GameObjects.Rectangle
  private readonly title: Phaser.GameObjects.Text
  private readonly closeButton: Phaser.GameObjects.Rectangle
  private readonly closeGlyph: Phaser.GameObjects.Text
  /**
   * One Text object per visible viewport row, so each line can carry its own
   * per-level colour (a single Text object is one colour). The pool is sized once
   * from the fixed panel height and reused across scroll — creating Text objects
   * after `MainScene.setupCameras` would make them render on both cameras.
   */
  private readonly lineTexts: Phaser.GameObjects.Text[]
  /** Off-screen Text used only to wrap each entry against the column width. */
  private readonly measure: Phaser.GameObjects.Text
  private readonly inputText: Phaser.GameObjects.Text
  /** Dimmed inline autocomplete continuation drawn after the typed text. */
  private readonly ghostText: Phaser.GameObjects.Text
  private readonly caret: Phaser.GameObjects.Rectangle
  private readonly scrollTrack: Phaser.GameObjects.Rectangle
  /** Track hit area, resized in `layout` — a Rectangle's default hit area is
   * captured once at `setInteractive` and would not follow `setSize`. */
  private readonly scrollTrackHit: Phaser.Geom.Rectangle
  private readonly scrollThumb: Phaser.GameObjects.Rectangle
  private readonly unsubscribe: () => void
  private readonly blinkEvent: Phaser.Time.TimerEvent

  private readonly panelWidth: number
  private readonly panelHeight: number
  private readonly innerWidth: number
  /** Log text column width (inner width minus the scroll-bar gutter). */
  private readonly textWidth: number
  private readonly scrollbarWidth: number
  /** Rendered height of the first log line, and the added height per extra line. */
  private readonly firstLineHeight: number
  private readonly lineHeight: number
  /** Log viewport height and how many whole lines fit — both fixed (panel is fixed). */
  private readonly viewHeight: number
  private readonly maxLines: number

  /** Panel top-left in device pixels — the single source of truth for its place. */
  private originX = 0
  private originY = 0

  /** Log viewport top-left in device pixels, recomputed in `layout`. */
  private viewX = 0
  private viewY = 0

  /** Every rendered log line (post-wrap, coloured), and the topmost one shown. */
  private visualLines: VisualLine[] = []
  private scrollLine = 0
  private followTail = true

  /** The command line currently being typed (without the prompt). */
  private inputBuffer = ''
  /** Caret on-phase for the blink; only shown while the console is visible. */
  private caretOn = true

  /** Log content changed while hidden; re-rendered lazily on the next show. */
  private dirty = true
  private isVisible = false

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

    const logStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: FONT_FAMILY,
      fontStyle: CONSOLE.logFontWeight,
      fontSize: `${CONSOLE.logFontScreenSize * DPR}px`,
      color: CONSOLE.logColor,
      resolution: DPR,
      lineSpacing: CONSOLE.lineSpacingScreen * DPR,
    }

    // Measure the log font's line box so the viewport can be sized in whole lines.
    // A one-line render gives the first line's height; a two-line render adds one
    // full line advance (glyph height + lineSpacing). Advanced word-wrap is enabled
    // so `getWrappedText` splits each entry the same way it renders.
    this.measure = scene.add
      .text(0, 0, '', { ...logStyle, wordWrap: { width: this.textWidth, useAdvancedWrap: true } })
      .setOrigin(0, 0)
      .setVisible(false)
      .setDepth(contentDepth)
    this.measure.setText('M')
    this.firstLineHeight = this.measure.height
    this.measure.setText('M\nM')
    this.lineHeight = Math.max(1, this.measure.height - this.firstLineHeight)
    this.measure.setText('')

    // Viewport height is fixed: the panel never resizes (a drag only moves its
    // origin), so the line count — and thus the Text pool size — is computed once.
    const headerHeight = Math.max(closeSize, this.title.height)
    const inputRowHeight = this.firstLineHeight
    this.viewHeight =
      this.panelHeight -
      pad * 2 -
      headerHeight -
      CONSOLE.headerGapScreen * DPR -
      CONSOLE.inputGapScreen * DPR -
      inputRowHeight
    if (this.viewHeight < this.firstLineHeight) {
      fail(`console height ${CONSOLE.heightScreen} is too small for its header, input row, and one log line`)
    }
    this.maxLines = 1 + Math.floor((this.viewHeight - this.firstLineHeight) / this.lineHeight)

    this.lineTexts = Array.from({ length: this.maxLines }, () =>
      scene.add
        .text(0, 0, '', logStyle)
        .setOrigin(0, 0)
        .setDepth(contentDepth),
    )

    // Command input row, pinned below the log viewport. Its text is set through
    // `refreshInput`; a block caret follows the end of the typed text.
    this.inputText = scene.add
      .text(0, 0, CONSOLE.inputPrompt, { ...logStyle, color: CONSOLE.inputColor })
      .setOrigin(0, 0)
      .setDepth(contentDepth)
    // Ghost autocomplete continuation, dimmed via alpha so it reads as a hint
    // behind the live input. Positioned flush after `inputText` in `refreshInput`.
    this.ghostText = scene.add
      .text(0, 0, '', { ...logStyle, color: CONSOLE.inputColor })
      .setOrigin(0, 0)
      .setAlpha(CONSOLE.suggestionAlpha)
      .setDepth(contentDepth)
      .setVisible(false)
    this.caret = scene.add
      .rectangle(0, 0, CONSOLE.caretWidthScreen * DPR, this.firstLineHeight, CONSOLE.borderColor, 1)
      .setOrigin(0, 0)
      .setDepth(contentDepth)
    this.blinkEvent = scene.time.addEvent({
      delay: CONSOLE.caretBlinkMs,
      loop: true,
      callback: this.blinkCaret,
    })

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

    // Keyboard capture for the input row. Fail loudly if the plugin is missing
    // (CameraController and MainScene assert the same), rather than silently
    // losing the command line.
    const keyboard = scene.input.keyboard
    if (!keyboard) fail('keyboard input unavailable')
    keyboard.on(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN, this.onKeyDown)

    this.refreshInput()

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
    return [
      this.panel,
      this.title,
      this.closeButton,
      this.closeGlyph,
      this.measure,
      ...this.lineTexts,
      this.inputText,
      this.ghostText,
      this.caret,
      this.scrollTrack,
      this.scrollThumb,
    ]
  }

  setVisible(visible: boolean): void {
    this.isVisible = visible
    this.panel.setVisible(visible)
    this.title.setVisible(visible)
    this.closeButton.setVisible(visible)
    this.closeGlyph.setVisible(visible)
    for (const line of this.lineTexts) line.setVisible(visible)
    this.inputText.setVisible(visible)
    this.scrollTrack.setVisible(visible)
    this.scrollThumb.setVisible(visible)
    // Caret only shows while open; the blink resumes from the on-phase so it is
    // immediately visible rather than possibly mid-off-phase.
    this.caretOn = true
    this.caret.setVisible(visible)
    if (!visible) this.ghostText.setVisible(false)
    // A hidden panel must not eat clicks or wheel events meant for the map.
    if (this.panel.input) this.panel.input.enabled = visible
    if (this.closeButton.input) this.closeButton.input.enabled = visible
    if (this.scrollTrack.input) this.scrollTrack.input.enabled = visible
    if (visible) {
      this.renderIfDirty()
      // The buffer persists across open/close, so recompute the ghost on show.
      this.refreshInput()
    }
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
    this.blinkEvent.remove()
    const keyboard = this.scene.input.keyboard
    if (keyboard) keyboard.off(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN, this.onKeyDown)
    for (const obj of this.objects) obj.destroy()
  }

  private onLogEntry(): void {
    this.dirty = true
    if (this.isVisible) this.renderIfDirty()
  }

  /**
   * Handle a keystroke into the command line. Only consumes keys while the console
   * is open; lets browser/devtools chords (Ctrl/Cmd/Alt) through untouched. An
   * empty-buffer "/" is swallowed so the "/" that opened the console — and the
   * optional command prefix — never lands as a stray character.
   */
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.isVisible) return
    if (event.ctrlKey || event.metaKey || event.altKey) return
    const { key } = event
    if (key === 'Enter') {
      this.submit()
    } else if (key === 'Tab') {
      this.applySuggestion()
    } else if (key === 'Backspace') {
      this.inputBuffer = this.inputBuffer.slice(0, -1)
      this.refreshInput()
    } else if (key === 'Escape') {
      this.onCloseRequested()
    } else if (key === '/' && this.inputBuffer === '') {
    } else if (key.length === 1) {
      this.inputBuffer += key
      this.refreshInput()
    } else {
      return
    }
    event.preventDefault()
  }

  /**
   * Dispatch the typed line to the command registry. The line is echoed first (so
   * the log reads like a real console), then the command's output is logged, or a
   * warning for an unknown name. A blank submit is ignored. An unknown command is
   * expected user error surfaced to the log — not a bug — so it does not throw.
   */
  private submit(): void {
    const raw = this.inputBuffer
    this.inputBuffer = ''
    this.refreshInput()

    const parsed = parseCommandLine(raw)
    if (!parsed) return
    log.info(`> ${raw.trim()}`)

    const command = commands.get(parsed.name)
    if (!command) {
      log.warn(`unknown command: /${parsed.name} — type /help`)
      return
    }
    try {
      const output = command.run(parsed.args)
      Promise.resolve(output)
        .then((lines) => this.logOutput(lines))
        .catch((err: unknown) => log.error(`/${parsed.name}: ${describeError(err)}`))
    } catch (err) {
      log.error(`/${parsed.name}: ${describeError(err)}`)
    }
  }

  private logOutput(output: CommandOutput): void {
    if (output === undefined) return
    for (const line of Array.isArray(output) ? output : [output]) log.info(line)
  }

  private refreshInput(): void {
    this.inputText.setText(CONSOLE.inputPrompt + this.inputBuffer)
    const caretX = this.inputText.x + this.inputText.width
    this.caret.setPosition(caretX, this.inputText.y)
    this.refreshGhost(caretX)
  }

  /**
   * The best command-name completion for the current buffer, or null when none
   * applies. Only the command-name token is completed — an argument separator
   * (space) in the buffer means the name is settled, so no suggestion. A leading
   * "/" is tolerated (and preserved by `applySuggestion`). Hidden commands are
   * never suggested — they are meant to be discovered, like `/help` omits them.
   * The registry lists names alphabetically, so the first prefix match wins.
   */
  private currentSuggestion(): string | null {
    const buffer = this.inputBuffer
    if (buffer === '' || /\s/.test(buffer)) return null
    const typed = (buffer.startsWith('/') ? buffer.slice(1) : buffer).toLowerCase()
    if (typed === '') return null
    const match = commands.list().find((c) => !c.hidden && c.name !== typed && c.name.startsWith(typed))
    return match ? match.name : null
  }

  /** Draw the suggestion's trailing letters flush after the typed text, or hide it. */
  private refreshGhost(caretX: number): void {
    const suggestion = this.currentSuggestion()
    if (suggestion === null || !this.isVisible) {
      this.ghostText.setVisible(false)
      return
    }
    const typedLength = (this.inputBuffer.startsWith('/') ? this.inputBuffer.length - 1 : this.inputBuffer.length)
    this.ghostText.setText(suggestion.slice(typedLength))
    this.ghostText.setPosition(caretX, this.inputText.y)
    this.ghostText.setVisible(true)
  }

  /** Complete the command name to the current suggestion, preserving a leading "/". */
  private applySuggestion(): void {
    const suggestion = this.currentSuggestion()
    if (suggestion === null) return
    this.inputBuffer = (this.inputBuffer.startsWith('/') ? '/' : '') + suggestion
    this.refreshInput()
  }

  private readonly blinkCaret = (): void => {
    if (!this.isVisible) return
    this.caretOn = !this.caretOn
    this.caret.setVisible(this.caretOn)
  }

  private onWheel(deltaY: number): void {
    const maxOffset = this.maxOffset()
    if (maxOffset === 0) return
    const step = Math.max(1, Math.round((Math.abs(deltaY) / CONSOLE.wheelDeltaPerNotch) * CONSOLE.wheelLinesPerNotch))
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
    // Rebuild the wrapped, coloured line list from the buffer. Wrapping per entry
    // (not over the joined text) keeps each visual line tagged with its level's
    // colour even when a long message wraps across several rows.
    const lines: VisualLine[] = []
    for (const entry of log.snapshot()) {
      const color = CONSOLE.levelColors[entry.level]
      for (const wrapped of this.measure.getWrappedText(formatEntry(entry))) {
        lines.push({ text: wrapped, color })
      }
    }
    this.visualLines = lines
    this.applyScroll()
  }

  /** Topmost line index the log can be scrolled to (content lines beyond the viewport). */
  private maxOffset(): number {
    return Math.max(0, this.visualLines.length - this.maxLines)
  }

  /** Scroll-thumb height: track shrunk by the fraction of lines off-screen, floored. */
  private thumbHeight(): number {
    const total = this.visualLines.length
    if (total <= this.maxLines || total === 0) return this.viewHeight
    return Math.max(CONSOLE.scrollbarMinThumbScreen * DPR, (this.viewHeight * this.maxLines) / total)
  }

  /** Show the line slice at the current offset, colour each row, and place the thumb. */
  private applyScroll(): void {
    const maxOffset = this.maxOffset()
    this.scrollLine = this.followTail ? maxOffset : Phaser.Math.Clamp(this.scrollLine, 0, maxOffset)

    for (let i = 0; i < this.lineTexts.length; i++) {
      const line = this.visualLines[this.scrollLine + i]
      const slot = this.lineTexts[i]
      if (line === undefined) {
        slot.setText('')
        continue
      }
      slot.setText(line.text)
      slot.setColor(line.color)
      slot.setPosition(this.viewX, this.viewY + i * this.lineHeight)
    }

    const th = this.thumbHeight()
    const travel = this.viewHeight - th
    const t = maxOffset > 0 ? this.scrollLine / maxOffset : 0
    this.scrollThumb.setSize(this.scrollbarWidth, th)
    this.scrollThumb.setPosition(this.viewX + this.innerWidth - this.scrollbarWidth, this.viewY + travel * t)
  }

  /** Place the panel and its chrome from the current origin, then position the log/input. */
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
    this.viewX = ax + pad
    this.viewY = ay + pad + headerHeight + CONSOLE.headerGapScreen * DPR

    this.scrollTrack.setSize(this.scrollbarWidth, this.viewHeight)
    this.scrollTrackHit.height = this.viewHeight
    this.scrollTrack.setPosition(this.viewX + this.innerWidth - this.scrollbarWidth, this.viewY)

    // Input row sits on the last line inside the bottom padding.
    this.inputText.setPosition(this.viewX, ay + this.panelHeight - pad - this.firstLineHeight)
    this.refreshInput()

    this.applyScroll()
  }
}
