/**
 * The boot overlay's progress readout. `index.html` ships the fixed markup
 * (spinner, bar, status line inside `#loader`); this class only mutates it while
 * boot work streams in, and dies with the overlay when `main.ts` removes it on
 * APP_READY_EVENT. Deliberately DOM-only — it must already work before the
 * Phaser game exists, so the font phase reports through the same surface as the
 * asset phase.
 */
export class LoaderUi {
  private readonly barFill: HTMLElement
  private readonly status: HTMLElement

  constructor(loader: HTMLElement) {
    this.barFill = requirePart(loader, '.loader-bar-fill')
    this.status = requirePart(loader, '.loader-status')
  }

  setProgress(fraction: number): void {
    if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) {
      throw new Error(`[boot] loader progress out of range: ${fraction}`)
    }
    this.barFill.style.width = `${fraction * 100}%`
  }

  setStatus(text: string): void {
    this.status.textContent = text
  }
}

function requirePart(loader: HTMLElement, selector: string): HTMLElement {
  const el = loader.querySelector<HTMLElement>(selector)
  if (!el) throw new Error(`[boot] loader is missing its ${selector} element`)
  return el
}
