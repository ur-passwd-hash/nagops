const TYPERS = [
  'PM is typing',
  'Scrum Master is typing',
  'Product Owner is typing',
  'your skip-level is typing',
  'CTO is typing',
  'HR is typing',
  'Legal is typing',
  'the intern is typing',
  'someone from compliance is typing',
  'VP of Engineering is typing',
  'that consultant is typing',
  'the new hire is typing',
  'your tech lead is typing',
  'someone in #general is typing',
  'a recruiter is typing',
]

export class TypingIndicator {
  private el: HTMLElement
  private dotEl: HTMLElement
  private textEl: HTMLElement
  private visible = false
  private nextToggle = 0

  constructor() {
    this.el = document.createElement('div')
    this.el.className = 'typing-indicator'

    this.dotEl = document.createElement('span')
    this.dotEl.className = 'typing-dot'
    this.dotEl.textContent = '●'

    this.textEl = document.createElement('span')
    this.textEl.className = 'typing-text'

    this.el.appendChild(this.dotEl)
    this.el.appendChild(this.textEl)
    document.body.appendChild(this.el)

    this.scheduleNext()
  }

  private scheduleNext(): void {
    // Show after 3–10 seconds, hide after 2–6 seconds
    if (this.visible) {
      this.nextToggle = performance.now() + 2000 + Math.random() * 4000
    } else {
      this.nextToggle = performance.now() + 3000 + Math.random() * 7000
    }
  }

  update(now: number): void {
    if (now < this.nextToggle) return

    this.visible = !this.visible
    if (this.visible) {
      const typer = TYPERS[Math.floor(Math.random() * TYPERS.length)]
      this.textEl.textContent = `${typer}...`
      this.el.style.opacity = '1'
      this.el.style.transform = 'translateY(0)'
    } else {
      this.el.style.opacity = '0'
      this.el.style.transform = 'translateY(8px)'
    }
    this.scheduleNext()
  }
}

