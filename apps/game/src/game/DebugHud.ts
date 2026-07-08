import Phaser from 'phaser'
import { DPR, FONT_FAMILY, HUD, DEPTH } from './config'
import { cameraWorldView } from './camera'

/**
 * Top-right debug readout: a screen-fixed text object showing live camera state
 * (zoom, scroll, and derived world-space centre). Deliberately a tiny,
 * single-responsibility class — it holds the text object, keeps it pinned to the
 * corner, and refreshes the string from whatever camera the scene hands it. The
 * scene owns *when* it runs (viewport-reactive: once per update, behind its
 * camera-moved dirty check, plus on resize) and this class owns *what* it shows.
 *
 * Project rule: all HUD is white or black only — the text colour is '#ffffff'
 * and nothing here introduces any other colour. It is drawn by the fixed UI
 * camera (zoom 1, no scroll) so it keeps a constant on-screen size; the scene
 * routes that via the `objects` getter.
 */
export class DebugHud {
  // Needed by `reposition()` to re-pin to the (new) top-right corner on resize.
  private readonly scene: Phaser.Scene

  // The one game object this HUD owns — created eagerly in the constructor.
  private readonly text: Phaser.GameObjects.Text

  // Last string pushed to the text object. `Text.setText` re-rasterises the text
  // canvas even when the content is identical, so we skip it when unchanged.
  private lastText = ''

  constructor(scene: Phaser.Scene) {
    this.scene = scene

    // Font size is expressed in CSS pixels but the canvas backing store lives in
    // device pixels, so scale by DPR to keep the text visually the same size
    // regardless of display density. Origin (1, 0) anchors the text's top-right
    // corner to its position — exactly the screen corner we pin to.
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
   * camera draws the HUD — ignored on the world camera, rendered only on the
   * fixed UI camera so it keeps a constant on-screen size.
   */
  get objects(): readonly Phaser.GameObjects.GameObject[] {
    return [this.text]
  }

  /**
   * Pin the readout to the top-right corner, inset by the HUD margin. Called on
   * window resize so the HUD tracks the changed viewport width. Margin is in CSS
   * pixels, converted to device pixels via DPR to match the render coordinate space.
   */
  reposition(): void {
    this.text.setPosition(this.scene.scale.width - HUD.marginScreen * DPR, HUD.marginScreen * DPR)
  }

  /**
   * Refresh the readout from live camera state.
   */
  render(cam: Phaser.Cameras.Scene2D.Camera): void {
    // Camera centre in world (device-pixel) coordinates — the map's own space.
    const { centerX, centerY } = cameraWorldView(cam)

    // Fail fast: a non-finite camera state (e.g. a zero/NaN zoom from a broken
    // bounds or projection upstream) would silently paint "NaN" into the HUD.
    // Surface it instead of masking the bug behind a plausible-looking readout.
    if (!Number.isFinite(cam.zoom) || !Number.isFinite(centerX) || !Number.isFinite(centerY)) {
      throw new Error(
        `DebugHud.render: non-finite camera state (zoom=${cam.zoom}, center=${centerX},${centerY})`,
      )
    }

    const next =
      `zoom   ${cam.zoom.toFixed(3)}\n` +
      `scroll ${Math.round(cam.scrollX)}, ${Math.round(cam.scrollY)}\n` +
      `center ${Math.round(centerX)}, ${Math.round(centerY)}`
    // Skip the (expensive) re-raster when nothing the readout shows has changed.
    if (next === this.lastText) return
    this.lastText = next
    this.text.setText(next)
  }
}
