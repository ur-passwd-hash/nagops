# NagOps — Implementation Plan

> A satirical tech project management interface at nagops.com, powered by `@chenglou/pretext`.
> One question. Infinite ways to ask it. Zero chance you'll ship on time.

---

## 1. Project Structure

```
nagops.com/
├── index.html                  # Single-page entry — the stage for the nag
├── src/
│   ├── main.ts                 # Boot: load fonts → prepare all text → start rAF loop
│   ├── content.ts              # All keywords, quotes, and the headline string
│   ├── keyword-field.ts        # System 1: keyword physics (repulsion, damping, collision)
│   ├── keyword-renderer.ts     # DOM pool for keyword <span> elements
│   ├── quote-bubble.ts         # System 2: cursor-anchored quote layout via layoutNextLine
│   ├── quote-renderer.ts       # DOM pool for quote bubble + line <span> elements
│   ├── cursor.ts               # Mouse tracking, lerped position, first-interaction detection
│   ├── headline.ts             # "IS IT DONE YET?" — pretext-measured, positioned once
│   └── types.ts                # Shared types: Keyword, BubbleLayout, etc.
├── styles/
│   └── nagops.css              # Custom properties, keyword/quote/headline styles, atmosphere
├── public/
│   └── og-image.png            # Social share card: "IS IT DONE YET?"
├── package.json
├── tsconfig.json
└── vite.config.ts              # Vite for dev/build, single HTML output
```

## 2. Pretext Integration

### Install

```sh
npm install @chenglou/pretext
```

### Two Systems, One Cursor

The app has two distinct pretext-powered systems that both respond to the mouse:

1. **Keyword Field** — Tech terms scattered across the viewport. The cursor pushes them away like a magnetic force field. Pretext measures each keyword's width so we know its bounding box for physics without ever asking the DOM.
2. **Quote Bubble** — A nag quote appears anchored near the cursor, its text reflowing in real time as it tracks position and avoids viewport edges. Pretext's `layoutNextLine` gives us per-line variable widths so the quote wraps tightly into whatever space is available.

### System 1: Keyword Repulsion Field

The viewport is seeded with ~30-40 tech keywords, each absolutely positioned. Every frame, we calculate repulsion vectors from the cursor to each keyword's center. Keywords drift away from the mouse, collide softly with each other, and settle back into loose positions when the cursor moves elsewhere.

**Why pretext matters here:** Each keyword is measured once with `prepare()` to get its exact pixel width at its rendered font size. This width is cached and used for:
- Bounding box collision with the cursor's influence radius
- Preventing keyword overlap (keyword-to-keyword soft collision)
- Initial placement on a grid that respects each keyword's actual measured width (no uniform grid — "microservices" is wider than "k8s")

