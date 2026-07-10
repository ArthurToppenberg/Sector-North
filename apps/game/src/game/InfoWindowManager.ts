import Phaser from 'phaser'
import { DPR, INFO_WINDOW, TOOLBAR, DEPTH } from './config'
import { InfoWindow, type InfoWindowContent } from './InfoWindow'
import { log } from '../log/logger'

export class InfoWindowManager {
  private readonly scene: Phaser.Scene
  private readonly worldCamera: Phaser.Cameras.Scene2D.Camera
  /** Live windows keyed by their location id, so each location has at most one. */
  private readonly windows = new Map<string, InfoWindow>()
  /** Next depth to hand out; grows so the most recently focused window is on top. */
  private nextDepth = DEPTH.window
  /** How many windows have ever been opened, for the cascade offset. */
  private openedCount = 0

  constructor(scene: Phaser.Scene, worldCamera: Phaser.Cameras.Scene2D.Camera) {
    this.scene = scene
    this.worldCamera = worldCamera
  }

  /**
   * Toggle the window for `key` (a stable location id): close it if one is open,
   * otherwise open a fresh window for `content`.
   */
  toggle(key: string, content: InfoWindowContent): void {
    const existing = this.windows.get(key)
    if (existing) {
      this.windows.delete(key)
      existing.destroy()
      log.debug(`Detail window closed (${key})`)
      return
    }
    log.debug(`Detail window opened: ${content.title}`)
    const window = new InfoWindow(this.scene, content, {
      origin: this.nextOrigin(),
      depthBase: this.allocDepth(),
      onClose: (w) => this.close(w),
      onFocus: (w) => this.bringToFront(w),
    })
    // Route the freshly created HUD objects to the UI camera only.
    this.worldCamera.ignore(window.objects)
    this.windows.set(key, window)
  }

  /** Re-clamp every window into the viewport after a resize. */
  reposition(): void {
    const { width, height } = this.scene.scale
    for (const window of this.windows.values()) window.clampIntoView(width, height)
  }

  private bringToFront(window: InfoWindow): void {
    window.setDepthBase(this.allocDepth())
  }

  private close(window: InfoWindow): void {
    for (const [key, open] of this.windows) {
      if (open === window) {
        this.windows.delete(key)
        window.destroy()
        log.debug(`Detail window closed (${key})`)
        return
      }
    }
  }

  /** Panel + its content occupy two depth levels, so step by two each time. */
  private allocDepth(): number {
    const depth = this.nextDepth
    this.nextDepth += 2
    return depth
  }

  /**
   * Cascade origin in device pixels: start just below the toolbar at the left
   * margin, then step down-and-right per open, wrapping after `cascadeCount`.
   */
  private nextOrigin(): { x: number; y: number } {
    const step = (this.openedCount % INFO_WINDOW.cascadeCount) * INFO_WINDOW.cascadeStepScreen
    this.openedCount++
    const baseX = INFO_WINDOW.marginScreen
    const baseY = TOOLBAR.marginScreen + TOOLBAR.buttonScreenSize + INFO_WINDOW.marginScreen
    return { x: (baseX + step) * DPR, y: (baseY + step) * DPR }
  }
}
