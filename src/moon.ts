/**
 * Draggable moon (moon.gif) — click/tap to spin with centrifugal keyword burst.
 * Dragging does NOT trigger spin; only clean clicks/taps do.
 */
import moonGifUrl from '../moon.gif'

const isMobile = () => window.innerWidth < 768 || 'ontouchstart' in window
const getMoonSize = () => isMobile() ? 98 : 140
const SPIN_DURATION = 2500
const CENTRIFUGAL_RADIUS = 280
const CENTRIFUGAL_STRENGTH = 18
const DRAG_THRESHOLD = 6  // px of movement to distinguish drag from click

export class Moon {
  private el: HTMLElement
  private img: HTMLImageElement
  private spinning = false
  private spinStart = 0
  private onBurst: ((cx: number, cy: number, radius: number, strength: number) => void) | null = null

  // Position (top-left corner of the element)
  private posX = 0
  private posY = 0

  // Drag state
  private dragging = false
  private dragStartX = 0
  private dragStartY = 0
  private dragOffsetX = 0
  private dragOffsetY = 0
  private dragMoved = false

  constructor() {
    this.el = document.createElement('div')
    this.el.className = 'moon'

    this.img = document.createElement('img')
    this.img.src = moonGifUrl
    this.img.className = 'moon-img'
    this.img.draggable = false
    this.el.appendChild(this.img)

    // Prevent window click handler from firing when clicking moon
    this.el.addEventListener('click', (e) => { e.stopPropagation() })

    document.body.appendChild(this.el)

    // Default position: top-right corner
    const size = getMoonSize()
    this.el.style.width = `${size}px`
    this.el.style.height = `${size}px`
    this.posX = Math.round(window.innerWidth * 0.72)
    this.posY = Math.round(window.innerHeight * 0.5 - size / 2)
    this.applyPosition()

    // Mouse drag
    this.el.addEventListener('mousedown', (e) => {
      e.stopPropagation()
      e.preventDefault()
      this.onDragStart(e.clientX, e.clientY)
    })
    window.addEventListener('mousemove', (e) => this.onDragMove(e.clientX, e.clientY))
    window.addEventListener('mouseup', (e) => this.onDragEnd(e))

    // Touch drag
    this.el.addEventListener('touchstart', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const t = e.touches[0]
      this.onDragStart(t.clientX, t.clientY)
    }, { passive: false })
    window.addEventListener('touchmove', (e) => {
      if (!this.dragging) return
      const t = e.touches[0]
      this.onDragMove(t.clientX, t.clientY)
    }, { passive: true })
    window.addEventListener('touchend', (e) => this.onDragEnd(e))
  }

  onCentrifugalBurst(cb: (cx: number, cy: number, radius: number, strength: number) => void): void {
    this.onBurst = cb
  }

  get centerX(): number { return this.posX + getMoonSize() / 2 }
  get centerY(): number { return this.posY + getMoonSize() / 2 }

  private applyPosition(): void {
    this.el.style.left = `${this.posX}px`
    this.el.style.top = `${this.posY}px`
  }

  private onDragStart(clientX: number, clientY: number): void {
    this.dragging = true
    this.dragMoved = false
    this.dragStartX = clientX
    this.dragStartY = clientY
    this.dragOffsetX = clientX - this.posX
    this.dragOffsetY = clientY - this.posY
    this.el.style.cursor = 'grabbing'
  }

  private onDragMove(clientX: number, clientY: number): void {
    if (!this.dragging) return
    const dx = clientX - this.dragStartX
    const dy = clientY - this.dragStartY
    if (!this.dragMoved && Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
      this.dragMoved = true
    }
    if (this.dragMoved) {
      this.posX = clientX - this.dragOffsetX
      this.posY = clientY - this.dragOffsetY
      // Clamp to viewport
      const size = getMoonSize()
      this.posX = Math.max(0, Math.min(window.innerWidth - size, this.posX))
      this.posY = Math.max(0, Math.min(window.innerHeight - size, this.posY))
      this.applyPosition()
    }
  }

  private onDragEnd(_e?: Event): void {
    if (!this.dragging) return
    this.dragging = false
    this.el.style.cursor = 'grab'
    // Only spin if it was a clean click (no significant drag)
    if (!this.dragMoved) {
      this.spin()
    }
  }

  private spin(): void {
    this.spinning = true
    this.spinStart = performance.now()
    this.el.classList.remove('moon--spinning')
    void this.el.offsetWidth
    this.el.classList.add('moon--spinning')

    if (this.onBurst) {
      this.onBurst(this.centerX, this.centerY, CENTRIFUGAL_RADIUS, CENTRIFUGAL_STRENGTH)
    }
  }

  update(now: number): void {
    if (!this.spinning) return
    const elapsed = now - this.spinStart

    if (elapsed > SPIN_DURATION) {
      this.spinning = false
      this.el.classList.remove('moon--spinning')
      return
    }

    const decay = 1 - elapsed / SPIN_DURATION
    const strength = CENTRIFUGAL_STRENGTH * decay * decay * 0.15
    if (this.onBurst && strength > 0.5) {
      this.onBurst(this.centerX, this.centerY, CENTRIFUGAL_RADIUS * decay, strength)
    }
  }
}
