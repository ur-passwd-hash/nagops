/**
 * UFO fleet — 2 concurrent ships. First run: cow abduction.
 * Then burst mode: UFOs every 4s for 30s, 3min cooldown, repeat.
 * Two color variants assigned randomly per ship.
 */

export interface UfoPoint { x: number; y: number; attract: boolean }

type Phase = 'idle' | 'to-moon' | 'abduct' | 'exit-cow' | 'wait' | 'to-target' | 'explode' | 'exit-final' | 'fade-out'

const SPEED = 4
const ABDUCT_DURATION = 1500
const EXPLODE_DURATION = 1800
const WAIT_DURATION = 2000
const BURST_INTERVAL = 4000
const BURST_DURATION = 30_000
const COOLDOWN = 180_000

// ── Single UFO ship ──
class UfoShip {
  el: HTMLElement
  private beamEl: HTMLElement
  private cowEl: HTMLElement
  phase: Phase = 'idle'
  private phaseStart = 0
  private x = -100
  private y = 100
  private tx = 0
  private ty = 0
  onExplode: ((x: number, y: number) => void) | null = null
  onCollisionExplode: ((x: number, y: number) => void) | null = null
  onDone: (() => void) | null = null
  hasRun = false

  constructor() {
    this.el = document.createElement('div')
    this.el.className = 'ufo'
    this.el.innerHTML = `
      <div class="ufo-dome"></div>
      <div class="ufo-body"></div>
      <div class="ufo-lights"><span></span><span></span><span></span><span></span><span></span></div>
    `
    this.el.style.display = 'none'
    this.beamEl = document.createElement('div')
    this.beamEl.className = 'ufo-beam'
    this.beamEl.style.display = 'none'
    this.el.appendChild(this.beamEl)
    this.cowEl = document.createElement('div')
    this.cowEl.className = 'ufo-cow'
    this.cowEl.textContent = '🐄'
    this.cowEl.style.display = 'none'
    this.el.appendChild(this.cowEl)
    document.body.appendChild(this.el)

    // Ship It: click an inbound UFO to intercept it before it abducts a
    // keyword. Funnels through the same collision-explosion path as ramming
    // it with the asteroid cursor. The cow run is sacred — not interceptable.
    this.el.addEventListener('click', (e) => {
      e.stopPropagation()
      if (this.phase === 'to-target') {
        this.el.style.zIndex = '-1'
        this.phase = 'fade-out'; this.phaseStart = performance.now()
        if (this.onCollisionExplode) this.onCollisionExplode(this.x, this.y + 20)
      }
    })
  }

  private assignVariant(): void {
    this.el.classList.toggle('ufo--pastel', Math.random() < 0.5)
  }

  startCowRun(moonX: number, moonY: number): void {
    if (this.phase !== 'idle') return
    this.assignVariant()
    this.el.style.display = ''
    this.x = -120
    this.y = moonY - 30 + Math.random() * 60
    this.tx = moonX
    this.ty = moonY - 140
    this.phase = 'to-moon'
    this.phaseStart = performance.now()
    this.applyPos()
  }

  startExplosionRun(target: { x: number; y: number } | null): void {
    if (this.phase !== 'idle') return
    this.assignVariant()
    this.el.style.display = ''
    const vw = window.innerWidth
    const vh = window.innerHeight
    const side = Math.random() < 0.5
    this.x = side ? -120 : vw + 120
    this.y = 80 + Math.random() * (vh * 0.6)
    if (target) { this.tx = target.x; this.ty = target.y - 50 }
    else { this.tx = vw * (0.2 + Math.random() * 0.6); this.ty = vh * (0.2 + Math.random() * 0.6) }
    this.phase = 'to-target'
    this.phaseStart = performance.now()
    this.applyPos()
  }

  update(now: number, cursorX: number, cursorY: number): void {
    if (this.phase === 'idle') return
    const elapsed = now - this.phaseStart

    switch (this.phase) {
      case 'to-moon':
        if (this.moveToward(this.tx, this.ty)) {
          this.phase = 'abduct'; this.phaseStart = now
          this.beamEl.style.display = ''; this.cowEl.style.display = ''
        }
        break
      case 'abduct':
        if (elapsed > ABDUCT_DURATION) {
          this.phase = 'exit-cow'; this.phaseStart = now
          this.tx = window.innerWidth + 140; this.ty = this.y - 20
        } else {
          const lift = elapsed / ABDUCT_DURATION
          this.cowEl.style.transform = `translateX(-50%) translateY(${70 * (1 - lift)}px) scale(${1 - lift * 0.3})`
        }
        break
      case 'exit-cow':
        if (this.moveToward(this.tx, this.ty)) {
          this.beamEl.style.display = 'none'; this.cowEl.style.display = 'none'
          this.phase = 'wait'; this.phaseStart = now
        }
        break
      case 'wait':
        this.el.style.display = 'none'
        if (elapsed > WAIT_DURATION) {
          this.el.style.display = ''
          const vw = window.innerWidth; const vh = window.innerHeight
          this.x = vw + 120; this.y = 80 + Math.random() * (vh * 0.5)
          this.tx = vw * (0.2 + Math.random() * 0.6)
          this.ty = vh * (0.2 + Math.random() * 0.6)
          this.phase = 'to-target'; this.phaseStart = now; this.applyPos()
        }
        break
      case 'to-target': {
        // Collision check with asteroid cursor
        const dx = this.x - cursorX; const dy = this.y - cursorY
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (cursorX > -1000 && dist < 55) {
          // Asteroid hit the UFO — dramatic collision explosion + fade out
          this.el.style.zIndex = '-1' // drop below canvas so explosion renders on top
          this.phase = 'fade-out'; this.phaseStart = now
          if (this.onCollisionExplode) this.onCollisionExplode(this.x, this.y + 20)
          break
        }
        if (this.moveToward(this.tx, this.ty)) {
            this.phase = 'explode'; this.phaseStart = now
          if (this.onExplode) this.onExplode(this.x, this.y + 20)
        }
        break
      }
      case 'explode':
        // Normal timed explosion — fly off after
        if (elapsed > EXPLODE_DURATION) {
          this.tx = -140; this.ty = this.y - 60
          this.phase = 'exit-final'; this.phaseStart = now
        }
        break
      case 'fade-out': {
        // Collision fade-out: opacity 1→0 over 600ms, then hide
        const FADE_DURATION = 600
        const fade = Math.max(0, 1 - elapsed / FADE_DURATION)
        this.el.style.opacity = fade.toFixed(2)
        if (elapsed >= FADE_DURATION) {
          this.el.style.display = 'none'
          this.el.style.opacity = '1'
          this.el.style.zIndex = '1' // restore z-index
          this.phase = 'idle'; this.hasRun = true
          if (this.onDone) this.onDone()
        }
        break
      }
      case 'exit-final':
        if (this.moveToward(this.tx, this.ty)) {
          this.el.style.display = 'none'; this.phase = 'idle'; this.hasRun = true
          if (this.onDone) this.onDone()
        }
        break
    }
    this.applyPos()
  }

