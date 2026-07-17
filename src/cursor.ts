const LERP_FACTOR = 0.15
const TRAIL_LENGTH = 16

export interface TrailSegment { x: number; y: number }

/**
 * Cursor with serpent trail — pure data, no DOM rendering.
 * The canvas renderer reads trail[] to draw fire and compute text blockers.
 */
export class Cursor {
  targetX = -9999
  targetY = -9999
  x = -9999
  y = -9999
  hasInteracted = false
  speed = 0
  trail: TrailSegment[] = []

  private hintEl: HTMLElement | null = null

  constructor() {
    this.hintEl = document.querySelector('.hint-pill')
    // Pre-fill trail
    for (let i = 0; i < TRAIL_LENGTH; i++) {
      this.trail.push({ x: -9999, y: -9999 })
    }
  }

  attach(): void {
    const onPointer = (px: number, py: number) => {
      this.targetX = px
      this.targetY = py
      if (!this.hasInteracted) {
        this.hasInteracted = true
        this.x = this.targetX
        this.y = this.targetY
        // Snap entire trail to initial position
        for (const seg of this.trail) { seg.x = this.x; seg.y = this.y }
        if (this.hintEl) this.hintEl.classList.add('hint-pill--hidden')
      }
    }

    window.addEventListener('mousemove', (e) => onPointer(e.clientX, e.clientY))
    const stage = document.getElementById('stage')
    if (stage) {
      stage.addEventListener('touchstart', (e) => {
        e.preventDefault(); onPointer(e.touches[0].clientX, e.touches[0].clientY)
      }, { passive: false })
      stage.addEventListener('touchmove', (e) => {
        e.preventDefault(); onPointer(e.touches[0].clientX, e.touches[0].clientY)
      }, { passive: false })
    }
  }

  update(): void {
    if (!this.hasInteracted) return

    const prevX = this.x
    const prevY = this.y
    this.x += (this.targetX - this.x) * LERP_FACTOR
    this.y += (this.targetY - this.y) * LERP_FACTOR

    const dx = this.x - prevX
    const dy = this.y - prevY
    this.speed = Math.sqrt(dx * dx + dy * dy)

    // Serpent trail: segment 0 = head, each follows the one before it
    this.trail[0].x = this.x
    this.trail[0].y = this.y
    for (let i = 1; i < TRAIL_LENGTH; i++) {
      this.trail[i].x += (this.trail[i - 1].x - this.trail[i].x) * LERP_FACTOR
      this.trail[i].y += (this.trail[i - 1].y - this.trail[i].y) * LERP_FACTOR
    }
  }
}

