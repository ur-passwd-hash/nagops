const LABELS = [
  'SPRINT ENDS IN',
  'DEPLOY DEADLINE',
  'DEMO DAY IN',
  'STANDUP IN',
  'RETRO IN',
  'INCIDENT REVIEW IN',
  'STATUS UPDATE DUE IN',
  'QUARTERLY REVIEW IN',
  'PERF REVIEW IN',
  'ALL-HANDS IN',
]

export class SprintCountdown {
  private el: HTMLElement
  private labelEl: HTMLElement
  private timeEl: HTMLElement
  private endTime: number
  private currentLabel: string
  private onZeroCb: (() => void) | null = null
  private fired = false

  constructor() {
    this.el = document.createElement('div')
    this.el.className = 'sprint-countdown'

    this.labelEl = document.createElement('div')
    this.labelEl.className = 'countdown-label'

    this.timeEl = document.createElement('div')
    this.timeEl.className = 'countdown-time'

    this.el.appendChild(this.labelEl)
    this.el.appendChild(this.timeEl)
    document.body.appendChild(this.el)

    this.currentLabel = ''
    this.endTime = 0
    this.reset()
  }

  /** Register callback for when countdown hits zero */
  onZero(cb: () => void): void {
    this.onZeroCb = cb
  }

  reset(): void {
    this.endTime = Date.now() + 30_000
    this.currentLabel = LABELS[Math.floor(Math.random() * LABELS.length)]
    this.labelEl.textContent = this.currentLabel
    this.timeEl.style.color = ''
    this.fired = false
  }

  update(): void {
    // Once fired, hold at 00:00:00 until reset() — no sentinel math leaking
    // into the display.
    if (this.fired) {
      this.timeEl.textContent = '00:00:00'
      return
    }

    const remaining = Math.max(0, this.endTime - Date.now())

    if (remaining <= 0) {
      this.timeEl.textContent = '00:00:00'
      this.timeEl.style.color = '#ff4444'
      this.fired = true
      if (this.onZeroCb) this.onZeroCb()
      return
    }

    const hours = Math.floor(remaining / 3_600_000)
    const mins = Math.floor((remaining % 3_600_000) / 60_000)
    const secs = Math.floor((remaining % 60_000) / 1_000)

    this.timeEl.textContent =
      `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }
}

