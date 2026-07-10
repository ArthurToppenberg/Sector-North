import Phaser from 'phaser'
import { DPR, FONT_FAMILY, INFO_WINDOW } from './config'

/**
 * A scene object that carries Phaser's Depth component — every object an
 * `InfoWindow` owns (Rectangle, Text, Image) is one, so its depth can be re-based
 * without widening back to bare `GameObject` (which has no `setDepth`).
 */
type DepthObject = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Depth

/** One label/value row in a detail window (e.g. "Band" → "L-band"). */
export interface InfoField {
  readonly label: string
  readonly value: string
}

export interface InfoWindowContent {
  readonly title: string
  readonly fields: readonly InfoField[]
  /**
   * Texture key of a photo to show in the image box. Optional: an entity without
   * a picture omits it and the box shows a "NO IMAGE" placeholder — not a fallback
   * masking an error, but a genuinely image-less content type.
   */
  readonly imageTextureKey?: string
  /** Attribution caption shown on the image, required by its source licence. */
  readonly imageCredit?: string
}

/** Where a window sits on screen, as its panel's top-left corner in device pixels. */
export interface WindowOrigin {
  x: number
  y: number
}

export interface InfoWindowOptions {
  readonly origin: WindowOrigin
  readonly depthBase: number
  /** Called when the close button is pressed, so the owner can dispose the window. */
  readonly onClose: (window: InfoWindow) => void
  /** Called when the window is pressed/dragged, so the owner can raise it to front. */
  readonly onFocus: (window: InfoWindow) => void
}

function fail(message: string): never {
  throw new Error(`[game/InfoWindow] ${message}`)
}

export class InfoWindow {
  private readonly scene: Phaser.Scene
  private readonly onClose: (window: InfoWindow) => void
  private readonly onFocus: (window: InfoWindow) => void

  private readonly panel: Phaser.GameObjects.Rectangle
  /** The panel's input hit area, resized in `layout` so the whole body drags. */
  private readonly panelHit: Phaser.Geom.Rectangle
  private readonly closeButton: Phaser.GameObjects.Rectangle
  private readonly closeGlyph: Phaser.GameObjects.Text
  private readonly title: Phaser.GameObjects.Text
  private readonly image: Phaser.GameObjects.Rectangle
  /** The site photo, laid into `image`'s frame; null when the content has none. */
  private readonly photo: Phaser.GameObjects.Image | null
  /** Placeholder "NO IMAGE" text, or the photo's attribution caption. */
  private readonly imageCaption: Phaser.GameObjects.Text
  /** `labels[i]`/`values[i]` form field row `i`; one pair per content field. */
  private readonly labels: Phaser.GameObjects.Text[]
  private readonly values: Phaser.GameObjects.Text[]

  /** Panel top-left in device pixels — the single source of truth for its place. */
  private originX: number
  private originY: number
  /** Panel size in device pixels: width is fixed; height is computed in `layout`. */
  private readonly panelWidth: number
  private panelHeight = 0
  /** Content width in device pixels (edge padding removed). */
  private readonly innerWidth: number

