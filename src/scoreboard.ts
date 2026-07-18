/**
 * Ship It scoreboard — bottom-left HUD, mirror of the sprint countdown.
 *
 * Zero-CLS by construction: the widest possible score string is measured with
 * pretext ONCE at boot, and that width is reserved before the first digit
 * renders. The number ticks up for the whole session without causing a single
 * pixel of layout shift. The only thing on this site that ships on schedule
 * is the layout.
 *
 * Scoring rule: a shipped keyword is worth its pretext-measured pixel width.
 * "microservices" out-scores "k8s" because it measures wider. The score IS
 * the measurement.
 */
import { prepareWithSegments, layoutNextLine } from '@chenglou/pretext'

const isMobile = () => window.innerWidth < 768 || 'ontouchstart' in window

function measure(text: string, font: string): number {
  const prepared = prepareWithSegments(text, font)
  const line = layoutNextLine(prepared, { segmentIndex: 0, graphemeIndex: 0 }, 99999)
  return line ? line.width : 0
}

export class Scoreboard {
  private el: HTMLElement
  private labelEl: HTMLElement
  private numEl: HTMLElement
  private subEl!: HTMLElement
  private score = 0
  private shipped = 0
  private flashTimer: number | undefined

  constructor() {
    const numFont = isMobile()
      ? '900 16px Inter, sans-serif'
      : '900 22px Inter, sans-serif'

    this.el = document.createElement('div')
    this.el.className = 'ship-scoreboard'

    this.labelEl = document.createElement('div')
    this.labelEl.className = 'scoreboard-label'
    this.labelEl.textContent = 'FEATURES SHIPPED'

    this.numEl = document.createElement('div')
    this.numEl.className = 'scoreboard-score'
    this.numEl.style.font = numFont
    // Reserve space for the largest score this HUD can ever show — measured
    // with pretext before first paint, so the ticking number never reflows.
    this.numEl.style.minWidth = `${Math.ceil(measure('9,999,999 pts', numFont))}px`
    this.numEl.textContent = '0 pts'

    this.subEl = document.createElement('div')
    this.subEl.className = 'scoreboard-sub'
    this.subEl.textContent = 'ship something'

    this.el.appendChild(this.labelEl)
    this.el.appendChild(this.numEl)
    this.el.appendChild(this.subEl)
    document.body.appendChild(this.el)
  }

  get total(): number { return this.score }

  /** A keyword was shipped: score += its measured pixel width. */
  ship(points: number): void {
    this.score += points
    this.shipped += 1
    this.render('#3ce8b4')
  }

  /** A UFO abducted an unshipped keyword: score -= its measured pixel width. */
  steal(points: number): void {
    this.score = Math.max(0, this.score - points)
    this.render('#ff4444')
  }

  get shippedCount(): number { return this.shipped }

  private render(flashColor: string): void {
    this.numEl.textContent = `${this.score.toLocaleString('en-US')} pts`
    this.subEl.textContent = `${this.shipped} feature${this.shipped === 1 ? '' : 's'} shipped`
    this.numEl.style.color = flashColor
    // Scale pop — transform only, so still zero layout shift
    this.numEl.classList.remove('pop')
    void this.numEl.offsetWidth // restart animation
    this.numEl.classList.add('pop')
    clearTimeout(this.flashTimer)
    this.flashTimer = window.setTimeout(() => {
      this.numEl.style.color = ''
    }, 400)
  }
}
