import type { Keyword, KeywordDef, ObstacleRect } from './types.ts'
import type { StarPoint } from './dumpster-fire.ts'
import { prepareWithSegments, layoutNextLine } from '@chenglou/pretext'

function checkMobile(): boolean { return window.innerWidth < 768 || 'ontouchstart' in window }

const SPRING_STRENGTH = 0.015
const DAMPING = 0.92

function getPhysicsParams(mobile: boolean) {
  return {
    repulsionRadius: mobile ? 120 : 180,
    repulsionStrength: mobile ? 600 : 800,
    maxForce: mobile ? 8 : 12,
  }
}

function getFontMap(mobile: boolean) {
  return mobile ? {
    small: '500 7px Inter, sans-serif',
    normal: '500 9px Inter, sans-serif',
    large: '700 12px Inter, sans-serif',
  } as const : {
    small: '500 10px Inter, sans-serif',
    normal: '500 13px Inter, sans-serif',
    large: '700 18px Inter, sans-serif',
  } as const
}

function getHeightMap(mobile: boolean) {
  return mobile
    ? { small: 9, normal: 11, large: 15 }
    : { small: 12, normal: 16, large: 22 }
}

// Exported for renderer — refreshed on reinit
export let FONT_MAP = getFontMap(checkMobile())

function measureText(text: string, font: string): number {
  const prepared = prepareWithSegments(text, font)
  const line = layoutNextLine(prepared, { segmentIndex: 0, graphemeIndex: 0 }, 99999)
  return line ? line.width : 0
}

function pickSize(index: number): 'small' | 'normal' | 'large' {
  if (index % 7 === 0) return 'large'
  if (index % 3 === 0) return 'small'
  return 'normal'
}

export function initKeywords(defs: KeywordDef[], vw: number, vh: number): Keyword[] {
  const mobile = checkMobile()
  FONT_MAP = getFontMap(mobile)
  const HEIGHT_MAP = getHeightMap(mobile)

  // Measure all keywords first
  const measured = defs.map((def, i) => {
    const size = def.size ?? pickSize(i)
    const font = FONT_MAP[size]
    const width = measureText(def.text, font)
    const height = HEIGHT_MAP[size]
    return { def, size, width, height }
  })

  // Row-packing: place keywords left-to-right, row by row, with padding
  const PAD_X = mobile ? 8 : 14
  const PAD_Y = mobile ? 3 : 6
  const keywords: Keyword[] = []
  let cursorX = PAD_X
  let cursorY = PAD_Y
  let rowHeight = 0

  // Shuffle so categories are mixed
  const shuffled = [...measured]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  for (const m of shuffled) {
    // Wrap to next row if needed
    if (cursorX + m.width + PAD_X > vw) {
      cursorX = PAD_X
      cursorY += rowHeight + PAD_Y
      rowHeight = 0
    }

    // Stop placing keywords once we'd overflow the viewport
    if (cursorY + m.height > vh) break

    const x = cursorX
    const y = cursorY

    // Starfield depth: most keywords are dim/far, few are bright/close
    // Weighted distribution: ~70% dim (0.1-0.4), ~20% mid (0.4-0.7), ~10% bright (0.7-1.0)
    const r = Math.random()
    const depth = r < 0.7 ? 0.1 + Math.random() * 0.3
                : r < 0.9 ? 0.4 + Math.random() * 0.3
                : 0.7 + Math.random() * 0.3

    keywords.push({
      text: m.def.text,
      category: m.def.category,
      width: m.width,
      height: m.height,
      x, y,
      vx: 0, vy: 0,
      restX: x, restY: y,
      opacity: depth,
      size: m.size,
      depth,
    })

    cursorX += m.width + PAD_X
    if (m.height > rowHeight) rowHeight = m.height
  }

  return keywords
}

export function updateKeywords(
  keywords: Keyword[],
  mouseX: number,
  mouseY: number,
  bubbleX: number,
  bubbleY: number,
  bubbleW: number,
  bubbleH: number,
  vw: number,
  vh: number,
  obstacleRects: ObstacleRect[] = [],
  starPoints: StarPoint[] = [],
): void {
  const mobile = checkMobile()
  const { repulsionRadius, repulsionStrength, maxForce } = getPhysicsParams(mobile)

  // Shooting star repulsion params (softer than cursor)
  const starRadius = repulsionRadius * 0.6
  const starStrength = repulsionStrength * 0.4
  const starMaxForce = maxForce * 0.5

  for (const kw of keywords) {
    const cx = kw.x + kw.width / 2
    const cy = kw.y + kw.height / 2
    const dx = cx - mouseX
    const dy = cy - mouseY
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist < repulsionRadius && dist > 1) {
      const force = Math.min(repulsionStrength / (dist * dist), maxForce)
      const nx = dx / dist
      const ny = dy / dist
      kw.vx += nx * force
      kw.vy += ny * force
      // Asteroid illumination: nearby keywords brighten, not dim
      const proximity = 1 - dist / repulsionRadius
      kw.opacity = kw.depth + proximity * (1 - kw.depth)
    } else {
      kw.vx += (kw.restX - kw.x) * SPRING_STRENGTH
      kw.vy += (kw.restY - kw.y) * SPRING_STRENGTH
      // Settle back to depth-based opacity
      kw.opacity += (kw.depth - kw.opacity) * 0.05
    }

    // Shooting star repulsion — keywords scatter as stars fly by
    for (const sp of starPoints) {
      const sdx = cx - sp.x
      const sdy = cy - sp.y
      const sdist = Math.sqrt(sdx * sdx + sdy * sdy)
      if (sdist < starRadius && sdist > 1) {
        const force = Math.min(starStrength / (sdist * sdist), starMaxForce)
        kw.vx += (sdx / sdist) * force
        kw.vy += (sdy / sdist) * force
        // Brief brightening from star passing
        const prox = 1 - sdist / starRadius
        kw.opacity = Math.max(kw.opacity, kw.depth + prox * (1 - kw.depth) * 0.7)
      }
    }

    // Bubble repulsion (softer)
    const bx = bubbleX + bubbleW / 2
    const by = bubbleY + bubbleH / 2
    const bdx = cx - bx
    const bdy = cy - by
    const bdist = Math.sqrt(bdx * bdx + bdy * bdy)
    const bRadius = Math.max(bubbleW, bubbleH) * 0.7
    if (bdist < bRadius && bdist > 1) {
      const force = Math.min(200 / (bdist * bdist), 4)
      kw.vx += (bdx / bdist) * force
      kw.vy += (bdy / bdist) * force
    }

    // GIF obstacle repulsion
    for (const obs of obstacleRects) {
      const ocx = obs.x + obs.w / 2
      const ocy = obs.y + obs.h / 2
      const odx = cx - ocx
      const ody = cy - ocy
      const odist = Math.sqrt(odx * odx + ody * ody)
      const oRadius = Math.max(obs.w, obs.h) * 0.8
      if (odist < oRadius && odist > 1) {
        const force = Math.min(400 / (odist * odist), 6)
        kw.vx += (odx / odist) * force
        kw.vy += (ody / odist) * force
      }
    }

    kw.vx *= DAMPING
    kw.vy *= DAMPING
    kw.x += kw.vx
    kw.y += kw.vy
    kw.x = Math.max(0, Math.min(kw.x, vw - kw.width))
    kw.y = Math.max(0, Math.min(kw.y, vh - kw.height))
  }
}