```ts
import { prepare, layout } from '@chenglou/pretext'

interface Keyword {
  text: string
  font: string
  width: number       // measured by pretext, cached once
  height: number      // single line height
  x: number           // current position
  y: number           // current position
  vx: number          // velocity x (for physics)
  vy: number          // velocity y (for physics)
  restX: number       // resting position to drift back toward
  restY: number       // resting position to drift back toward
  opacity: number     // fades based on proximity to cursor
  category: 'infra' | 'culture' | 'despair'  // color coding
}

// On init — measure every keyword once. Zero DOM reads.
const keywords: Keyword[] = ALL_TERMS.map(term => {
  const prepared = prepare(term.text, term.font)
  const { height } = layout(prepared, Infinity, KEYWORD_LINE_HEIGHT)
  // measureNaturalWidth alternative: we know it's one line, so width = layout at Infinity
  return {
    ...term,
    width: /* measured via canvas in prepare() internals, or use layoutWithLines */,
    height,
    x: randomInitialX(), y: randomInitialY(),
    vx: 0, vy: 0,
    restX: 0, restY: 0, // assigned during initial scatter
    opacity: 1,
  }
})

// Every rAF frame:
function updateKeywords(mouseX: number, mouseY: number) {
  for (const kw of keywords) {
    const dx = kw.x + kw.width / 2 - mouseX
    const dy = kw.y + kw.height / 2 - mouseY
    const dist = Math.sqrt(dx * dx + dy * dy)
    const influenceRadius = CURSOR_REPULSION_RADIUS // ~180px

    if (dist < influenceRadius && dist > 0) {
      // Repulsion force: inverse-square, capped
      const force = Math.min(REPULSION_STRENGTH / (dist * dist), MAX_FORCE)
      const nx = dx / dist  // normalized direction away from cursor
      const ny = dy / dist
      kw.vx += nx * force
      kw.vy += ny * force
      // Fade keywords that are very close to cursor
      kw.opacity = Math.max(0.15, dist / influenceRadius)
    } else {
      // Spring back toward rest position
      kw.vx += (kw.restX - kw.x) * SPRING_STRENGTH
      kw.vy += (kw.restY - kw.y) * SPRING_STRENGTH
      kw.opacity += (1 - kw.opacity) * 0.05 // fade back in
    }

    // Damping
    kw.vx *= DAMPING  // ~0.92
    kw.vy *= DAMPING

    // Integrate
    kw.x += kw.vx
    kw.y += kw.vy

    // Clamp to viewport
    kw.x = Math.max(0, Math.min(kw.x, viewportWidth - kw.width))
    kw.y = Math.max(0, Math.min(kw.y, viewportHeight - kw.height))
  }
}
```

**Visual behavior:**
- Keywords scatter away from the cursor like startled fish
- They drift lazily back to rest when the cursor moves away
- Close keywords fade to ~15% opacity (the cursor "burns" them away)
- Different categories get different muted colors: infrastructure = steel blue, culture = warm amber, despair = faded red
- The whole field has a living, breathing quality — the cursor is a predator moving through a school of buzzwords

### System 2: Quote Bubble (Cursor-Anchored Nag)

A quote appears near the cursor, anchored to it but offset so it doesn't occlude the pointer. The quote text is laid out with pretext's `layoutNextLine`, allowing it to reflow dynamically as the cursor approaches viewport edges (the available width shrinks).

```ts
import { prepareWithSegments, layoutNextLine, layoutWithLines } from '@chenglou/pretext'

// Pre-prepare all quotes at boot time
const preparedQuotes = QUOTES.map(q =>
  prepareWithSegments(q.text, QUOTE_FONT)
)

function layoutQuoteBubble(mouseX: number, mouseY: number) {
  const prepared = preparedQuotes[currentQuoteIndex]

  // Anchor the bubble offset from cursor — prefer bottom-right,
  // but flip to avoid going off-screen
  const OFFSET_X = 24
  const OFFSET_Y = 20
  const MAX_BUBBLE_WIDTH = 360
  const MIN_BUBBLE_WIDTH = 180

  // Calculate available width: how much space between cursor and viewport edge
  let bubbleX: number
  let availableWidth: number

  if (mouseX + OFFSET_X + MAX_BUBBLE_WIDTH < viewportWidth - 16) {
    // Plenty of room to the right
    bubbleX = mouseX + OFFSET_X
    availableWidth = Math.min(MAX_BUBBLE_WIDTH, viewportWidth - bubbleX - 16)
  } else if (mouseX - OFFSET_X - MAX_BUBBLE_WIDTH > 16) {
    // Flip to the left
    availableWidth = Math.min(MAX_BUBBLE_WIDTH, mouseX - OFFSET_X - 16)
    bubbleX = mouseX - OFFSET_X - availableWidth
  } else {
    // Cursor in the middle — squeeze to whatever fits
    availableWidth = Math.max(MIN_BUBBLE_WIDTH, viewportWidth - mouseX - OFFSET_X - 16)
    bubbleX = mouseX + OFFSET_X
  }

  // Similarly for vertical: prefer below, flip above if needed
  let bubbleY = mouseY + OFFSET_Y

  // Lay out the quote at the computed width using layoutNextLine
  // This is the magic — the bubble shrinks and grows as you move near edges
  let cursor = { segmentIndex: 0, graphemeIndex: 0 }
  let y = 0
  const lines: { text: string; x: number; y: number; width: number }[] = []

  while (true) {
    const line = layoutNextLine(prepared, cursor, availableWidth)
    if (line === null) break
    lines.push({ text: line.text, x: 0, y, width: line.width })
    cursor = line.end
    y += QUOTE_LINE_HEIGHT
  }

  const bubbleHeight = y
  // If bubble would overflow bottom, flip above cursor
  if (bubbleY + bubbleHeight > viewportHeight - 16) {
    bubbleY = mouseY - OFFSET_Y - bubbleHeight
  }

  return { bubbleX, bubbleY, lines, bubbleWidth: availableWidth, bubbleHeight }
}
```

