import { prepareWithSegments } from '@chenglou/pretext'
import type { PreparedTextWithSegments } from '@chenglou/pretext'
import type { TrailSegment } from './cursor.ts'
import type { StarPoint } from './dumpster-fire.ts'
import type { KeywordDef } from './types.ts'
import asteroidUrl from '../asteroid.webp'

// ── Constants ──
const HEAT_RADIUS = 140
const REPULSION_RADIUS = 120
const REPULSION_STRENGTH = 800
const MAX_FORCE = 14
const SPRING_STRENGTH = 0.015
const DAMPING = 0.92
const JITTER_AMPLITUDE = 3.5
const DEFAULT_COLOR = [160, 170, 190]
const HEAT_COLOR = [255, 50, 20]

// Star repulsion (physics only, no heat color)
const STAR_REPULSION_RADIUS = 80
const STAR_REPULSION_STRENGTH = 400
const STAR_MAX_FORCE = 8

// Trail rendering
const TRAIL_HEAD_RADIUS = 26

// Fonts per tier
const FONTS = {
  large: '700 18px Inter, sans-serif',
  normal: '500 13px Inter, sans-serif',
  small: '500 10px Inter, sans-serif',
} as const
const HEIGHTS = { large: 22, normal: 16, small: 12 }

// Ember particles
interface Ember {
  x: number; y: number; vx: number; vy: number
  life: number; size: number; color: [number, number, number]
}
const EMBER_COLORS: [number, number, number][] = [
  [255, 255, 200], [255, 220, 80], [255, 160, 30],
  [240, 90, 15], [200, 50, 10], [140, 30, 8],
]
const MAX_EMBERS = 250

// Placed keyword with physics
interface PlacedKeyword {
  text: string
  font: string
  prepared: PreparedTextWithSegments
  width: number
  height: number
  restX: number; restY: number
  x: number; y: number
  vx: number; vy: number
  depth: number  // 0..1 brightness
  size: 'small' | 'normal' | 'large'
}

export class CanvasRenderer {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private vw = 0
  private vh = 0
  private dpr = 1
  private embers: Ember[] = []
  private keywords: PlacedKeyword[] = []
  private asteroidImg: HTMLImageElement | null = null
  private asteroidLoaded = false
  private angle = 0
  private flash: { x: number; y: number; start: number } | null = null
  private respawnQueue: { kw: PlacedKeyword; at: number }[] = []
  private popups: { text: string; x: number; y: number; bornAt: number; color: string }[] = []
  private risingGlyphs: {
    char: string; font: string
    x: number; y: number; tx: number; ty: number
    bornAt: number
  }[] = []

  constructor(container: HTMLElement) {
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'main-canvas'
    container.appendChild(this.canvas)
    this.ctx = (this.canvas.getContext('2d', { alpha: false }) || this.canvas.getContext('2d'))!
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)

