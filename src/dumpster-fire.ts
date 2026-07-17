// Shooting stars — frequent enough to notice, keywords scatter as they pass

const MIN_INTERVAL = 1500
const MAX_INTERVAL = 5000
const MIN_DURATION = 2500
const MAX_DURATION = 5000

interface Star {
  el: HTMLElement
  x: number; y: number
  vx: number; vy: number
  life: number
  duration: number
  born: number
  angle: number
}

export interface StarPoint { x: number; y: number }

export class ShootingStars {
  private container: HTMLElement
  private stars: Star[] = []
  private nextSpawn = 0
  private vw = 0
  private vh = 0

  constructor() {
    this.container = document.createElement('div')
    this.container.style.position = 'fixed'
    this.container.style.inset = '0'
    this.container.style.pointerEvents = 'none'
    this.container.style.zIndex = '1'
    this.container.style.overflow = 'hidden'
    document.body.appendChild(this.container)
    this.nextSpawn = performance.now() + 500 + Math.random() * 2000
  }

  resize(vw: number, vh: number): void {
    this.vw = vw
    this.vh = vh
  }

  /** Return current positions of all active stars for physics interaction */
  getActivePositions(): StarPoint[] {
    return this.stars.map(s => ({ x: s.x, y: s.y }))
  }

  update(now: number): void {
    // Spawn — can have multiple in flight
    if (now >= this.nextSpawn && this.vw > 0) {
      this.spawn(now)
      this.nextSpawn = now + MIN_INTERVAL + Math.random() * (MAX_INTERVAL - MIN_INTERVAL)
    }

    for (let i = this.stars.length - 1; i >= 0; i--) {
      const s = this.stars[i]
      const elapsed = now - s.born
      s.life = 1 - elapsed / s.duration

      if (s.life <= 0) {
        s.el.remove()
        this.stars.splice(i, 1)
        continue
      }

      s.x += s.vx
      s.y += s.vy

      const fadeIn = Math.min(1, elapsed / (s.duration * 0.08))
      const fadeOut = s.life
      const opacity = Math.min(fadeIn, fadeOut) * 0.55

      s.el.style.transform = `translate(${s.x}px, ${s.y}px) rotate(${s.angle}deg)`
      s.el.style.opacity = String(opacity)
    }
  }

  private spawn(now: number): void {
    const el = document.createElement('div')
    el.className = 'shooting-star'
    this.container.appendChild(el)

    const speed = 1.0 + Math.random() * 1.5

    let x: number, y: number
    const side = Math.floor(Math.random() * 4)
    if (side === 0) { x = Math.random() * this.vw; y = -20 }
    else if (side === 1) { x = this.vw + 20; y = Math.random() * this.vh }
    else if (side === 2) { x = Math.random() * this.vw; y = this.vh + 20 }
    else { x = -20; y = Math.random() * this.vh }

    const cx = this.vw * (0.2 + Math.random() * 0.6)
    const cy = this.vh * (0.2 + Math.random() * 0.6)
    const dx = cx - x
    const dy = cy - y
    const dist = Math.sqrt(dx * dx + dy * dy)
    const vx = (dx / dist) * speed + (Math.random() - 0.5) * 0.4
    const vy = (dy / dist) * speed + (Math.random() - 0.5) * 0.4

    const duration = MIN_DURATION + Math.random() * (MAX_DURATION - MIN_DURATION)

    const trailLen = 50 + Math.random() * 100
    el.style.width = `${trailLen}px`

    const angle = Math.atan2(vy, vx) * (180 / Math.PI)
    el.style.transform = `translate(${x}px, ${y}px) rotate(${angle}deg)`

    this.stars.push({ el, x, y, vx, vy, life: 1, duration, born: now, angle })
  }
}