**Visual behavior:**
- The quote bubble follows the cursor with a slight easing lag (lerp toward target position each frame, ~0.12 factor) so it feels floaty, not rigidly attached
- As you move toward the right edge of the viewport, the bubble narrows and the text reflows into more lines — completely live, no layout thrash
- The bubble has a subtle background (`rgba(26, 23, 20, 0.06)`) and rounded corners, like a tooltip from a dimension where all tooltips contain existential dread
- Quotes cycle every ~8 seconds with a crossfade: old quote fades out (opacity 0 over 400ms), new quote fades in. Or click anywhere to advance immediately
- The "IS IT DONE YET?" headline text also gets `prepareWithSegments` treatment and sits as a large, persistent piece of typography that the keyword field flows around

### System Interaction: Keywords + Quote Together

Both systems share the same `requestAnimationFrame` loop:

```ts
function frame() {
  updateKeywords(mouseX, mouseY)
  const bubble = layoutQuoteBubble(mouseX, mouseY)
  renderKeywords(keywords)
  renderQuoteBubble(bubble)
  requestAnimationFrame(frame)
}
```

Keywords also avoid the quote bubble — it acts as a secondary repulsion zone. So as you move the cursor, the keywords scatter from your pointer AND from the quote that's chasing you. The quote is nagging you. The keywords are running from the nag. It's a food chain of dysfunction.

## 3. Content Strategy

### Tech Keywords (the repulsion field)

These are the words that scatter when your cursor approaches. Each is absolutely positioned, measured once by pretext, and then purely physics-driven. They should feel like the detritus of every whiteboard session, architecture review, and "quick sync" you've ever attended.

**Infrastructure & Tooling** (color: steel blue, `#4a6d8c`):
`microservices`, `kubernetes`, `k8s`, `terraform`, `docker-compose.yml`, `yaml engineering`, `service mesh`, `istio`, `observability`, `grafana`, `prometheus`, `CI/CD`, `GitOps`, `infrastructure as code`, `serverless`, `lambda`, `edge functions`, `load balancer`, `nginx.conf`, `horizontal scaling`, `vertical scaling`, `sharding`, `redis`, `kafka`, `RabbitMQ`, `gRPC`, `REST`, `GraphQL`, `API gateway`, `helm chart`, `ArgoCD`, `Jenkins pipeline`

**Dev Culture & Process** (color: warm amber, `#8c7a4a`):
`yak shaving`, `bikeshedding`, `rubber ducking`, `cargo culting`, `tab vs spaces`, `rewrite it in Rust`, `10x engineer`, `0.1x engineer`, `sprint velocity`, `story points`, `fibonacci estimation`, `t-shirt sizing`, `standup`, `async standup`, `standup about the standup`, `retro`, `tech debt`, `scope creep`, `feature flag`, `dark launch`, `canary deploy`, `blue-green`, `pair programming`, `mob programming`, `mob crying`