  constructor(scene: Phaser.Scene, content: InfoWindowContent, options: InfoWindowOptions) {
    this.scene = scene
    this.onClose = options.onClose
    this.onFocus = options.onFocus
    this.originX = options.origin.x
    this.originY = options.origin.y

    const pad = INFO_WINDOW.paddingScreen * DPR
    this.panelWidth = INFO_WINDOW.widthScreen * DPR
    this.innerWidth = this.panelWidth - pad * 2
    if (this.innerWidth <= 0) fail(`window width ${INFO_WINDOW.widthScreen} is too small for its padding`)

    const border = INFO_WINDOW.borderScreenWidth * DPR
    const panelDepth = options.depthBase
    const contentDepth = options.depthBase + 1

    // Panel surface — solid black with a white border. Interactive + draggable so
    // the whole window body is a drag handle; the (non-interactive) text on top
    // lets the drag start straight through it, while the close button (its own
    // interactive object above) is excluded.
    // Explicit hit rectangle (object-local, top-left origin) so it can be resized
    // to the computed panel height in `layout` — a Rectangle's default hit area is
    // captured once at `setInteractive` and would not follow `setSize`.
    this.panelHit = new Phaser.Geom.Rectangle(0, 0, this.panelWidth, this.panelWidth)
    this.panel = scene.add
      .rectangle(0, 0, this.panelWidth, this.panelWidth, INFO_WINDOW.panelColor, INFO_WINDOW.panelAlpha)
      .setOrigin(0, 0)
      .setStrokeStyle(border, INFO_WINDOW.borderColor, INFO_WINDOW.borderAlpha)
      .setDepth(panelDepth)
      .setInteractive(this.panelHit, Phaser.Geom.Rectangle.Contains)
    scene.input.setDraggable(this.panel)
    this.panel.on(Phaser.Input.Events.POINTER_DOWN, () => this.onFocus(this))
    this.panel.on(Phaser.Input.Events.DRAG, (_p: Phaser.Input.Pointer, dragX: number, dragY: number) => {
      this.originX = dragX
      this.originY = dragY
      this.layout()
    })

    const closeSize = INFO_WINDOW.closeButtonScreenSize * DPR
    this.closeButton = scene.add
      .rectangle(0, 0, closeSize, closeSize, INFO_WINDOW.panelColor, INFO_WINDOW.panelAlpha)
      .setOrigin(0, 0)
      .setStrokeStyle(border, INFO_WINDOW.borderColor, INFO_WINDOW.borderAlpha)
      .setDepth(contentDepth)
      .setInteractive({ useHandCursor: true })
    this.closeButton.on(Phaser.Input.Events.POINTER_UP, () => this.onClose(this))
    // Solid-black panel means an alpha change is invisible; invert instead (white
    // fill / black glyph) as the hover affordance — still white/black only.
    this.closeButton.on(Phaser.Input.Events.POINTER_OVER, () => this.setCloseHovered(true))
    this.closeButton.on(Phaser.Input.Events.POINTER_OUT, () => this.setCloseHovered(false))
    this.closeGlyph = scene.add
      .text(0, 0, '×', {
        fontFamily: FONT_FAMILY,
        fontStyle: INFO_WINDOW.titleFontWeight,
        fontSize: `${INFO_WINDOW.closeGlyphFontScreenSize * DPR}px`,
        color: INFO_WINDOW.titleColor,
        resolution: DPR,
      })
      .setOrigin(0.5, 0.5)
      .setDepth(contentDepth)

    this.title = scene.add
      .text(0, 0, content.title, {
        fontFamily: FONT_FAMILY,
        fontStyle: INFO_WINDOW.titleFontWeight,
        fontSize: `${INFO_WINDOW.titleFontScreenSize * DPR}px`,
        color: INFO_WINDOW.titleColor,
        resolution: DPR,
        wordWrap: { width: this.innerWidth - closeSize - INFO_WINDOW.closeTitleGapScreen * DPR, useAdvancedWrap: true },
      })
      .setOrigin(0, 0)
      .setDepth(contentDepth)

    this.image = scene.add
      .rectangle(0, 0, this.innerWidth, INFO_WINDOW.imageHeightScreen * DPR, INFO_WINDOW.panelColor, INFO_WINDOW.imageFillAlpha)
      .setOrigin(0, 0)
      .setStrokeStyle(border, INFO_WINDOW.borderColor, INFO_WINDOW.borderAlpha)
      .setDepth(contentDepth)

    // The photo, if any. It must already be loaded (see `preloadRadarImages`); a
    // missing texture is a wiring bug, so fail loudly rather than draw an empty box.
    // With a photo, the caption is its (small, bottom-anchored) attribution; without
    // one it's the centred "NO IMAGE" placeholder.
    let captionText: string
    if (content.imageTextureKey !== undefined) {
      if (!scene.textures.exists(content.imageTextureKey)) {
        fail(`image texture "${content.imageTextureKey}" is not loaded`)
      }
      // A photo always carries its licence attribution (see `RadarImageAsset.credit`);
      // a photo with no credit is a wiring bug, so fail rather than render a blank caption.
      if (content.imageCredit === undefined) {
        fail(`image texture "${content.imageTextureKey}" has no attribution credit`)
      }
      // Sits between the frame fill and the caption; scaled/positioned in `layout`.
      this.photo = scene.add.image(0, 0, content.imageTextureKey).setOrigin(0.5, 0.5).setDepth(contentDepth)
      captionText = content.imageCredit
    } else {
      this.photo = null
      captionText = INFO_WINDOW.imageCaption
    }

    this.imageCaption = scene.add
      .text(0, 0, captionText, {
        fontFamily: FONT_FAMILY,
        fontStyle: INFO_WINDOW.labelFontWeight,
        fontSize: `${INFO_WINDOW.imageCaptionFontScreenSize * DPR}px`,
        color: INFO_WINDOW.labelColor,
        resolution: DPR,
      })
      .setOrigin(this.photo ? 0 : 0.5, this.photo ? 1 : 0.5)
      .setAlpha(this.photo ? INFO_WINDOW.imageCreditAlpha : INFO_WINDOW.imageCaptionAlpha)
      .setDepth(contentDepth)

    this.labels = content.fields.map((f) => this.createLabel(f.label, contentDepth))
    this.values = content.fields.map((f) => this.createValue(f.value, contentDepth))

    this.layout()
  }

  private createLabel(text: string, depth: number): Phaser.GameObjects.Text {
    return this.scene.add
      .text(0, 0, text.toUpperCase(), {
        fontFamily: FONT_FAMILY,
        fontStyle: INFO_WINDOW.labelFontWeight,
        fontSize: `${INFO_WINDOW.labelFontScreenSize * DPR}px`,
        color: INFO_WINDOW.labelColor,
        resolution: DPR,
      })
      .setOrigin(0, 0)
      .setAlpha(INFO_WINDOW.labelAlpha)
      .setDepth(depth)
  }

