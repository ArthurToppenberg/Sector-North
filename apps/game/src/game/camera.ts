import Phaser from 'phaser'

/** The world-space (device-px) rectangle a camera is actually displaying. */
export interface WorldView {
  left: number
  top: number
  right: number
  bottom: number
  /** Centre of the view — the point the camera looks at. */
  centerX: number
  centerY: number
  /** Visible extent in world px (`cam.width / zoom`, `cam.height / zoom`). */
  width: number
  height: number
}

/**
 * The single source of truth for "what world rectangle is on screen right now".
 *
 * Phaser anchors zoom at the camera MIDPOINT, not the top-left: `scrollX/Y` is
 * the visible top-left corner only at zoom 1. The invariant that always holds is
 * `centre = scroll + size/2` (zoom-independent), with the visible extent being
 * `size / zoom` around that centre. Every layer that needs the visible slice
 * (the grid) or the look-at point (the clamp, the HUD) derives it here rather
 * than re-guessing the relationship between scroll and zoom — getting that wrong
 * once is what made the grid clip and the pan clamp fight the camera.
 *
 * Derived from live `scroll/zoom/size` (not `cam.worldView`, which Phaser only
 * refreshes in `preRender` and so lags a frame behind the current update tick).
 */
export function cameraWorldView(cam: Phaser.Cameras.Scene2D.Camera): WorldView {
  const width = cam.width / cam.zoom
  const height = cam.height / cam.zoom
  const centerX = cam.scrollX + cam.width / 2
  const centerY = cam.scrollY + cam.height / 2
  return {
    left: centerX - width / 2,
    top: centerY - height / 2,
    right: centerX + width / 2,
    bottom: centerY + height / 2,
    centerX,
    centerY,
    width,
    height,
  }
}