**Modern Despair** (color: faded red, `#8c4a4a`):
`npm install universe`, `node_modules event horizon`, `left-pad incident`, `works on my machine`, `have you tried turning it off`, `git blame`, `git guilt`, `LGTM (didn't read)`, `TODO: fix later`, `FIXME: never`, `HACK: sorry`, `// this should never happen`, `segfault in production`, `it's a feature`, `not reproducible`, `closed: wontfix`, `priority: critical (for 6 months)`, `blocked by: everything`, `depends on: miracle`, `ETA: soon™`

### Nag Quotes (the cursor-following bubble)

These appear next to the cursor. Each one is a thorough, paragraph-length meditation on the same theme: "is it done yet?" They should feel like the inner monologue of a project manager who has achieved consciousness and regrets it.

**Message Pool:**

1. > "Look, I don't want to be that person, but the sprint ended three sprints ago, the burndown chart now qualifies as abstract art, and product just mass-pinged the channel with fourteen fire emojis. So genuinely, from the bottom of my thoroughly caffeinated heart: is it done yet?"

2. > "I've been told that if I ask about the status one more time I'll be uninvited from the team's Notion workspace, which is honestly the most productive threat anyone's made all quarter. But stakeholders don't care about my social standing. They care about shipping. So: is it done yet?"

3. > "Fun fact — the heat death of the universe is estimated at 10^100 years from now. Current trajectory puts our deployment timeline somewhere in that ballpark. I'm not saying we're behind schedule, I'm saying the schedule has filed a missing persons report. Is it done yet?"

4. > "The PM has started lighting actual candles at their desk. Not for ambiance. For prayer. The Jira board has more red than a Soviet parade. Somewhere, a Kubernetes pod is crying. I need you to look me in the eyes through this Slack message and tell me: is it done yet?"

5. > "I just watched a junior dev mass-refactor the auth service because someone on Twitter said microservices are dead. Meanwhile, the feature we promised in Q1 is entering its gap year. I respect the creative journey. I do. But contractually speaking: is it done yet?"

6. > "The standup lasted forty-seven minutes today. Forty-seven. Someone demoed a proof of concept for the proof of concept. Someone else said 'let's take this offline' about something that was already offline. We are offline. The whole project is offline. Is it done yet?"

7. > "Every morning I open my laptop and stare at the deployment pipeline like it's a slot machine. Three green checks and we ship. Instead I get: flaky test, flaky test, 'npm audit found 847 vulnerabilities.' I'm not asking for perfection. I'm asking for survival. Is it done yet?"

8. > "I've rewritten my status update email four times now. First draft: 'progressing well.' Second draft: 'minor delays.' Third draft: 'strategic re-prioritization.' Fourth draft: just a screenshot of a dumpster fire. Which one should I send? Better yet: is it done yet?"

9. > "The tech lead just mass-adopted a new state management library mid-sprint because the current one 'doesn't spark joy.' Meanwhile, we're three weeks past deadline and the only thing sparking is the on-call pager. I support professional growth, truly. But also: is it done yet?"

10. > "Legend has it that if you whisper 'ship it' three times into a Docker container, a DevOps engineer appears and tells you the pipeline is broken. We've been in code freeze so long the codebase has developed permafrost. Thaw it out. Deploy it. Is it done yet?"

11. > "According to the Gantt chart — yes, we still have a Gantt chart, it's beautiful, it's laminated, it's completely fictional — we should have shipped six weeks ago. The chart doesn't account for 'yak shaving,' 'scope creep,' or 'someone accidentally mass-deleted staging.' So: is it done yet?"

12. > "I've mass-renamed my Slack status from 'Focusing' to 'Coping.' The product owner has started cc'ing legal on feature requests. The intern asked what 'technical debt' means and three senior engineers started crying. These are the vibes. But vibes don't deploy. Is it done yet?"

## 4. Technical Implementation

### HTML Structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>NagOps — IS IT DONE YET?</title>
  <meta name="description" content="A satirical project management tool that asks the only question that matters." />
  <meta property="og:title" content="NagOps — IS IT DONE YET?" />
  <meta property="og:description" content="Ship it. Or don't. The nag is eternal." />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&family=Playfair+Display:wght@700;900&display=swap" rel="stylesheet" />