  private createValue(text: string, depth: number): Phaser.GameObjects.Text {
    return this.scene.add
      .text(0, 0, text, {
        fontFamily: FONT_FAMILY,
        fontStyle: INFO_WINDOW.valueFontWeight,
        fontSize: `${INFO_WINDOW.valueFontScreenSize * DPR}px`,
        color: INFO_WINDOW.valueColor,
        resolution: DPR,
        wordWrap: { width: this.innerWidth, useAdvancedWrap: true },
      })
      .setOrigin(0, 0)
      .setDepth(depth)
  }

  private setCloseHovered(hovered: boolean): void {
    if (hovered) {
      this.closeButton.setFillStyle(INFO_WINDOW.borderColor, INFO_WINDOW.closeButtonHoverFillAlpha)
      this.closeGlyph.setColor(INFO_WINDOW.closeGlyphHoverColor)
    } else {
      this.closeButton.setFillStyle(INFO_WINDOW.panelColor, INFO_WINDOW.panelAlpha)
      this.closeGlyph.setColor(INFO_WINDOW.titleColor)
    }
  }

  /**
   * The objects drawn one depth level above the panel (everything except the
   * panel surface itself). Single source of truth for `objects` and `setDepthBase`.
   */
  private get contentObjects(): DepthObject[] {
    return [
      this.image,
      ...(this.photo ? [this.photo] : []),
      this.imageCaption,
      this.closeButton,
      this.closeGlyph,
      this.title,
      ...this.labels,
      ...this.values,
    ]
  }

  /** Every object the window owns, so the owner can route them to the UI camera. */
  get objects(): DepthObject[] {
    return [this.panel, ...this.contentObjects]
  }

  /** Raise this window above others by re-basing every object's depth. */
  setDepthBase(depthBase: number): void {
    this.panel.setDepth(depthBase)
    const contentDepth = depthBase + 1
    for (const obj of this.contentObjects) obj.setDepth(contentDepth)
  }

  /** Keep the window on screen after a resize (its origin is absolute device px). */
  clampIntoView(screenWidth: number, screenHeight: number): void {
    this.originX = Phaser.Math.Clamp(this.originX, 0, Math.max(0, screenWidth - this.panelWidth))
    this.originY = Phaser.Math.Clamp(this.originY, 0, Math.max(0, screenHeight - this.panelHeight))
    this.layout()
  }

  destroy(): void {
    for (const obj of this.objects) obj.destroy()
  }

  /**
   * Stack every element top-down from the window's origin, measuring each text
   * object's rendered height so wrapped values (e.g. a long notes line) push the
   * ones below them down, then size the panel to the content. All maths is in
   * device pixels.
   */
  private layout(): void {
    const pad = INFO_WINDOW.paddingScreen * DPR
    const ax = this.originX
    const ay = this.originY
    const sectionGap = INFO_WINDOW.sectionGapScreen * DPR
    const closeSize = INFO_WINDOW.closeButtonScreenSize * DPR

    let y = ay + pad

    this.closeButton.setPosition(ax + pad, y)
    this.closeGlyph.setPosition(ax + pad + closeSize / 2, y + closeSize / 2)
    const titleX = ax + pad + closeSize + INFO_WINDOW.closeTitleGapScreen * DPR
    this.title.setPosition(titleX, y)
    y += Math.max(closeSize, this.title.height) + sectionGap

    const imageH = INFO_WINDOW.imageHeightScreen * DPR
    this.image.setPosition(ax + pad, y)
    if (this.photo) {
      // Cover-fill: scale so the photo fills the whole box, then crop the centred
      // overflow so nothing spills past the frame (with origin 0.5, a centred crop
      // renders centred on the object's position). Caption anchored bottom-left.
      const texW = this.photo.width
      const texH = this.photo.height
      const scale = Math.max(this.innerWidth / texW, imageH / texH)
      const cropW = this.innerWidth / scale
      const cropH = imageH / scale
      this.photo
        .setCrop((texW - cropW) / 2, (texH - cropH) / 2, cropW, cropH)
        .setScale(scale)
        .setPosition(ax + pad + this.innerWidth / 2, y + imageH / 2)
      const captionInset = INFO_WINDOW.imageCaptionInsetScreen * DPR
      this.imageCaption.setPosition(ax + pad + captionInset, y + imageH - captionInset)
    } else {
      this.imageCaption.setPosition(ax + pad + this.innerWidth / 2, y + imageH / 2)
    }
    y += imageH + sectionGap

    const labelValueGap = INFO_WINDOW.labelValueGapScreen * DPR
    const rowGap = INFO_WINDOW.rowGapScreen * DPR
    for (let i = 0; i < this.labels.length; i++) {
      this.labels[i].setPosition(ax + pad, y)
      y += this.labels[i].height + labelValueGap
      this.values[i].setPosition(ax + pad, y)
      y += this.values[i].height + rowGap
    }
    if (this.labels.length > 0) y -= rowGap // trailing row gap isn't bottom padding

    this.panelHeight = y + pad - ay
    this.panel.setPosition(ax, ay)
    this.panel.setSize(this.panelWidth, this.panelHeight)
    // Keep the draggable hit area in step with the (now known) panel height.
    this.panelHit.width = this.panelWidth
    this.panelHit.height = this.panelHeight
  }
}
