import { createFluid } from './fluid'

/** Cards, header, dialogs and menus: the nebula stops following the cursor over these. */
export const WORK_ZONE = '[data-surface], [data-slot$="-overlay"], [data-slot$="-content"]'

export const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches
export const hasFinePointer = () => matchMedia('(pointer: fine)').matches

// --- Starfield --------------------------------------------------------------------------------

const TINTS = ['255,255,255', '255,255,255', '255,255,255', '200,215,255', '255,228,196', '255,205,205']

interface Star {
  x: number
  y: number
  size: number
  alpha: number
  twinkle: number
  speed: number
  phase: number
  sprite: HTMLCanvasElement
}

interface Meteor {
  x: number
  y: number
  vx: number
  vy: number
  age: number
  life: number
}

function sprite(rgb: string) {
  const c = document.createElement('canvas')
  c.width = c.height = 32
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16)
  g.addColorStop(0, `rgba(${rgb},1)`)
  g.addColorStop(0.18, `rgba(${rgb},0.85)`)
  g.addColorStop(0.45, `rgba(${rgb},0.12)`)
  g.addColorStop(1, `rgba(${rgb},0)`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 32, 32)
  return c
}

/** Twinkling stars drifting slowly like the sky turning, plus an occasional shooting star. */
export function startStarfield(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!
  const sprites = TINTS.map(sprite)
  const still = prefersReducedMotion()
  const DRIFT = { x: -1.6, y: -0.35 } // px/s, shared by every star: the sky moves as one
  let stars: Star[] = []
  let meteor: Meteor | null = null
  let nextMeteor = 4 + Math.random() * 8
  let width = 0
  let height = 0

  const layout = () => {
    const dpr = Math.min(devicePixelRatio, 2)
    width = innerWidth
    height = innerHeight
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    stars = Array.from({ length: Math.round((width * height) / 1700) }, () => {
      // Power law: mostly faint pinpricks, a handful of bright ones.
      const size = 0.35 + Math.pow(Math.random(), 7) * 2.2
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        size,
        alpha: Math.min(1, 0.18 + Math.random() * 0.45 + size * 0.3),
        twinkle: 0.15 + Math.random() * 0.5,
        speed: 0.6 + Math.random() * 2.6,
        phase: Math.random() * Math.PI * 2,
        sprite: sprites[Math.floor(Math.random() * sprites.length)],
      }
    })
    draw(0, 0)
  }

  const draw = (t: number, dt: number) => {
    ctx.clearRect(0, 0, width, height)
    for (const s of stars) {
      s.x += DRIFT.x * dt
      s.y += DRIFT.y * dt
      if (s.x < -4) s.x += width + 8
      if (s.y < -4) s.y += height + 8
      const flicker = still ? 1 : 1 - s.twinkle * (0.5 + 0.5 * Math.sin(t * s.speed + s.phase))
      const d = s.size * 6
      ctx.globalAlpha = s.alpha * flicker
      ctx.drawImage(s.sprite, s.x - d / 2, s.y - d / 2, d, d)
    }
    ctx.globalAlpha = 1
    if (meteor) drawMeteor(meteor, dt)
  }

  const drawMeteor = (m: Meteor, dt: number) => {
    m.age += dt
    m.x += m.vx * dt
    m.y += m.vy * dt
    const fade = Math.sin(Math.min(m.age / m.life, 1) * Math.PI)
    const tail = 0.12
    const g = ctx.createLinearGradient(m.x, m.y, m.x - m.vx * tail, m.y - m.vy * tail)
    g.addColorStop(0, `rgba(255,255,255,${0.9 * fade})`)
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.strokeStyle = g
    ctx.lineWidth = 1.4
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(m.x, m.y)
    ctx.lineTo(m.x - m.vx * tail, m.y - m.vy * tail)
    ctx.stroke()
    if (m.age >= m.life) meteor = null
  }

  layout()
  addEventListener('resize', layout)
  if (still) return () => removeEventListener('resize', layout)

  let frame = 0
  let last = performance.now()
  const loop = (now: number) => {
    frame = requestAnimationFrame(loop)
    const dt = (now - last) / 1000
    if (dt < 1 / 40) return // ~30 fps is plenty for a slow sky
    last = now
    const step = Math.min(dt, 0.1)
    nextMeteor -= step
    if (nextMeteor <= 0) {
      nextMeteor = 7 + Math.random() * 12
      const angle = Math.PI * (0.62 + Math.random() * 0.16) // heading down-left
      const speed = 700 + Math.random() * 500
      meteor = {
        x: width * (0.3 + Math.random() * 0.7),
        y: height * Math.random() * 0.4,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        age: 0,
        life: 0.5 + Math.random() * 0.5,
      }
    }
    draw(now / 1000, step)
  }
  frame = requestAnimationFrame(loop)
  return () => {
    cancelAnimationFrame(frame)
    removeEventListener('resize', layout)
  }
}