</head>
<body>
  <div class="page">
    <!-- Atmospheric gradients — the emotional weather system -->
    <div class="atmosphere atmosphere--left"></div>
    <div class="atmosphere atmosphere--right"></div>

    <!-- Hint pill — "move your cursor" prompt, fades after first interaction -->
    <p class="hint-pill">Move your cursor. Confront the nag.</p>

    <div class="stage">
      <!-- Layer 0: Keyword field — z-index: 1 -->
      <!-- Each keyword is a <span class="keyword keyword--{category}"> -->
      <!-- Positioned via transform, physics-driven every frame -->
      <div class="keyword-field"></div>

      <!-- Layer 1: Headline — z-index: 2 -->
      <!-- "IS IT DONE YET?" rendered by pretext, positioned as block -->
      <h1 class="headline"></h1>

      <!-- Layer 2: Quote bubble — z-index: 3, follows cursor -->
      <!-- Contains pretext-rendered lines that reflow based on available space -->
      <div class="quote-bubble">
        <div class="quote-bubble__lines"></div>
      </div>
    </div>
  </div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

### Styling Approach

The aesthetic: a warm, editorial parchment that looks like someone designed a beautiful magazine spread and then filled it entirely with project management anxiety.

```css
:root {
  color-scheme: light;
  --paper: #f2ede4;           /* warm parchment — the memo nobody reads */
  --ink: #1a1714;              /* near-black, for headline */
  --muted: #6b5f52;            /* secondary text */
  --accent: #c0392b;           /* urgent red — deadline energy */
  --accent-alt: #e67e22;       /* warning orange — "we need to talk" energy */
  --kw-infra: #4a6d8c;         /* steel blue — infrastructure keywords */
  --kw-culture: #8c7a4a;       /* warm amber — dev culture keywords */
  --kw-despair: #8c4a4a;       /* faded red — modern despair keywords */
  --bubble-bg: rgba(26, 23, 20, 0.055);
  --bubble-border: rgba(26, 23, 20, 0.1);
}

/* Keywords */
.keyword {
  position: absolute;
  white-space: nowrap;
  font: 500 13px/1 'Inter', sans-serif;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  user-select: none;
  pointer-events: none;
  will-change: transform, opacity;
  transition: opacity 80ms ease;
}
.keyword--infra   { color: var(--kw-infra); }
.keyword--culture { color: var(--kw-culture); }
.keyword--despair { color: var(--kw-despair); }

/* Some keywords rendered larger for visual hierarchy */
.keyword--large {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.04em;
  opacity: 0.7;
}
.keyword--small {
  font-size: 10px;
  opacity: 0.5;
}

/* Quote bubble */
.quote-bubble {
  position: absolute;
  padding: 16px 20px;
  border-radius: 14px;
  background: var(--bubble-bg);
  border: 1px solid var(--bubble-border);
  backdrop-filter: blur(8px);
  will-change: transform, opacity;
  pointer-events: none;
  z-index: 3;
  box-shadow: 0 12px 32px rgba(26, 23, 20, 0.08);
}

/* Each line inside the bubble */
.quote-line {
  position: absolute;
  white-space: pre;
  font: 400 15px/22px 'Inter', sans-serif;
  color: var(--ink);
  letter-spacing: 0.005em;
}

/* Headline */
.headline {
  position: absolute;
  margin: 0;
  font: 900 72px/1.05 'Playfair Display', Georgia, serif;
  color: var(--ink);
  user-select: text;
  z-index: 2;
}
```

- **Headline** (`IS IT DONE YET?`): Fixed position (e.g. upper-center or golden-ratio offset). Pretext measures it once; it doesn't reflow but acts as a visual anchor that keywords scatter around.
- **Keywords**: Three sizes (small 10px, normal 13px, large 18px) scattered at varying opacities. The size variation creates depth — some words feel closer, some feel like they're receding into the parchment.
- **Quote bubble**: Frosted glass feel with backdrop blur. Follows the cursor with easing. Text inside reflows live via `layoutNextLine` as the bubble adjusts its width near viewport edges.
- **Atmosphere**: Soft radial gradients — warm red-orange bleed in one corner (deadline anxiety), cool blue-grey in the opposite (the cold indifference of infrastructure).

