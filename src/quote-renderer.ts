import type { BubbleLayout } from './types.ts'

export class QuoteRenderer {
  private bubble: HTMLElement
  private linePool: HTMLSpanElement[] = []
  private visible = false

  constructor(container: HTMLElement) {
    this.bubble = document.createElement('div')
    this.bubble.className = 'quote-bubble'
    this.bubble.style.position = 'absolute'
    this.bubble.style.willChange = 'transform'
    this.bubble.style.pointerEvents = 'none'
    this.bubble.style.opacity = '0'
    container.appendChild(this.bubble)
  }

  show(): void {
    if (!this.visible) {
      this.visible = true
      this.bubble.style.opacity = '1'
    }
  }

  private ensureLinePool(count: number): void {
    while (this.linePool.length < count) {
      const el = document.createElement('span')
      el.className = 'quote-line'
      el.style.position = 'absolute'
      el.style.whiteSpace = 'pre'
      el.style.left = '0'
      this.bubble.appendChild(el)
      this.linePool.push(el)
    }
  }

  render(layout: BubbleLayout): void {
    if (layout.lines.length === 0) return

    this.bubble.style.transform = `translate(${layout.bubbleX}px, ${layout.bubbleY}px)`
    this.bubble.style.width = `${layout.bubbleWidth}px`
    this.bubble.style.height = `${layout.bubbleHeight}px`

    this.ensureLinePool(layout.lines.length)

    for (let i = 0; i < layout.lines.length; i++) {
      const line = layout.lines[i]
      const el = this.linePool[i]
      if (line.text.includes('**')) {
        el.textContent = ''
        const parts = line.text.split(/(\*\*.+?\*\*)/g)
        for (const part of parts) {
          if (part.startsWith('**') && part.endsWith('**')) {
            const b = document.createElement('b')
            b.textContent = part.slice(2, -2)
            el.appendChild(b)
          } else {
            el.appendChild(document.createTextNode(part))
          }
        }
      } else {
        el.textContent = line.text
      }
      el.style.transform = `translate(${line.x}px, ${line.y}px)`
      el.style.display = ''
    }

    for (let i = layout.lines.length; i < this.linePool.length; i++) {
      this.linePool[i].style.display = 'none'
    }
  }
}

