import { HEADLINE } from './content.ts'
import { prepareWithSegments, layoutNextLine } from '@chenglou/pretext'
import type { ObstacleRect } from './types.ts'

const IS_MOBILE = window.innerWidth < 768 || 'ontouchstart' in window
const HEADLINE_FONT_SIZE = IS_MOBILE ? 32 : Math.min(window.innerWidth * 0.06, 80)
const HEADLINE_FONT = `900 ${HEADLINE_FONT_SIZE}px Inter, sans-serif`
const WORD_GAP = HEADLINE_FONT_SIZE * 0.35

// Physics — softer spring, more dramatic scatter than keywords
const REPULSION_RADIUS = IS_MOBILE ? 160 : 260
const REPULSION_STRENGTH = IS_MOBILE ? 1200 : 1800
const MAX_FORCE = IS_MOBILE ? 14 : 20
const SPRING = 0.03
const DAMPING = 0.88

export interface HeadlineWord {
  text: string
  width: number
  height: number
  x: number
  y: number
  vx: number
  vy: number
  restX: number
  restY: number
  opacity: number
}

function measure(text: string): number {
  const prepared = prepareWithSegments(text, HEADLINE_FONT)
  const line = layoutNextLine(prepared, { segmentIndex: 0, graphemeIndex: 0 }, 99999)
  return line ? line.width : 0
}

export class HeadlineRenderer {
  private words: HeadlineWord[] = []
  private els: HTMLSpanElement[] = []

  constructor(container: HTMLElement) {
    const tokens = HEADLINE.split(/\s+/)

    for (const token of tokens) {
      const w = measure(token)
      this.words.push({
        text: token,
        width: w,
        height: HEADLINE_FONT_SIZE,
        x: 0, y: 0,
        vx: 0, vy: 0,
        restX: 0, restY: 0,
        opacity: 0.12,
      })

      const el = document.createElement('span')
      el.className = 'headline-word'
      el.textContent = token
      el.style.font = HEADLINE_FONT
      el.style.position = 'absolute'
      el.style.whiteSpace = 'nowrap'
      el.style.pointerEvents = 'none'
      el.style.userSelect = 'none'
      el.style.willChange = 'transform, opacity'
      container.appendChild(el)
      this.els.push(el)
    }
  }

  position(vw: number, vh: number): void {
    // Compute total width of all words + gaps
    const totalWidth = this.words.reduce((s, w) => s + w.width, 0)
      + (this.words.length - 1) * WORD_GAP
    let x = (vw - totalWidth) / 2
    const y = (vh - HEADLINE_FONT_SIZE) / 2

    for (const word of this.words) {
      word.restX = x
      word.restY = y
      word.x = x
      word.y = y
      x += word.width + WORD_GAP
    }
  }

  update(mouseX: number, mouseY: number, vw: number, vh: number, obstacleRects: ObstacleRect[] = []): void {
    for (const w of this.words) {
      const cx = w.x + w.width / 2
      const cy = w.y + w.height / 2
      const dx = cx - mouseX
      const dy = cy - mouseY
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < REPULSION_RADIUS && dist > 1) {
        const force = Math.min(REPULSION_STRENGTH / (dist * dist), MAX_FORCE)
        w.vx += (dx / dist) * force
        w.vy += (dy / dist) * force
        // Brighten when pushed — the nag intensifies
        w.opacity = Math.min(0.6, 0.12 + (1 - dist / REPULSION_RADIUS) * 0.5)
      } else {
        w.vx += (w.restX - w.x) * SPRING
        w.vy += (w.restY - w.y) * SPRING
        w.opacity += (0.12 - w.opacity) * 0.03
      }

      // GIF obstacle repulsion
      for (const obs of obstacleRects) {
        const ocx = obs.x + obs.w / 2
        const ocy = obs.y + obs.h / 2
        const odx = cx - ocx
        const ody = cy - ocy
        const odist = Math.sqrt(odx * odx + ody * ody)
        const oRadius = Math.max(obs.w, obs.h) * 0.9
        if (odist < oRadius && odist > 1) {
          const force = Math.min(600 / (odist * odist), 10)
          w.vx += (odx / odist) * force
          w.vy += (ody / odist) * force
          w.opacity = Math.min(0.6, 0.12 + (1 - odist / oRadius) * 0.5)
        }
      }

      w.vx *= DAMPING
      w.vy *= DAMPING
      w.x += w.vx
      w.y += w.vy

      // Clamp to viewport
      w.x = Math.max(0, Math.min(w.x, vw - w.width))
      w.y = Math.max(0, Math.min(w.y, vh - w.height))
    }
  }

  render(): void {
    for (let i = 0; i < this.words.length; i++) {
      const w = this.words[i]
      const el = this.els[i]
      el.style.transform = `translate(${w.x}px, ${w.y}px)`
      el.style.opacity = String(w.opacity)
    }
  }
}