### Interaction Model — The Full Frame Loop

Every `requestAnimationFrame` tick, in order:

1. **Read mouse** — `mousemove` sets `targetX`, `targetY`. The actual cursor position used for physics is lerped toward this target (`currentX += (targetX - currentX) * 0.15`) for buttery smoothness.

2. **Update keyword physics** — For each of the ~35 keywords:
   - Calculate distance from cursor center to keyword center
   - If within `CURSOR_REPULSION_RADIUS` (~180px): apply inverse-square repulsion force + reduce opacity
   - If within `QUOTE_BUBBLE_RADIUS` (the bubble's current bounding box + 20px padding): apply secondary, softer repulsion so keywords don't overlap the quote
   - Otherwise: spring back toward rest position with damping
   - Apply velocity, clamp to viewport bounds
   - Keyword-to-keyword soft collision: if two keywords' pretext-measured bounding boxes overlap, nudge them apart along the shortest axis

3. **Layout quote bubble** — Determine available width based on cursor position relative to viewport edges. Run `layoutNextLine` in a loop to get the quote's lines at that width. Position the bubble container offset from cursor. If the bubble would overflow vertically, flip it above the cursor.

4. **Render keywords** — Update each keyword `<span>`'s `transform` and `opacity`. Element pool pattern: create spans on first run, reuse thereafter. All updates are `transform`-only (compositor thread, no layout reflow).

5. **Render quote bubble** — Update the bubble container's `transform`. Update each line `<span>` inside it (text content + transform). Pool excess spans.

6. **Check quote timer** — If 8 seconds have elapsed since the last quote change (or user clicked), crossfade to the next quote: fade out bubble opacity over 300ms, swap `currentQuoteIndex`, fade in over 300ms.

7. **Hint pill** — On first `mousemove`, fade out the "Move your cursor" pill and never show it again.

### Rendering Details

**Keyword rendering:**
```ts
function renderKeywords(keywords: Keyword[]) {
  for (let i = 0; i < keywords.length; i++) {
    const el = keywordPool[i]  // pre-created <span> elements
    el.style.transform = `translate(${keywords[i].x}px, ${keywords[i].y}px)`
    el.style.opacity = String(keywords[i].opacity)
  }
}
```

**Quote bubble rendering:**
```ts
function renderQuoteBubble(bubble: BubbleLayout) {
  // Position the container
  bubbleEl.style.transform = `translate(${bubble.bubbleX}px, ${bubble.bubbleY}px)`
  bubbleEl.style.width = `${bubble.bubbleWidth}px`

  // Render each line inside the bubble
  for (let i = 0; i < bubble.lines.length; i++) {
    const el = getOrCreateQuoteLine(i)
    el.textContent = bubble.lines[i].text
    el.style.transform = `translate(${bubble.lines[i].x}px, ${bubble.lines[i].y}px)`
  }
  hideExtraQuoteLines(bubble.lines.length)
}
```

All DOM writes happen once per frame. No `getBoundingClientRect`. No `offsetHeight`. No layout reflow in the hot path. Pretext handles every measurement. The browser just paints.

### Mobile Fallback

On touch devices / viewports under 760px:
- Keyword field is static — scattered randomly, no physics, gentle CSS float animation (`@keyframes drift`)
- Quote bubble is fixed at the bottom of the screen, full-width, with tap-to-advance
- Headline is centered at the top
- The hint pill is hidden (no cursor to move)
- Touch-drag could optionally trigger keyword scatter in a future iteration

## 5. Performance Considerations

- **Pretext `prepare()` / `prepareWithSegments()`**: Runs once per keyword (at boot) and once per quote change. ~35 keywords = ~35 prepare calls at init, but each is a single short string so total is <5ms. Quotes are pre-prepared at boot.
- **Pretext `layoutNextLine()`**: Runs ~5-12 times per frame (one per quote line). Sub-millisecond total.
- **Keyword physics**: ~35 distance calculations + force integrations per frame. Trivial arithmetic — no allocation, no DOM reads.
- **DOM writes**: ~35 keyword transform updates + ~8 quote line updates = ~43 style mutations per frame, all `transform`/`opacity` only (compositor-friendly, no layout reflow).
- **Element pooling**: All `<span>` elements created once at boot, reused every frame. Zero GC pressure from DOM operations.
- **`will-change: transform`** on all animated elements for GPU compositing.
- **`mousemove` throttling**: Natural rAF cadence. `mousemove` sets a target; the frame loop reads it. No work happens outside the rAF callback.

## 6. Local Development & Deployment

### Local Dev

```sh
npm install
npm run dev    # Vite dev server → http://localhost:5173
```

That's it. Open the page. Move your mouse. Feel the existential weight of every sprint you've ever been part of. Hot module reload means your shame refreshes in real time.

### Build

```sh
npm run build   # Vite → single index.html + hashed JS/CSS assets in dist/
npx vite preview # Sanity-check the prod build locally before unleashing it
```

### Deployment (Later — We'll Cross That Bridge When We Burn It)

- **Hosting**: Cloudflare Pages or Vercel — zero-config static deploy, custom domain `nagops.com` via CNAME
- **CI/CD**: GitHub Actions, whenever we get around to it. The irony of procrastinating on deploying a site about procrastination is not lost on us
- **Cache**: Vite's content hashing gives us immutable assets. `index.html` gets a short TTL. The nag, however, is cached permanently in the developer's psyche

---

## 7. Philosophy & Tone Guide

The voice of NagOps is the voice of every Slack channel at 4:47 PM on a Friday when someone from product drops in with "quick question."

**Core principles:**

- **Empathy, but make it passive-aggressive.** We understand the struggle. We've lived the struggle. We're still going to ask if it's done.
- **Technically literate despair.** Every joke should land harder if you've actually debugged a race condition at 2 AM. If a non-developer reads it and chuckles, good. If a staff engineer reads it and dissociates, perfect.
- **The absurdity is the point.** We're building an entire interactive text-layout experience powered by a cutting-edge DOM-free measurement library... to ask one question. Over and over. That's the joke. That's the product. That's the company.

**What NagOps is NOT:**
- Mean-spirited. We're laughing with the industry, not at individuals.
- Ironic detachment without craft. The text reflows beautifully. The typography is considered. The engineering is real. The nihilism is earned.

**Inspirational quotes for the README, splash screen, or wherever despair needs seasoning:**

> *"The deployment pipeline is a suggestion. The deadline is a vibe. The Gantt chart is fan fiction. But the nag? The nag is forever."*

> *"We don't have a roadmap. We have a ransom note made of Jira tickets."*

> *"Your standup could have been a git log. Your retro could have been a sigh. Your sprint could have been a walk."*

> *"The backlog isn't growing. It's just becoming self-aware."*

> *"Somewhere, right now, a developer is mass-renaming variables instead of finishing the feature. NagOps sees you. NagOps understands. NagOps still needs that PR by EOD."*

> *"We put the 'ops' in 'oops.'"*

> *"Every line of code you write is technical debt to someone. Usually future you. Future you is not impressed."*

> *"This site runs on @chenglou/pretext, zero DOM measurements, and pure uncut anxiety."*

> *"Agile is just waterfall wearing a hoodie and calling everyone 'dude.'"*

> *"You can't have a deployment incident if you never deploy. This is not the productivity hack leadership had in mind."*

> *"The only microservice that's truly decoupled is the one nobody remembers exists. It's been running in production for three years. It's fine. Probably."*

> *"We're not behind schedule. We're ahead of next quarter's schedule. It's all about framing."*

---

*Built with mass-caffeinated intention by NagOps, 2026. Now close this file and go ship something.*
