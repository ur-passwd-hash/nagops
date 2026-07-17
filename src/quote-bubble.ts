import { prepareWithSegments, layoutNextLine } from '@chenglou/pretext'
import type { PreparedTextWithSegments, LayoutCursor } from '@chenglou/pretext'
import type { BubbleLayout, QuoteLine } from './types.ts'
import { QUOTES } from './content.ts'

const IS_MOBILE = window.innerWidth < 768 || 'ontouchstart' in window
const BUBBLE_MAX_WIDTH = IS_MOBILE ? 240 : 360
const BUBBLE_MIN_WIDTH = IS_MOBILE ? 140 : 180
const BUBBLE_PADDING = IS_MOBILE ? 12 : 16
const LINE_HEIGHT = IS_MOBILE ? 18 : 22
const CURSOR_OFFSET_X = IS_MOBILE ? 12 : 24
const CURSOR_OFFSET_Y = IS_MOBILE ? 10 : 16
const EDGE_MARGIN = IS_MOBILE ? 10 : 20
const QUOTE_FONT = '400 15px Inter, sans-serif'
const CYCLE_INTERVAL = 8000

let currentIndex = 0
let lastCycleTime = 0
let prepared: PreparedTextWithSegments | null = null

export function initQuoteBubble(): void {
  prepared = prepareWithSegments(QUOTES[currentIndex], QUOTE_FONT)
  lastCycleTime = performance.now()
}

export function cycleQuote(): void {
  currentIndex = (currentIndex + 1) % QUOTES.length
  prepared = prepareWithSegments(QUOTES[currentIndex], QUOTE_FONT)
}

export function maybeAutoAdvance(now: number): void {
  if (now - lastCycleTime > CYCLE_INTERVAL) {
    cycleQuote()
    lastCycleTime = now
  }
}

export function layoutBubble(
  cursorX: number,
  cursorY: number,
  vw: number,
  vh: number,
): BubbleLayout {
  if (!prepared) {
    return { bubbleX: 0, bubbleY: 0, lines: [], bubbleWidth: 0, bubbleHeight: 0 }
  }

  // Decide which side of cursor to place bubble
  const rightSpace = vw - cursorX - CURSOR_OFFSET_X - EDGE_MARGIN
  const leftSpace = cursorX - CURSOR_OFFSET_X - EDGE_MARGIN
  const placeRight = rightSpace >= BUBBLE_MIN_WIDTH || rightSpace >= leftSpace

  const availWidth = placeRight
    ? Math.min(rightSpace, BUBBLE_MAX_WIDTH)
    : Math.min(leftSpace, BUBBLE_MAX_WIDTH)

  const maxWidth = Math.max(BUBBLE_MIN_WIDTH, availWidth) - BUBBLE_PADDING * 2

  // Layout lines using pretext
  const lines: QuoteLine[] = []
  let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 }
  let maxLineWidth = 0
  let lineY = BUBBLE_PADDING

  while (true) {
    const line = layoutNextLine(prepared, cursor, maxWidth)
    if (!line) break
    lines.push({
      text: line.text,
      x: BUBBLE_PADDING,
      y: lineY,
      width: line.width,
    })
    if (line.width > maxLineWidth) maxLineWidth = line.width
    lineY += LINE_HEIGHT
    cursor = line.end
    // Safety: stop at 50 lines
    if (lines.length > 50) break
  }

  const bubbleWidth = maxLineWidth + BUBBLE_PADDING * 2
  const bubbleHeight = lineY + BUBBLE_PADDING

  let bubbleX: number
  if (placeRight) {
    bubbleX = cursorX + CURSOR_OFFSET_X
  } else {
    bubbleX = cursorX - CURSOR_OFFSET_X - bubbleWidth
  }

  // Vertical: try to center on cursor, clamp to viewport
  let bubbleY = cursorY + CURSOR_OFFSET_Y
  if (bubbleY + bubbleHeight > vh - EDGE_MARGIN) {
    bubbleY = vh - EDGE_MARGIN - bubbleHeight
  }
  if (bubbleY < EDGE_MARGIN) {
    bubbleY = EDGE_MARGIN
  }

  return { bubbleX, bubbleY, lines, bubbleWidth, bubbleHeight }
}