    // Load asteroid image
    this.asteroidImg = new Image()
    this.asteroidImg.src = asteroidUrl
    this.asteroidImg.onload = () => { this.asteroidLoaded = true }
  }

  async init(defs: KeywordDef[]): Promise<void> {
    // Timeout fallback for Safari font loading issues
    await Promise.race([
      document.fonts.ready,
      new Promise<void>(r => setTimeout(r, 2000)),
    ])
    this.placeKeywords(defs)
  }

  private placeKeywords(defs: KeywordDef[]): void {
    this.keywords = []
    this.respawnQueue = []
    this.popups = []
    // Shuffle
    const shuffled = [...defs].sort(() => Math.random() - 0.5)

    // Measure with Pretext and place via row-packing
    // Repeat keywords to fill the full viewport height
    const mobile = this.vw < 768
    const PAD_X = mobile ? 8 : 14
    const PAD_Y = mobile ? 4 : 6
    const MARGIN = mobile ? 4 : 10
    let rowX = MARGIN
    let rowY = MARGIN
    let defIdx = 0

    while (rowY < this.vh - 5) {
      const def = shuffled[defIdx % shuffled.length]
      defIdx++
      const size = def.size ?? 'normal'
      const font = FONTS[size]
      const height = HEIGHTS[size]

      // Measure text width with Pretext
      const prepared = prepareWithSegments(def.text, font)
      const width = prepared.widths.reduce((a, b) => a + b, 0)

      // Row-pack with wrapping
      if (rowX + width + PAD_X > this.vw - MARGIN) {
        rowX = MARGIN + Math.random() * (mobile ? 6 : 20)
        rowY += height + PAD_Y + Math.random() * 4
      }
      if (rowY > this.vh - 5) break

      const x = rowX + (Math.random() - 0.5) * 6
      const y = rowY + (Math.random() - 0.5) * 4

      // Depth distribution: 70% dim, 20% mid, 10% bright
      const r = Math.random()
      const depth = r < 0.7 ? 0.15 + Math.random() * 0.25
                  : r < 0.9 ? 0.4 + Math.random() * 0.25
                  : 0.7 + Math.random() * 0.3

      this.keywords.push({
        text: def.text, font, prepared, width, height,
        restX: x, restY: y, x, y,
        vx: 0, vy: 0, depth, size,
      })

      rowX += width + PAD_X + Math.random() * (mobile ? 3 : 8)
    }
  }

  resize(vw: number, vh: number): void {
    this.vw = vw
    this.vh = vh
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.canvas.width = vw * this.dpr
    this.canvas.height = vh * this.dpr
    this.canvas.style.width = `${vw}px`
    this.canvas.style.height = `${vh}px`
  }

  reflow(defs: KeywordDef[]): void {
    this.placeKeywords(defs)
  }

  render(
    trail: TrailSegment[], speed: number, _now: number,
    starPoints: StarPoint[],
    moonX?: number, moonY?: number,
  ): void {
    const ctx = this.ctx
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.fillStyle = '#0a0e1a'
    ctx.fillRect(0, 0, this.vw, this.vh)

    // 1. Physics update for keywords
    this.updatePhysics(trail, starPoints, moonX, moonY)

    // 2. Draw fire trail (additive blending)
    this.renderTrail(ctx, trail, speed)

    // 3. Ember particles
    this.updateEmbers(ctx, trail, speed)

    // 4. Draw asteroid image at head
    this.renderAsteroid(ctx, trail, speed)

    // 5. Render collision flash if active
    if (this.flash) {
      const flashElapsed = _now - this.flash.start
      if (flashElapsed < 300) {
        const alpha = 1 - flashElapsed / 300
        const r = 60 + (1 - flashElapsed / 300) * 80
        ctx.globalCompositeOperation = 'lighter'
        const grad = ctx.createRadialGradient(
          this.flash.x, this.flash.y, 0,
          this.flash.x, this.flash.y, r,
        )
        grad.addColorStop(0, `rgba(255,255,240,${alpha.toFixed(2)})`)
        grad.addColorStop(0.3, `rgba(255,220,100,${(alpha * 0.7).toFixed(2)})`)
        grad.addColorStop(0.7, `rgba(255,120,20,${(alpha * 0.3).toFixed(2)})`)
        grad.addColorStop(1, 'rgba(255,60,10,0)')
        ctx.beginPath()
        ctx.arc(this.flash.x, this.flash.y, r, 0, Math.PI * 2)
        ctx.fillStyle = grad
        ctx.fill()
        ctx.globalCompositeOperation = 'source-over'
      } else {
        this.flash = null
      }
    }

    // 6. Draw keywords (heat from meteor trail only, not shooting stars)
    ctx.globalCompositeOperation = 'source-over'
    this.renderKeywords(ctx, trail)

    // 7. Ship It: respawns, tractor-beam glyphs, score popups
    const nowMs = performance.now()
    this.processRespawns(nowMs)
    this.renderRisingGlyphs(ctx, nowMs)
    this.renderPopups(ctx, nowMs)
  }

  // ── Physics: repel keywords from trail + shooting stars ──
  private updatePhysics(
    trail: TrailSegment[], starPoints: StarPoint[],
    moonX?: number, moonY?: number,
  ): void {
    const MOON_REPULSION_RADIUS = 220
    const MOON_REPULSION_STRENGTH = 1600
    const MOON_MAX_FORCE = 22

    for (const kw of this.keywords) {
      const cx = kw.x + kw.width / 2
      const cy = kw.y + kw.height / 2

      // Moon centrifugal field — radial push + tangential orbital swirl
      if (moonX !== undefined && moonY !== undefined) {
        const dx = cx - moonX
        const dy = cy - moonY
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < MOON_REPULSION_RADIUS && dist > 1) {
          const force = Math.min(MOON_REPULSION_STRENGTH / (dist * dist), MOON_MAX_FORCE)
          const nx = dx / dist
          const ny = dy / dist
          // Radial outward push
          kw.vx += nx * force
          kw.vy += ny * force
          // Tangential force (perpendicular, clockwise) — 40% of radial
          kw.vx += -ny * force * 0.4
          kw.vy += nx * force * 0.4
        }
      }

      // Cursor/trail repulsion (check first 15 segments)
      let pushed = false
      for (let si = 0; si < Math.min(15, trail.length); si++) {
        const seg = trail[si]
        if (seg.x < -1000) continue
        const dx = cx - seg.x
        const dy = cy - seg.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const radius = REPULSION_RADIUS * (1 - si / 40)
        if (dist < radius && dist > 1) {
          const force = Math.min(REPULSION_STRENGTH / (dist * dist), MAX_FORCE)
          kw.vx += (dx / dist) * force
          kw.vy += (dy / dist) * force
          pushed = true
        }
      }

      // Shooting star repulsion
      for (const sp of starPoints) {
        const dx = cx - sp.x
        const dy = cy - sp.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < STAR_REPULSION_RADIUS && dist > 1) {
          const force = Math.min(STAR_REPULSION_STRENGTH / (dist * dist), STAR_MAX_FORCE)
          kw.vx += (dx / dist) * force
          kw.vy += (dy / dist) * force
          pushed = true
        }
      }

      if (!pushed) {
        // Spring back to rest
        kw.vx += (kw.restX - kw.x) * SPRING_STRENGTH
        kw.vy += (kw.restY - kw.y) * SPRING_STRENGTH
      }

      kw.vx *= DAMPING
      kw.vy *= DAMPING
      kw.x += kw.vx
      kw.y += kw.vy

      // Clamp to viewport
      kw.x = Math.max(-kw.width, Math.min(this.vw, kw.x))
      kw.y = Math.max(-kw.height, Math.min(this.vh, kw.y))
    }
  }

  // ── Fire trail — thick and dense at ALL speeds ──
  private renderTrail(ctx: CanvasRenderingContext2D, trail: TrailSegment[], speed: number): void {
    ctx.globalCompositeOperation = 'lighter'
    const headX = trail[0]?.x ?? -9999
    if (headX < -1000) return
    const intensity = Math.min(1, speed / 12)
    // Speed factor: faster = bigger radii to compensate for segment spread
    const speedScale = 1 + Math.min(0.4, speed / 20)

    // Draw interpolated circles between segments for gap-filling
    for (let i = trail.length - 1; i >= 1; i--) {
      const seg = trail[i]
      const prev = trail[i - 1]
      if (seg.x < -1000 || prev.x < -1000) continue

      const dx = prev.x - seg.x
      const dy = prev.y - seg.y
      const gap = Math.sqrt(dx * dx + dy * dy)
      // Fewer interpolation steps — keep trail tight
      const steps = Math.max(1, Math.ceil(gap / 12))

      for (let s = 0; s < steps; s++) {
        const frac = s / steps
        const ix = seg.x + dx * frac
        const iy = seg.y + dy * frac
        const t = 1 - (i - frac) / trail.length // 0=tail, 1=head

        const radius = TRAIL_HEAD_RADIUS * t * speedScale * (0.7 + intensity * 0.4)
        if (radius < 0.5) continue
        const alpha = t * t * (0.4 + intensity * 0.4)
        const r = 255
        const g = Math.round(220 * t * t)
        const b = Math.round(60 * t * t * t)
        ctx.beginPath()
        ctx.arc(ix, iy, radius, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(3)})`
        ctx.fill()
      }
    }

    // Hot core glow — always visible when interacted
    const coreR = 16 + intensity * 14 + speed * 0.15
    const grad = ctx.createRadialGradient(headX, trail[0].y, 0, headX, trail[0].y, coreR)
    grad.addColorStop(0, `rgba(255,255,230,${Math.min(1, 0.5 + intensity * 0.5).toFixed(2)})`)
    grad.addColorStop(0.4, `rgba(255,180,40,${(0.2 + 0.3 * intensity).toFixed(2)})`)
    grad.addColorStop(1, 'rgba(255,80,10,0)')
    ctx.beginPath()
    ctx.arc(headX, trail[0].y, coreR, 0, Math.PI * 2)
    ctx.fillStyle = grad
    ctx.fill()

    ctx.globalCompositeOperation = 'source-over'
  }

  // ── Embers — scale with speed, interpolate for dense coverage ──
  private updateEmbers(ctx: CanvasRenderingContext2D, trail: TrailSegment[], speed: number): void {
    const headX = trail[0]?.x ?? -9999
    const headY = trail[0]?.y ?? -9999

    if (headX > -1000 && speed > 0.5) {
      // Head embers: scale up with speed, no hard cap
      const headCount = Math.min(10, 1 + Math.floor(speed * 0.6))
      for (let i = 0; i < headCount; i++) {
        const ci = Math.floor(Math.random() * 3)
        this.embers.push({
          x: headX + (Math.random() - 0.5) * 20,
          y: headY + (Math.random() - 0.5) * 20,
          vx: (Math.random() - 0.5) * (2 + speed * 0.3),
          vy: -(0.5 + Math.random() * (2 + speed * 0.3)),
          life: 1, size: 1 + Math.random() * 2.8,
          color: EMBER_COLORS[ci],
        })
      }

      // Trail body embers: spawn at interpolated positions between segments
      const bodyRate = Math.min(0.8, 0.3 + speed * 0.04)
      for (let si = 1; si < trail.length - 1; si++) {
        if (Math.random() > bodyRate) continue
        const seg = trail[si]
        const prev = trail[si - 1]
        if (seg.x < -1000 || prev.x < -1000) continue
        // Interpolate to random position between segments
        const f = Math.random()
        const ex = seg.x + (prev.x - seg.x) * f
        const ey = seg.y + (prev.y - seg.y) * f
        this.embers.push({
          x: ex + (Math.random() - 0.5) * 10,
          y: ey + (Math.random() - 0.5) * 10,
          vx: (Math.random() - 0.5) * 1.8,
          vy: -(0.3 + Math.random() * 2.5),
          life: 1, size: 0.5 + Math.random() * 2,
          color: EMBER_COLORS[2 + Math.floor(Math.random() * 4)],
        })
      }
    }
    while (this.embers.length > MAX_EMBERS) this.embers.shift()

    ctx.globalCompositeOperation = 'lighter'
    for (let i = this.embers.length - 1; i >= 0; i--) {
      const e = this.embers[i]
      e.life -= 0.022
      if (e.life <= 0) { this.embers.splice(i, 1); continue }
      e.vy -= 0.04; e.x += e.vx; e.y += e.vy; e.vx *= 0.97
      const r = e.size * e.life
      if (r < 0.3) continue
      ctx.beginPath()
      ctx.arc(e.x, e.y, r, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(${e.color[0]},${e.color[1]},${e.color[2]},${(e.life * 0.75).toFixed(2)})`
      ctx.fill()
    }
    ctx.globalCompositeOperation = 'source-over'
  }


  // ── Asteroid image at trail head ──
  private renderAsteroid(ctx: CanvasRenderingContext2D, trail: TrailSegment[], speed: number): void {
    const headX = trail[0]?.x ?? -9999
    const headY = trail[0]?.y ?? -9999
    if (headX < -1000) return

    // Track direction for rotation
    if (speed > 0.5 && trail.length > 1) {
      const dx = trail[0].x - trail[1].x
      const dy = trail[0].y - trail[1].y
      const target = Math.atan2(dy, dx)
      let diff = target - this.angle
      while (diff > Math.PI) diff -= Math.PI * 2
      while (diff < -Math.PI) diff += Math.PI * 2
      this.angle += diff * 0.12
    }

    const size = 65
    if (this.asteroidLoaded && this.asteroidImg) {
      ctx.save()
      ctx.translate(headX, headY)
      ctx.rotate(this.angle)
      ctx.drawImage(this.asteroidImg, -size / 2, -size / 2, size, size)
      ctx.restore()
    } else {
      // Fallback rock ellipse
      ctx.beginPath()
      ctx.ellipse(headX, headY, size / 2, size * 0.42, this.angle, 0, Math.PI * 2)
      ctx.fillStyle = '#554433'
      ctx.fill()
    }
  }

  // ── Keyword rendering — heat color/jitter from meteor trail only ──
  private renderKeywords(
    ctx: CanvasRenderingContext2D,
    trail: TrailSegment[],
  ): void {
    ctx.textBaseline = 'top'

    for (const kw of this.keywords) {
      const cx = kw.x + kw.width / 2
      const cy = kw.y + kw.height / 2

      // Distance to nearest trail segment (meteor only, not stars)
      let minDist = Infinity
      for (let si = 0; si < trail.length; si++) {
        const seg = trail[si]
        if (seg.x < -1000) continue
        const dx = cx - seg.x, dy = cy - seg.y
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d < minDist) minDist = d
      }

      const proximity = minDist < HEAT_RADIUS ? 1 - minDist / HEAT_RADIUS : 0

      // Lerp color: blue-gray → red
      const r = Math.round(DEFAULT_COLOR[0] + (HEAT_COLOR[0] - DEFAULT_COLOR[0]) * proximity)
      const g = Math.round(DEFAULT_COLOR[1] + (HEAT_COLOR[1] - DEFAULT_COLOR[1]) * proximity)
      const b = Math.round(DEFAULT_COLOR[2] + (HEAT_COLOR[2] - DEFAULT_COLOR[2]) * proximity)

      const alpha = kw.depth * 0.5 + proximity * 0.7 + 0.05

      ctx.font = kw.font
      ctx.fillStyle = `rgba(${r},${g},${b},${Math.min(1, alpha).toFixed(2)})`

      // Jitter only from meteor heat
      let jx = 0, jy = 0
      if (proximity > 0.25) {
        const jStr = (proximity - 0.25) / 0.75
        jx = (Math.random() - 0.5) * JITTER_AMPLITUDE * jStr
        jy = (Math.random() - 0.5) * JITTER_AMPLITUDE * jStr
      }

      ctx.fillText(kw.text, kw.x + jx, kw.y + jy)
    }
  }

  /** Get a random keyword's rest position for UFO targeting */
  getRandomKeywordPos(): { x: number; y: number } | null {
    if (this.keywords.length === 0) return null
    const kw = this.keywords[Math.floor(Math.random() * this.keywords.length)]
    return { x: kw.restX + kw.width / 2, y: kw.restY + kw.height / 2 }
  }

  /**
   * Ship It: hit-test a click against keyword boxes; remove and score the hit.
   * Pure arithmetic — every hitbox is pretext's one-time measured width/height
   * plus the current physics position. No getBoundingClientRect, no
   * elementFromPoint, no DOM reads at all. Returns the shipped keyword or null.
   */
  shipKeywordAt(px: number, py: number): { text: string; width: number } | null {
    const PAD = 8
    // The cursor's repulsion field pushes keywords away before a click can
    // land on them, so a strict hitbox feels broken. Direct hits win; failing
    // that, grab the nearest keyword still fleeing within reach.
    const GRAB_RADIUS = 90
    let hit = -1
    for (let i = this.keywords.length - 1; i >= 0; i--) {
      const kw = this.keywords[i]
      if (
        px >= kw.x - PAD && px <= kw.x + kw.width + PAD &&
        py >= kw.y - PAD && py <= kw.y + kw.height + PAD
      ) { hit = i; break }
    }
    if (hit < 0) {
      let bestDist = GRAB_RADIUS
      for (let i = 0; i < this.keywords.length; i++) {
        const kw = this.keywords[i]
        const dx = kw.x + kw.width / 2 - px
        const dy = kw.y + kw.height / 2 - py
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d < bestDist) { bestDist = d; hit = i }
      }
    }
    if (hit < 0) return null
    const kw = this.keywords.splice(hit, 1)[0]
    this.scheduleRespawn(kw)
    this.shipBurst(kw.x + kw.width / 2, kw.y + kw.height / 2)
    this.spawnScorePopup(`+${Math.round(kw.width)} px · ${kw.text}`, kw.x + kw.width / 2, kw.y - 8, '#3ce8b4')
    return { text: kw.text, width: kw.width }
  }

  /**
   * UFO abduction: the tractor beam pulls the nearest keyword apart glyph by
   * glyph. Each character's x-offset is the running sum of pretext's
   * per-grapheme widths — measured once at placement, replayed here as pure
   * arithmetic. No DOM, no re-measurement, just addition.
   */
  abductKeywordNear(cx: number, cy: number, radius = 240): { text: string; width: number } | null {
    let best = -1
    let bestDist = radius
    for (let i = 0; i < this.keywords.length; i++) {
      const kw = this.keywords[i]
      const dx = kw.x + kw.width / 2 - cx
      const dy = kw.y + kw.height / 2 - cy
      const d = Math.sqrt(dx * dx + dy * dy)
      if (d < bestDist) { bestDist = d; best = i }
    }
    if (best < 0) return null
    const kw = this.keywords.splice(best, 1)[0]
    this.scheduleRespawn(kw)

    const chars = [...kw.text]
    const widths = kw.prepared.widths.length === chars.length
      ? kw.prepared.widths
      : chars.map(() => kw.width / chars.length) // fallback: even split
    const now = performance.now()
    const STAGGER = 70 // ms between characters lifting off (last char first — the beam eats from the end)
    let offset = 0
    for (let i = 0; i < chars.length; i++) {
      this.risingGlyphs.push({
        char: chars[i], font: kw.font,
        x: kw.x + offset, y: kw.y,
        tx: cx, ty: cy - 30,
        bornAt: now + (chars.length - 1 - i) * STAGGER,
      })
      offset += widths[i]
    }
    // Score popup lands after the last glyph disappears into the ship
    this.popups.push({
      text: `-${Math.round(kw.width)} px · ${kw.text} abducted`,
      x: cx, y: cy - 40,
      bornAt: now + chars.length * STAGGER + 900,
      color: '#ff4444',
    })
    return { text: kw.text, width: kw.width }
  }

  private renderRisingGlyphs(ctx: CanvasRenderingContext2D, now: number): void {
    if (this.risingGlyphs.length === 0) return
    const RISE_MS = 900
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    for (let i = this.risingGlyphs.length - 1; i >= 0; i--) {
      const g = this.risingGlyphs[i]
      const age = now - g.bornAt
      if (age < 0) {
        // Not lifted yet — hold in place, quivering in the beam
        ctx.font = g.font
        ctx.fillStyle = 'rgba(160,255,210,0.9)'
        ctx.fillText(g.char, g.x + (Math.random() - 0.5) * 1.5, g.y + (Math.random() - 0.5) * 1.5)
        continue
      }
      const p = Math.min(age / RISE_MS, 1)
      if (p >= 1) {
        this.risingGlyphs.splice(i, 1)
        continue
      }
      const ease = p * p // accelerate upward into the ship
      const x = g.x + (g.tx - g.x) * ease
      const y = g.y + (g.ty - g.y) * ease
      ctx.font = g.font
      ctx.globalAlpha = 1 - ease * 0.8
      ctx.fillStyle = 'rgba(160,255,210,1)'
      ctx.fillText(g.char, x, y)
    }
    ctx.globalAlpha = 1
  }

  private scheduleRespawn(kw: PlacedKeyword): void {
    this.respawnQueue.push({ kw, at: performance.now() + 40_000 + Math.random() * 20_000 })
  }

  private processRespawns(now: number): void {
    for (let i = this.respawnQueue.length - 1; i >= 0; i--) {
      if (now >= this.respawnQueue[i].at) {
        const { kw } = this.respawnQueue.splice(i, 1)[0]
        kw.x = kw.restX; kw.y = kw.restY; kw.vx = 0; kw.vy = 0
        this.keywords.push(kw)
      }
    }
  }

  private shipBurst(cx: number, cy: number): void {
    const SHIP_COLORS: [number, number, number][] = [
      [60, 232, 180], [40, 220, 180], [120, 255, 210], [255, 255, 220],
    ]
    for (let i = 0; i < 26; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = 1 + Math.random() * 4
      this.embers.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1,
        life: 1,
        size: 1.5 + Math.random() * 4,
        color: SHIP_COLORS[Math.floor(Math.random() * SHIP_COLORS.length)],
      })
    }
  }

  /** Public: float a score popup at a canvas position (Ship It feedback). */
  spawnScorePopup(text: string, x: number, y: number, color: string): void {
    this.popups.push({ text, x, y, bornAt: performance.now(), color })
  }

  private renderPopups(ctx: CanvasRenderingContext2D, now: number): void {
    if (this.popups.length === 0) return
    const LIFETIME = 3500 // ms — time-based, so throttled tabs don't strand popups
    ctx.font = '700 16px Inter, sans-serif'
    ctx.textAlign = 'center'
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i]
      const age = now - p.bornAt
      if (age < 0) continue // scheduled for later (post-abduction reveal)
      if (age >= LIFETIME) { this.popups.splice(i, 1); continue }
      ctx.globalAlpha = 1 - age / LIFETIME
      ctx.fillStyle = p.color
      ctx.fillText(p.text, p.x, p.y - age * 0.045)
    }
    ctx.globalAlpha = 1
    ctx.textAlign = 'left'
  }

  /** Apply a centrifugal burst from a point — used by moon click */
  applyCentrifugalBurst(cx: number, cy: number, radius: number, strength: number): void {
    for (const kw of this.keywords) {
      const kwCx = kw.x + kw.width / 2
      const kwCy = kw.y + kw.height / 2
      const dx = kwCx - cx
      const dy = kwCy - cy
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < radius && dist > 1) {
        const force = strength * (1 - dist / radius)
        kw.vx += (dx / dist) * force
        kw.vy += (dy / dist) * force
      }
    }
  }

  /** UFO explosion — big burst of blue/green/purple particles + keyword push */
  triggerExplosion(cx: number, cy: number): void {
    const EXPLOSION_COLORS: [number, number, number][] = [
      [80, 140, 255],   // blue
      [40, 220, 180],   // teal/green
      [160, 80, 255],   // purple
      [100, 200, 255],  // light blue
      [200, 100, 255],  // magenta-purple
      [60, 255, 200],   // bright green
    ]
    // Spawn a big burst of particles (25% more)
    for (let i = 0; i < 150; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = 1.5 + Math.random() * 7.5
      const ci = Math.floor(Math.random() * EXPLOSION_COLORS.length)
      this.embers.push({
        x: cx + (Math.random() - 0.5) * 25,
        y: cy + (Math.random() - 0.5) * 25,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        size: 2.5 + Math.random() * 9,
        color: EXPLOSION_COLORS[ci],
      })
    }
    // Push keywords away from explosion
    this.applyCentrifugalBurst(cx, cy, 375, 30)
  }

  /** Dramatic collision explosion — asteroid cursor hit a UFO */
  triggerCollisionExplosion(cx: number, cy: number): void {
    const COLLISION_COLORS: [number, number, number][] = [
      [255, 255, 240],  // bright white
      [255, 240, 120],  // yellow
      [255, 200, 50],   // gold
      [255, 140, 20],   // orange
      [255, 80, 10],    // red-orange
      [220, 40, 5],     // deep red
    ]
    // 300+ particles, faster, larger
    for (let i = 0; i < 320; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = 3 + Math.random() * 15
      const ci = Math.floor(Math.random() * COLLISION_COLORS.length)
      this.embers.push({
        x: cx + (Math.random() - 0.5) * 30,
        y: cy + (Math.random() - 0.5) * 30,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        size: 3 + Math.random() * 12,
        color: COLLISION_COLORS[ci],
      })
    }
    // Strong centrifugal keyword burst — 2x strength, 1.5x radius
    this.applyCentrifugalBurst(cx, cy, 560, 60)
    // Impact flash
    this.flash = { x: cx, y: cy, start: performance.now() }
  }
}