  private moveToward(tx: number, ty: number): boolean {
    const dx = tx - this.x; const dy = ty - this.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < SPEED) { this.x = tx; this.y = ty; return true }
    this.x += (dx / dist) * SPEED; this.y += (dy / dist) * SPEED
    return false
  }

  private applyPos(): void {
    this.el.style.transform = `translate(${this.x - 40}px, ${this.y - 20}px)`
  }
}

// ── Fleet manager: 2 ships, burst timing ──
export class Ufo {
  private ships: UfoShip[]
  private cowStarted = false
  private firstRunDone = false
  private nextRepeat = 0
  private burstStart = 0
  private inBurst = false
  private cooldownEnd = 0
  private inCooldown = false
  private keywordTarget: { x: number; y: number } | null = null
  private onCompleteCb: (() => void) | null = null
  private onExplodeCb: ((x: number, y: number) => void) | null = null
  private onCollisionExplodeCb: ((x: number, y: number) => void) | null = null

  constructor() {
    this.ships = [new UfoShip(), new UfoShip()]
    for (const ship of this.ships) {
      ship.onExplode = (x, y) => { if (this.onExplodeCb) this.onExplodeCb(x, y) }
      ship.onCollisionExplode = (x, y) => { if (this.onCollisionExplodeCb) this.onCollisionExplodeCb(x, y) }
      ship.onDone = () => { if (this.onCompleteCb) this.onCompleteCb() }
    }
  }

  onSequenceComplete(cb: () => void): void { this.onCompleteCb = cb }
  onExplosion(cb: (x: number, y: number) => void): void { this.onExplodeCb = cb }
  onCollisionExplosion(cb: (x: number, y: number) => void): void { this.onCollisionExplodeCb = cb }

  setKeywordTarget(x: number, y: number): void {
    this.keywordTarget = { x, y }
  }

  /** First run: cow abduction on ship 0 — only once */
  start(moonX: number, moonY: number): void {
    if (this.cowStarted) return
    this.cowStarted = true
    this.ships[0].startCowRun(moonX, moonY)
  }

  /** Find an idle ship, or null */
  private getIdleShip(): UfoShip | null {
    return this.ships.find(s => s.phase === 'idle') ?? null
  }

  update(now: number, cursorX: number, cursorY: number): void {
    // Burst scheduling
    if (this.firstRunDone && now >= this.nextRepeat) {
      if (!this.inBurst) {
        this.inBurst = true
        this.burstStart = now
      }
      if (this.inBurst) {
        const burstElapsed = now - this.burstStart
        if (burstElapsed < BURST_DURATION) {
          const ship = this.getIdleShip()
          if (ship) {
            ship.startExplosionRun(this.keywordTarget)
            this.nextRepeat = now + BURST_INTERVAL
          }
        } else {
          // Burst over — enter cooldown, then full reset
          this.inBurst = false
          this.cooldownEnd = now + COOLDOWN
          this.inCooldown = true
          this.firstRunDone = false
        }
      }
    }

    // After cooldown ends, reset everything for a new cow→burst cycle
    if (this.inCooldown && now >= this.cooldownEnd) {
      this.inCooldown = false
      this.cowStarted = false
      this.firstRunDone = false
      for (const ship of this.ships) { ship.hasRun = false }
      // Trigger countdown reset → 30s later onZero fires → start() cow
      if (this.onCompleteCb) this.onCompleteCb()
    }

    // Detect first run completion
    for (const ship of this.ships) {
      ship.update(now, cursorX, cursorY)
    }

    // After ship 0's first cow run finishes, start burst
    if (!this.firstRunDone && !this.inCooldown &&
        this.ships[0].hasRun && this.ships[0].phase === 'idle') {
      this.firstRunDone = true
      this.nextRepeat = now + BURST_INTERVAL
      this.inBurst = true
      this.burstStart = now
    }
  }
}
