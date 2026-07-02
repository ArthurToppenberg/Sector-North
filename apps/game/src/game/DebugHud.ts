import Phaser from 'phaser'
import { DPR, FONT_FAMILY, HUD, DEPTH } from './config'
import { cameraWorldView } from './camera'

/** Hoisted out of `render` so it isn't re-allocated on every refresh. */
const round = (n: number) => Math.round(n)

/**
 * Top-right debug readout: a screen-fixed text object showing live camera state
 * (zoom, scroll, and derived world-space centre). This is deliberately a tiny,
 * single-responsibility class so the scene no longer owns HUD layout details —
 * it just holds the text object, keeps it pinned to the corner, and refreshes
 * the string each frame from whatever camera the scene hands it.
 *
 * Project rule: all HUD is white or black only. The text colour is '#ffffff'
 * and nothing here introduces any other colour.
 */
export class DebugHud {
  // The scene is stored because `reposition()` needs `scene.scale` on every
  // window resize — the readout must re-pin to the (new) top-right corner.
  private readonly scene: Phaser.Scene

  // The one game object this HUD owns. Non-optional and created in the
  // constructor: if the scene can't build a text object we want to fail loudly
  // rather than limp along with a half-constructed HUD.
  private readonly text: Phaser.GameObjects.Text

  // Last string pushed to the text object. `Text.setText` re-rasterises the text
  // canvas even when the content is identical, so we skip it when unchanged.
  private lastText = ''

  constructor(scene: Phaser.Scene) {
    this.scene = scene

    // Font size is expressed in CSS pixels but the canvas backing store lives in
    // device pixels, so scale by DPR to keep the text visually the same size
    // regardless of display density. Origin (1, 0) anchors the top-right corner
    // of the text to its position, which is exactly the corner we pin to.
    this.text = scene.add
      .text(0, 0, '', {
        fontFamily: FONT_FAMILY,
        fontSize: `${HUD.fontScreenSize * DPR}px`,
        color: '#ffffff',
        align: 'right',
        // Rasterise at device resolution so the readout stays crisp on HiDPI.
        resolution: DPR,
      })
      .setOrigin(1, 0)
      .setDepth(DEPTH.hud)

    this.reposition()
  }

  /**
   * The game objects this HUD contributes. Exposed so the scene can route which
   * camera is allowed to draw the HUD (e.g. ignore it on the world camera and
   * render it only on a fixed UI camera).
   */
  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.text]
  }

  /**
   * Pin the readout to the top-right corner, inset by the HUD margin. Call this
   * on window resize so the HUD tracks the (changed) viewport width. Margin is
   * in CSS pixels, converted to device pixels via DPR to match the coordinate
   * space the scene renders in.
   */
  reposition(): void {
    this.text.setPosition(this.scene.scale.width - HUD.marginScreen * DPR, HUD.marginScreen * DPR)
  }

  /**
   * Refresh the readout from live camera state. Kept as a pure render-from-input
   * method so the scene owns *when* it runs (typically once per update) and this
   * class owns *what* it shows.
   */
  render(cam: Phaser.Cameras.Scene2D.Camera): void {
    // Camera centre in world (device-pixel) coordinates — the map's own space.
    const { centerX, centerY } = cameraWorldView(cam)
    const next =
      `zoom   ${cam.zoom.toFixed(3)}\n` +
      `scroll ${round(cam.scrollX)}, ${round(cam.scrollY)}\n` +
      `center ${round(centerX)}, ${round(centerY)}`
    // Skip the (expensive) re-raster when nothing the readout shows has changed.
    if (next === this.lastText) return
    this.lastText = next
    this.text.setText(next)
  }
}
