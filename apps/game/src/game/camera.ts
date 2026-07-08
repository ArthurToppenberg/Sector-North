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
}

/**
 * Fail fast on any camera state that would silently poison the derived view.
 *
 * `zoom` divides the visible extent, and `scroll`/`width`/`height` are summed
 * straight into the view centre, so a non-finite or non-positive value would
 * emit Infinity/NaN into the grid slice, the pan clamp and the HUD without ever
 * throwing. A live camera is always clamped to a positive finite zoom, so
 * anything else is a bug we surface immediately rather than mask.
 */
function assertViewableCamera(cam: Phaser.Cameras.Scene2D.Camera): void {
  if (!Number.isFinite(cam.zoom) || cam.zoom <= 0) {
    throw new Error(`cameraWorldView: camera zoom must be a positive finite number, got ${cam.zoom}`)
  }
  if (!Number.isFinite(cam.width) || !Number.isFinite(cam.height)) {
    throw new Error(
      `cameraWorldView: camera dimensions must be finite, got ${cam.width}x${cam.height}`,
    )
  }
  if (!Number.isFinite(cam.scrollX) || !Number.isFinite(cam.scrollY)) {
    throw new Error(
      `cameraWorldView: camera scroll must be finite, got ${cam.scrollX},${cam.scrollY}`,
    )
  }
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
  assertViewableCamera(cam)

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
  }
}
