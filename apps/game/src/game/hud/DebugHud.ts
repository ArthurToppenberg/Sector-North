import Phaser from 'phaser'
import { DPR, FONT_FAMILY, HUD, DEPTH } from '../config'
import { cameraWorldView, type WorldView } from '../camera/worldView'

/**
 * Decimal places shown for the zoom readout. A display-formatting detail (not an
 * on-screen size), so it lives here with the readout it formats rather than in
 * `config.ts`, which holds only tunable pixel sizes.
 */
const ZOOM_READOUT_PRECISION = 3

/**
 * Real seconds of frame time accumulated before the tps readout refreshes. One
 * second smooths the tick-count jitter inherent to fixed-tick stepping (a 60 fps
 * frame steps 0 or 1 whole 8 Hz ticks, so any shorter window flickers).
 */
const TPS_WINDOW_SEC = 1
const TPS_READOUT_PRECISION = 1

function formatReadout(cam: Phaser.Cameras.Scene2D.Camera, view: WorldView): string {
  return (
    `zoom   ${cam.zoom.toFixed(ZOOM_READOUT_PRECISION)}\n` +
    `scroll ${Math.round(cam.scrollX)}, ${Math.round(cam.scrollY)}\n` +
    `center ${Math.round(view.centerX)}, ${Math.round(view.centerY)}`
  )
}

export class DebugHud {
  // Needed by `reposition()` to re-pin to the (new) top-right corner on resize.
  private readonly scene: Phaser.Scene

  private readonly text: Phaser.GameObjects.Text

  // Last string pushed to the text object. `Text.setText` re-rasterises the text
  // canvas even when the content is identical, so we skip it when unchanged.
  private lastText = ''

  private camReadout = ''

  // "—" until the first window completes: an honest "not measured yet", never a
  // fake 0 or the nominal rate.
  private tpsReadout = 'tps    —'

  private tpsWindowSec = 0
  private tpsWindowTicks = 0

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

  get objects(): readonly Phaser.GameObjects.GameObject[] {
    return [this.text]
  }

  reposition(): void {
    this.text.setPosition(this.scene.scale.width - HUD.marginScreen * DPR, HUD.marginScreen * DPR)
  }

  /**
   * Refresh the readout from live camera state. `cameraWorldView` is the single
   * fail-fast gate: it throws on any non-finite zoom/scroll/size before we can
   * read a centre, so a broken camera surfaces there rather than silently
   * painting "NaN" into the HUD — no second, redundant finiteness check needed.
   */
  render(cam: Phaser.Cameras.Scene2D.Camera): void {
    const view = cameraWorldView(cam)
    this.camReadout = formatReadout(cam, view)
    this.refresh()
  }

  /**
   * Feed one frame's real duration and the whole sim ticks it stepped. The tps
   * shown is *measured* (ticks actually run per real second), not the nominal
   * 1/SIM_TICK_SEC — a stall or a catch-up burst is exactly what this readout
   * exists to reveal. Runs every frame, unlike `render`, which the scene gates
   * behind its camera-moved dirty check.
   */
  sampleTicks(deltaSec: number, ticks: number): void {
    if (!Number.isFinite(deltaSec) || deltaSec < 0) {
      throw new Error(`[DebugHud] deltaSec must be finite and >= 0, got ${deltaSec}`)
    }
    if (!Number.isInteger(ticks) || ticks < 0) {
      throw new Error(`[DebugHud] ticks must be a non-negative integer, got ${ticks}`)
    }
    this.tpsWindowSec += deltaSec
    this.tpsWindowTicks += ticks
    if (this.tpsWindowSec < TPS_WINDOW_SEC) return
    const tps = this.tpsWindowTicks / this.tpsWindowSec
    this.tpsReadout = `tps    ${tps.toFixed(TPS_READOUT_PRECISION)}`
    this.tpsWindowSec = 0
    this.tpsWindowTicks = 0
    this.refresh()
  }

  private refresh(): void {
    this.setTextIfChanged(`${this.camReadout}\n${this.tpsReadout}`)
  }

  private setTextIfChanged(next: string): void {
    if (next === this.lastText) return
    this.lastText = next
    this.text.setText(next)
  }
}