// --- Nebula ---------------------------------------------------------------------------------------

function hsv(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6)
  const f = h * 6 - i
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)
  const sectors: [number, number, number][] = [
    [v, t, p],
    [q, v, p],
    [p, v, t],
    [p, q, v],
    [t, p, v],
    [v, p, q],
  ]
  return sectors[i % 6]
}

/** Smoke that trails the mouse across the background, shifting hue as it goes. */
export function startNebula(canvas: HTMLCanvasElement) {
  if (prefersReducedMotion() || !hasFinePointer()) return
  const fluid = createFluid(canvas)
  if (!fluid) return

  // The cursor hides over the background while this runs (components/cursor.tsx).
  const html = document.documentElement
  html.dataset.nebula = ''

  const INTENSITY = 0.07
  const MAX_STEP = 0.025 // caps a flick of the wrist so it can't fire a jet across the screen
  const EMBER = 0.0009 // faint glow kept at a resting pointer so you can still tell where it is
  const EMBER_MS = 6000
  const IDLE_MS = 14000 // the dye has fully dissipated by then; stop burning GPU
  let hue = Math.random()
  let prev: { x: number; y: number } | null = null
  let lastInput = 0
  let last = 0
  let frame = 0
  const queue: { x: number; y: number; dx: number; dy: number }[] = []

  const loop = (now: number) => {
    const dt = Math.min((now - last) / 1000, 1 / 60)
    last = now
    hue = (hue + dt * 0.03) % 1
    const [r, g, b] = hsv(hue, 0.75, 1)
    for (const s of queue.splice(0)) {
      fluid.splat(s.x, s.y, s.dx, s.dy, [r * INTENSITY, g * INTENSITY, b * INTENSITY])
    }
    if (prev && now - lastInput < EMBER_MS) {
      const swirl = now / 900
      fluid.splat(prev.x, prev.y, Math.cos(swirl) * 0.001, Math.sin(swirl) * 0.001, [r * EMBER, g * EMBER, b * EMBER], 0.4)
    }
    fluid.step(dt)
    fluid.render()
    if (now - lastInput > IDLE_MS) {
      fluid.clear()
      frame = 0
      return
    }
    frame = requestAnimationFrame(loop)
  }

  const onMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return
    if ((e.target as Element | null)?.closest?.(WORK_ZONE)) {
      prev = null
      return
    }
    const x = e.clientX / innerWidth
    const y = 1 - e.clientY / innerHeight
    if (prev && (x !== prev.x || y !== prev.y)) {
      const dist = Math.hypot(x - prev.x, y - prev.y)
      const k = Math.min(1, MAX_STEP / dist)
      hue = (hue + dist * 0.3) % 1
      queue.push({ x, y, dx: (x - prev.x) * k, dy: (y - prev.y) * k })
      lastInput = performance.now()
      if (!frame) {
        last = lastInput
        frame = requestAnimationFrame(loop)
      }
    }
    prev = { x, y }
  }
  const onLeave = () => (prev = null)

  addEventListener('pointermove', onMove, { passive: true })
  document.documentElement.addEventListener('pointerleave', onLeave)
  addEventListener('resize', fluid.resize)
  return () => {
    cancelAnimationFrame(frame)
    delete html.dataset.nebula
    removeEventListener('pointermove', onMove)
    document.documentElement.removeEventListener('pointerleave', onLeave)
    removeEventListener('resize', fluid.resize)
    fluid.destroy()
  }
}
