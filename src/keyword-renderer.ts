import type { Keyword } from './types.ts'
import { FONT_MAP } from './keyword-field.ts'

// Max brightness per tier
const MAX_BRIGHTNESS = {
  large: 240,
  normal: 200,
  small: 160,
} as const

// Min brightness (far stars)
const MIN_BRIGHTNESS = 30

export class KeywordRenderer {
  private pool: HTMLSpanElement[] = []
  private container: HTMLElement

  constructor(container: HTMLElement) {
    this.container = container
  }

  clear(): void {
    for (const el of this.pool) el.remove()
    this.pool = []
  }

  ensurePool(count: number): void {
    while (this.pool.length < count) {
      const el = document.createElement('span')
      el.className = 'keyword'
      el.style.position = 'absolute'
      el.style.whiteSpace = 'nowrap'
      el.style.willChange = 'transform, opacity'
      el.style.pointerEvents = 'none'
      el.style.userSelect = 'none'
      this.container.appendChild(el)
      this.pool.push(el)
    }
  }

  render(keywords: Keyword[]): void {
    this.ensurePool(keywords.length)
    for (let i = 0; i < keywords.length; i++) {
      const kw = keywords[i]
      const el = this.pool[i]
      if (!el.textContent) {
        el.textContent = kw.text
        el.style.font = FONT_MAP[kw.size]
        // Starfield depth → color brightness
        const max = MAX_BRIGHTNESS[kw.size]
        const gray = Math.round(MIN_BRIGHTNESS + kw.depth * (max - MIN_BRIGHTNESS))
        el.style.color = `rgb(${gray},${gray},${gray})`
      }
      el.style.transform = `translate(${kw.x}px, ${kw.y}px)`
      el.style.opacity = String(kw.opacity)
    }
    // Hide excess
    for (let i = keywords.length; i < this.pool.length; i++) {
      this.pool[i].style.opacity = '0'
    }
  }
}

