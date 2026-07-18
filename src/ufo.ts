/**
 * UFO fleet — 2 concurrent ships. First-ever run: cow abduction. After that,
 * every sprint-clock zero launches one keyword-abduction run.
 * Two color variants assigned randomly per ship.
 */

export interface UfoPoint { x: number; y: number; attract: boolean }

type Phase = 'idle' | 'to-moon' | 'abduct' | 'exit-cow' | 'wait' | 'to-target' | 'explode' | 'exit-final' | 'fade-out'

const SPEED = 4 // px per 60fps-frame; scaled by dt so throttled tabs don't freeze the fleet
const ABDUCT_DURATION = 1500
const EXPLODE_DURATION = 1800
const WAIT_DURATION = 2000

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
    // Unique gradient IDs per ship — shared IDs break when the other ship's
    // <defs> owner is display:none.
    const uid = `u${Math.random().toString(36).slice(2, 7)}`
    this.el.innerHTML = `
      <svg class="ufo-svg" viewBox="0 0 120 72" width="120" height="72" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="ufoDome-${uid}" cx="38%" cy="28%" r="80%">
            <stop offset="0%" stop-color="#eafff3" stop-opacity="0.95"/>
            <stop offset="30%" stop-color="#8fe8b8" stop-opacity="0.8"/>
            <stop offset="75%" stop-color="#2a6b47" stop-opacity="0.85"/>
            <stop offset="100%" stop-color="#123324" stop-opacity="0.95"/>
          </radialGradient>
          <linearGradient id="ufoHull-${uid}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#c3cbdd"/>
            <stop offset="30%" stop-color="#828da6"/>
            <stop offset="62%" stop-color="#454e63"/>
            <stop offset="88%" stop-color="#232939"/>
            <stop offset="100%" stop-color="#151a27"/>
          </linearGradient>
          <linearGradient id="ufoRim-${uid}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#38405a"/>
            <stop offset="100%" stop-color="#0c0f18"/>
          </linearGradient>
          <radialGradient id="ufoEngine-${uid}" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#9dffce" stop-opacity="0.9"/>
            <stop offset="60%" stop-color="#4be08f" stop-opacity="0.45"/>
            <stop offset="100%" stop-color="#4be08f" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <!-- glass dome + alien pilot -->
        <ellipse cx="60" cy="24" rx="26" ry="20" fill="url(#ufoDome-${uid})"/>
        <g class="ufo-alien">
          <ellipse cx="60" cy="27" rx="8" ry="9" fill="#57c785"/>
          <ellipse cx="56.5" cy="25.5" rx="2.4" ry="3.2" fill="#0e1f16"/>
          <ellipse cx="63.5" cy="25.5" rx="2.4" ry="3.2" fill="#0e1f16"/>
          <ellipse cx="57.2" cy="24.6" rx="0.8" ry="1" fill="#bfffe0"/>
          <ellipse cx="64.2" cy="24.6" rx="0.8" ry="1" fill="#bfffe0"/>
        </g>
        <ellipse cx="50" cy="14" rx="10" ry="5" fill="#ffffff" opacity="0.5"/>
        <!-- saucer hull -->
        <ellipse cx="60" cy="44" rx="57" ry="17" fill="url(#ufoHull-${uid})"/>
        <ellipse cx="60" cy="40" rx="57" ry="12" fill="#c9d2e4" opacity="0.22"/>
        <!-- panel seams -->
        <path d="M 8 44 Q 60 30 112 44" stroke="#1a2030" stroke-width="1" fill="none" opacity="0.55"/>
        <path d="M 14 49 Q 60 62 106 49" stroke="#0e1220" stroke-width="1" fill="none" opacity="0.5"/>
        <line x1="30" y1="34.5" x2="26" y2="41" stroke="#1a2030" stroke-width="0.8" opacity="0.45"/>
        <line x1="60" y1="32" x2="60" y2="38.5" stroke="#1a2030" stroke-width="0.8" opacity="0.45"/>
        <line x1="90" y1="34.5" x2="94" y2="41" stroke="#1a2030" stroke-width="0.8" opacity="0.45"/>
        <!-- underside + engine glow -->
        <ellipse cx="60" cy="52" rx="36" ry="9" fill="url(#ufoRim-${uid})"/>
        <ellipse class="ufo-engine" cx="60" cy="54" rx="22" ry="6" fill="url(#ufoEngine-${uid})"/>
        <!-- rim running lights -->
        <circle class="rl" cx="12" cy="42" r="3" fill="#ff5252"/>
        <circle class="rl" cx="30" cy="50" r="3" fill="#ffb74d"/>
        <circle class="rl" cx="60" cy="54" r="3" fill="#69f0ae"/>
        <circle class="rl" cx="90" cy="50" r="3" fill="#ff5252"/>
        <circle class="rl" cx="108" cy="42" r="3" fill="#ffb74d"/>
      </svg>
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

  update(now: number, cursorX: number, cursorY: number, dt = 1): void {
    if (this.phase === 'idle') return
    this.dt = dt
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
        if (cursorX > -1000 && dist < 72) { // bigger ship, bigger hitbox
          // Asteroid hit the UFO — dramatic collision explosion + fade out
          this.el.style.zIndex = '-1' // drop below canvas so explosion renders on top
          this.phase = 'fade-out'; this.phaseStart = now
          if (this.onCollisionExplode) this.onCollisionExplode(this.x, this.y + 20)
          break
        }
        if (this.moveToward(this.tx, this.ty)) {
            this.phase = 'explode'; this.phaseStart = now
          this.beamEl.style.display = '' // tractor beam on while glyphs rise
          if (this.onExplode) this.onExplode(this.x, this.y + 20)
        }
        break
      }
      case 'explode':
        // Hover with the beam on while the abduction plays out, then leave
        if (elapsed > EXPLODE_DURATION) {
          this.beamEl.style.display = 'none'
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

  private dt = 1

  private moveToward(tx: number, ty: number): boolean {
    const step = SPEED * this.dt
    const dx = tx - this.x; const dy = ty - this.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist < step) { this.x = tx; this.y = ty; return true }
    this.x += (dx / dist) * step; this.y += (dy / dist) * step
    return false
  }

  private prevX = 0

  private applyPos(): void {
    // Bank into turns: tilt follows horizontal velocity, eased and clamped
    const vx = this.x - this.prevX
    this.prevX = this.x
    const targetBank = Math.max(-14, Math.min(14, vx * 2.2))
    this.bank += (targetBank - this.bank) * 0.12
    this.el.style.transform =
      `translate(${this.x - 60}px, ${this.y - 30}px) rotate(${this.bank.toFixed(1)}deg)`
  }

  private bank = 0
}

// ── Fleet manager: 2 ships, one run per sprint-clock zero ──
export class Ufo {
  private ships: UfoShip[]
  private cowDone = false
  private keywordTarget: { x: number; y: number } | null = null
  private lastNow = 0
  private onExplodeCb: ((x: number, y: number) => void) | null = null
  private onCollisionExplodeCb: ((x: number, y: number) => void) | null = null

  constructor() {
    this.ships = [new UfoShip(), new UfoShip()]
    for (const ship of this.ships) {
      ship.onExplode = (x, y) => { if (this.onExplodeCb) this.onExplodeCb(x, y) }
      ship.onCollisionExplode = (x, y) => { if (this.onCollisionExplodeCb) this.onCollisionExplodeCb(x, y) }
    }
  }

  onExplosion(cb: (x: number, y: number) => void): void { this.onExplodeCb = cb }
  onCollisionExplosion(cb: (x: number, y: number) => void): void { this.onCollisionExplodeCb = cb }

  setKeywordTarget(x: number, y: number): void {
    this.keywordTarget = { x, y }
  }

  /**
   * One run per sprint-clock zero: the first-ever run is the cow abduction,
   * every one after targets a keyword. The 30s clock IS the cadence — no
   * burst windows, no cooldowns, no dead air.
   */
  launch(moonX: number, moonY: number): void {
    if (!this.cowDone) {
      this.cowDone = true
      this.ships[0].startCowRun(moonX, moonY)
      return
    }
    const ship = this.ships.find(s => s.phase === 'idle')
    if (ship) ship.startExplosionRun(this.keywordTarget)
  }

  update(now: number, cursorX: number, cursorY: number): void {
    // Frame-rate-independent movement: dt = elapsed frames at 60fps, capped
    // so a long throttled gap doesn't teleport ships across the screen.
    const dt = Math.min((now - (this.lastNow || now)) / 16.7, 3)
    this.lastNow = now
    for (const ship of this.ships) {
      ship.update(now, cursorX, cursorY, dt)
    }
  }
}
