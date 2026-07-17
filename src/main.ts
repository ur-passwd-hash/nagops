import './style.css'
import { ALL_KEYWORDS } from './content.ts'
import { Cursor } from './cursor.ts'
import { initQuoteBubble, layoutBubble, maybeAutoAdvance, cycleQuote } from './quote-bubble.ts'
import { QuoteRenderer } from './quote-renderer.ts'
import { HeadlineRenderer } from './headline.ts'
import { TypingIndicator } from './typing-indicator.ts'
import { SprintCountdown } from './sprint-countdown.ts'
import { ToastNotifications } from './toast-notifications.ts'
import { ShootingStars } from './dumpster-fire.ts'
import { CanvasRenderer } from './canvas-renderer.ts'
import { Moon } from './moon.ts'
import { Ufo } from './ufo.ts'

const isMobile = () => window.innerWidth < 768 || 'ontouchstart' in window

async function boot() {
  const fontTimeout = new Promise<void>(r => setTimeout(r, 2000))
  await Promise.race([
    Promise.all([
      document.fonts.load('500 10px Inter'),
      document.fonts.load('500 13px Inter'),
      document.fonts.load('700 18px Inter'),
      document.fonts.load('900 48px Inter'),
    ]),
    fontTimeout,
  ])

  const stage = document.getElementById('stage')!
  const vw = window.innerWidth
  const vh = window.innerHeight
  const mobile = isMobile()

  if (mobile) {
    const hint = document.querySelector('.hint-pill')
    if (hint) hint.textContent = 'tap and drag'
  }

  const cursor = new Cursor()
  cursor.attach()

  initQuoteBubble()

  // Canvas renderer with scattered keywords
  const canvasRenderer = new CanvasRenderer(stage)
  canvasRenderer.resize(vw, vh)
  await canvasRenderer.init(ALL_KEYWORDS)

  const quoteRenderer = new QuoteRenderer(stage)
  const headlineRenderer = new HeadlineRenderer(stage)
  headlineRenderer.position(vw, vh)

  const shootingStars = new ShootingStars()
  shootingStars.resize(vw, vh)

  // Moon — top-right, click to spin + centrifugal burst
  const moon = new Moon()
  moon.onCentrifugalBurst((cx, cy, radius, strength) => {
    canvasRenderer.applyCentrifugalBurst(cx, cy, radius, strength)
  })

  // UFO animation
  const ufo = new Ufo()
  ufo.onSequenceComplete(() => {
    sprintCountdown.reset()
  })
  ufo.onExplosion((x, y) => {
    canvasRenderer.triggerExplosion(x, y)
  })
  ufo.onCollisionExplosion((x, y) => {
    canvasRenderer.triggerCollisionExplosion(x, y)
  })

  const typingIndicator = new TypingIndicator()
  const sprintCountdown = new SprintCountdown()
  const toastNotifications = new ToastNotifications()

  // When sprint countdown hits zero, launch UFO toward moon
  sprintCountdown.onZero(() => {
    const kwPos = canvasRenderer.getRandomKeywordPos()
    if (kwPos) ufo.setKeywordTarget(kwPos.x, kwPos.y)
    ufo.start(moon.centerX, moon.centerY)
  })

  window.addEventListener('click', () => { cycleQuote() })

  let currentVW = vw
  let currentVH = vh
  const onResize = () => {
    currentVW = window.innerWidth
    currentVH = window.innerHeight
    canvasRenderer.resize(currentVW, currentVH)
    canvasRenderer.reflow(ALL_KEYWORDS)
    headlineRenderer.position(currentVW, currentVH)
    shootingStars.resize(currentVW, currentVH)
  }
  let resizeTimer: number | undefined
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(onResize, 100)
  })
  window.addEventListener('orientationchange', () => {
    setTimeout(onResize, 200)
  })

  function frame(now: number) {
    cursor.update()
    maybeAutoAdvance(now)

    typingIndicator.update(now)
    sprintCountdown.update()
    toastNotifications.update(now)

    shootingStars.update(now)
    moon.update(now)
    const headX = cursor.trail[0]?.x ?? -9999
    const headY = cursor.trail[0]?.y ?? -9999
    ufo.update(now, headX, headY)

    // Canvas: scattered keywords + meteor trail + embers + asteroid
    const starPoints = shootingStars.getActivePositions()
    canvasRenderer.render(
      cursor.trail, cursor.speed, now, starPoints,
      moon.centerX, moon.centerY,
    )

    // DOM overlays
    const obstacleRects: import('./types.ts').ObstacleRect[] = []
    headlineRenderer.update(cursor.x, cursor.y, currentVW, currentVH, obstacleRects)
    headlineRenderer.render()

    if (cursor.hasInteracted) {
      const bubble = layoutBubble(cursor.x, cursor.y, currentVW, currentVH)
      quoteRenderer.show()
      quoteRenderer.render(bubble)
    }

    requestAnimationFrame(frame)
  }

  requestAnimationFrame(frame)
}

boot()
