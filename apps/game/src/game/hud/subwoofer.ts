import Phaser from 'phaser'
import { DEPTH, SUBWOOFER } from '../config'

/** Texture/audio cache keys, shared by the preloader and this component. */
export const SUBWOOFER_IMAGE_KEY = 'subwoofer'
export const SUBWOOFER_AUDIO_KEY = 'subwoofer-bass'

/**
 * The `/subwoofer` easter egg: flash a photo centred on screen while a sound
 * plays, then fade it out when the sound finishes. The image lives on the fixed
 * UI camera (constant on-screen size, like the rest of the HUD) — `MainScene`
 * routes `objects` there — so it does not pan/zoom with the world.
 */
export class Subwoofer {
  private readonly scene: Phaser.Scene
  private readonly image: Phaser.GameObjects.Image
  /** Created lazily on first trigger; `sound.add` needs the audio decoded first. */
  private sound: Phaser.Sound.BaseSound | null = null

  constructor(scene: Phaser.Scene) {
    this.scene = scene
    this.image = scene.add
      .image(0, 0, SUBWOOFER_IMAGE_KEY)
      .setDepth(DEPTH.subwoofer)
      .setVisible(false)
      .setAlpha(0)
    this.layout()
  }

  /** For the owner to route onto the UI camera (see `MainScene.setupCameras`). */
  get objects(): Phaser.GameObjects.GameObject[] {
    return [this.image]
  }

  /** Re-centre + re-fit after a viewport resize; position is absolute screen pixels. */
  reposition(): void {
    this.layout()
  }

  private layout(): void {
    const { width, height } = this.scene.scale
    this.image.setPosition(width / 2, height / 2)
    // Fit the longest edge to a fraction of the smaller viewport dimension so the
    // photo is always fully visible in portrait or landscape.
    const maxEdge = Math.min(width, height) * SUBWOOFER.maxScreenFraction
    this.image.setScale(maxEdge / Math.max(this.image.width, this.image.height))
  }

  /**
   * Play the sound and reveal the photo; hide it again when the sound ends.
   * Ignores a re-trigger while already playing so a mashed command doesn't stack
   * overlapping playbacks and fade tweens.
   */
  trigger(): void {
    if (!this.sound) this.sound = this.scene.sound.add(SUBWOOFER_AUDIO_KEY)
    if (this.sound.isPlaying) return

    this.layout()
    this.image.setVisible(true)
    this.scene.tweens.add({ targets: this.image, alpha: 1, duration: SUBWOOFER.fadeMs })
    // `once`: exactly one hide per play; a fresh listener is registered each trigger.
    this.sound.once(Phaser.Sound.Events.COMPLETE, () => this.hide())
    this.sound.play()
  }

  private hide(): void {
    this.scene.tweens.add({
      targets: this.image,
      alpha: 0,
      duration: SUBWOOFER.fadeMs,
      onComplete: () => this.image.setVisible(false),
    })
  }

  destroy(): void {
    this.sound?.destroy()
    this.image.destroy()
  }
}
