// Will Doo, the Whatever Tech mascot: a small hovering robot that roams the empty parts of the
// background, follows the pointer with its head and eyes, gets curious when you click and waves now
// and then. Every joint is driven by a damped spring, so motion eases in and out on its own and
// carries a little follow-through (fins wobble after the head turns, arms trail when it flies).
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

/** Canvas size in CSS px; the robot is framed inside it with room for a raised arm. */
export const ROBOT_SIZE = { width: 200, height: 240 }

const AVOID = '[data-surface], [data-robot-avoid]'
const INTERACTIVE = 'a[href], button, [role="button"], [role="checkbox"], [role="combobox"], [role="tab"], [role="menuitem"]'

const GREETING = { title: '¡Hola! Soy Will Doo 👋', text: 'Me quedo por aquí viendo qué publicamos hoy.' }
const CHATTER = [
  { title: '¿Qué propuesta lanzamos hoy?', text: 'Súbela y yo la miro desde aquí.' },
  { title: '¡Hey! 👋', text: 'Solo pasaba a curiosear.' },
  { title: 'Todo en orden por aquí', text: 'Tus sitios siguen en línea.' },
  { title: '¿Necesitas algo?', text: 'Arrastra un .zip y lo publicamos.' },
]

// --- Springs -------------------------------------------------------------------------------------

interface Spring {
  v: number
  vel: number
}
const spring = (v = 0): Spring => ({ v, vel: 0 })

/** Damped spring toward target. zeta < 1 overshoots slightly, which is what makes it feel alive. */
function follow(s: Spring, target: number, dt: number, k = 60, zeta = 0.8) {
  s.vel += (k * (target - s.v) - 2 * Math.sqrt(k) * zeta * s.vel) * dt
  s.v += s.vel * dt
  return s.v
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
const rand = (min: number, max: number) => min + Math.random() * (max - min)
const easeInOut = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t)

// --- Model ----------------------------------------------------------------------------------------

function glowTexture(rgb: string) {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, `rgba(${rgb},0.9)`)
  grad.addColorStop(0.35, `rgba(${rgb},0.35)`)
  grad.addColorStop(1, `rgba(${rgb},0)`)
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** White shell with the gradient W painted where the chest sits on the lathe's UV map. */
function bodyTexture(chestV: number) {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 512
  const g = c.getContext('2d')!
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, c.width, c.height)
  const cx = c.width / 2
  const cy = c.height * (1 - chestV)
  const w = 96
  const h = 52
  const grad = g.createLinearGradient(cx - w / 2, cy + h / 2, cx + w / 2, cy - h / 2)
  grad.addColorStop(0, '#6f5cff')
  grad.addColorStop(0.5, '#ee3355')
  grad.addColorStop(1, '#ff8a3d')
  g.strokeStyle = grad
  g.lineWidth = 17
  g.lineJoin = 'miter'
  g.beginPath()
  g.moveTo(cx - w / 2, cy - h / 2 + 4)
  g.lineTo(cx - w / 4, cy + h / 2)
  g.lineTo(cx - 2, cy - h / 6)
  g.lineTo(cx + w / 4, cy + h / 2)
  g.lineTo(cx + w / 2, cy - h / 2)
  g.stroke()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

interface Arm {
  shoulder: THREE.Group
  elbow: THREE.Group
  hand: THREE.Group
}

function buildRobot() {
  const white = new THREE.MeshPhysicalMaterial({ color: 0xf3f4f8, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.15 })
  const red = new THREE.MeshPhysicalMaterial({ color: 0xec4156, roughness: 0.36, clearcoat: 0.7, clearcoatRoughness: 0.2 })
  const blue = new THREE.MeshPhysicalMaterial({ color: 0x86a3f5, roughness: 0.34, clearcoat: 0.7, clearcoatRoughness: 0.2 })
  const visor = new THREE.MeshPhysicalMaterial({ color: 0x08080c, roughness: 0.1, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.04 })
  const dark = new THREE.MeshStandardMaterial({ color: 0x24252d, roughness: 0.6 })
  const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.22, 0.3), toneMapped: false })

  const root = new THREE.Group()

  // Egg-shaped torso: wide round bottom, narrowing toward the neck.
  const profile = new THREE.SplineCurve([
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.42, 0.04),
    new THREE.Vector2(0.64, 0.22),
    new THREE.Vector2(0.7, 0.5),
    new THREE.Vector2(0.66, 0.8),
    new THREE.Vector2(0.54, 1.06),
    new THREE.Vector2(0.34, 1.23),
    new THREE.Vector2(0, 1.3),
  ]).getSpacedPoints(48)
  const chestIndex = profile.reduce((best, p, i) => (Math.abs(p.y - 0.62) < Math.abs(profile[best].y - 0.62) ? i : best), 0)
  const body = new THREE.Mesh(
    new THREE.LatheGeometry(profile, 64, Math.PI, Math.PI * 2), // seam at the back, chest at u = 0.5
    white.clone(),
  )
  ;(body.material as THREE.MeshPhysicalMaterial).map = bodyTexture(chestIndex / (profile.length - 1))
  body.position.y = -0.7
  root.add(body)

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.27, 0.16, 32), dark)
  neck.position.y = 0.62
  root.add(neck)

  // Head on its own pivot at the neck.
  const head = new THREE.Group()
  head.position.y = 0.66
  root.add(head)
  const skull = new THREE.Mesh(new RoundedBoxGeometry(1.56, 1.12, 1.24, 8, 0.4), white)
  skull.position.y = 0.56
  head.add(skull)
  const face = new THREE.Mesh(new RoundedBoxGeometry(1.18, 0.64, 0.2, 8, 0.17), visor)
  face.position.set(0, 0.54, 0.56)
  head.add(face)

  const eyes = new THREE.Group()
  eyes.position.set(0, 0.54, 0.665)
  head.add(eyes)
  const eyeGlow = glowTexture('255,60,80')
  const eyeList: THREE.Object3D[] = []
  for (const x of [-0.25, 0.25]) {
    const eye = new THREE.Group()
    eye.position.x = x
    eye.add(new THREE.Mesh(new RoundedBoxGeometry(0.19, 0.29, 0.06, 4, 0.085), eyeMat))
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: eyeGlow, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
    glow.scale.setScalar(0.62)
    glow.position.z = 0.04
    eye.add(glow)
    eyes.add(eye)
    eyeList.push(eye)
  }

  // Headphone-style ears, each with a fin that wobbles on its own spring.
  const fins: THREE.Group[] = []
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.16, 40), red)
    ear.rotation.z = Math.PI / 2
    ear.position.set(side * 0.8, 0.5, 0)
    head.add(ear)
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.18, 32), white)
    cap.rotation.z = Math.PI / 2
    cap.position.copy(ear.position)
    head.add(cap)

    const fin = new THREE.Group()
    fin.position.set(side * 0.78, 0.76, -0.06)
    fin.rotation.set(-0.15, 0, -side * 0.3)
    const blade = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.34, 8, 20), side < 0 ? red : blue)
    blade.scale.z = 0.45
    blade.position.y = 0.24
    fin.add(blade)
    head.add(fin)
    fins.push(fin)
  }

  // Arms: shoulder pad, upper arm, elbow, forearm, mitten hand.
  const arms: Arm[] = []
  for (const side of [-1, 1]) {
    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.25, 32, 20), red)
    pad.scale.set(0.9, 0.75, 1)
    pad.position.set(side * 0.6, 0.18, 0)
    root.add(pad)

    const shoulder = new THREE.Group()
    shoulder.position.set(side * 0.66, 0.16, 0)
    root.add(shoulder)
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.2, 8, 20), white)
    upper.position.y = -0.22
    shoulder.add(upper)

    const elbow = new THREE.Group()
    elbow.position.y = -0.38
    shoulder.add(elbow)
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.14, 8, 20), white)
    fore.position.y = -0.13
    elbow.add(fore)

    const hand = new THREE.Group()
    hand.position.y = -0.3
    elbow.add(hand)
    const mitten = new THREE.Mesh(new THREE.SphereGeometry(0.15, 32, 20), red)
    mitten.scale.set(1, 1.2, 0.8)
    mitten.position.y = -0.1
    hand.add(mitten)
    const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.065, 20, 14), red)
    thumb.position.set(-side * 0.14, -0.04, 0.03)
    hand.add(thumb)

    arms.push({ shoulder, elbow, hand })
  }

  // Hover rings and a soft thrust glow under the body.
  const ringMat = (opacity: number) =>
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.45, 0.6, 1), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
  const rings = [0.62, 0.5, 0.38].map((r, i) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.014, 8, 96), ringMat(0.75))
    ring.rotation.x = Math.PI / 2
    ring.position.y = -0.86 - i * 0.08
    root.add(ring)
    return ring
  })
  const thrust = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.MeshBasicMaterial({ map: glowTexture('110,140,255'), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  thrust.rotation.x = -Math.PI / 2
  thrust.position.y = -0.95
  root.add(thrust)

  return { root, head, eyes, eyeList, fins, arms, rings, thrust }
}

// --- Behaviour ------------------------------------------------------------------------------------

interface Bubble {
  el: HTMLElement
  title: HTMLElement
  text: HTMLElement
}

type Point = { x: number; y: number }
type Segment = { from: Point; ctrl: Point; to: Point; t: number; duration: number }

/** Point on a quadratic Bézier flight path. */
function bezier(seg: Segment, t: number): Point {
  const u = 1 - t
  return {
    x: u * u * seg.from.x + 2 * u * t * seg.ctrl.x + t * t * seg.to.x,
    y: u * u * seg.from.y + 2 * u * t * seg.ctrl.y + t * t * seg.to.y,
  }
}

export function startWillDoo(container: HTMLElement, canvas: HTMLCanvasElement, bubble: Bubble) {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches
  const { width: W, height: H } = ROBOT_SIZE

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.setSize(W, H, false)
  renderer.setClearColor(0x000000, 0)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05

  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environment = env
  scene.environmentIntensity = 0.7
  const key = new THREE.DirectionalLight(0xffffff, 1.8)
  key.position.set(-3, 4, 5)
  const rim = new THREE.DirectionalLight(0x6f8cff, 2.6) // the blue edge light from the marketing renders
  rim.position.set(3, 2, -4)
  const rimLeft = new THREE.DirectionalLight(0x6f8cff, 1.2)
  rimLeft.position.set(-4, 1, -3)
  scene.add(key, rim, rimLeft, new THREE.HemisphereLight(0xffffff, 0x1a1c2a, 0.5))

  const camera = new THREE.PerspectiveCamera(26, W / H, 0.1, 50)
  camera.position.set(0, 0.95, 8.2)
  camera.lookAt(0, 0.42, 0)

  const robot = buildRobot()
  scene.add(robot.root)

  // Joint springs.
  const s = {
    yaw: spring(), // whole body turning
    lean: spring(),
    pitchBody: spring(),
    headYaw: spring(),
    headPitch: spring(),
    headRoll: spring(),
    eyeX: spring(),
    eyeY: spring(),
    fins: [spring(), spring()],
    shoulders: [spring(-0.12), spring(0.12)],
    shouldersX: [spring(), spring()],
    elbows: [spring(), spring()],
    elbowsX: [spring(-0.15), spring(-0.15)],
    hands: [spring(), spring()],
  }

  // Screen-space state (CSS px, centre of the canvas).
  const pos: Point = { x: innerWidth + W, y: innerHeight * 0.55 }
  const vel: Point = { x: 0, y: 0 }
  let travel: Segment | null = null
  let route: Segment[] = [] // segments still to fly after the current one
  let hidden = false
  let idleUntil = 0
  let nextBlink = 1.5
  let blinkT = -1
  let secondBlink = false
  let waveT = -1
  let waveCooldown = 0
  let tiltUntil = 0
  let tiltDir = 1
  let bubbleUntil = 0
  const bubbleSize = { w: 0, h: 0 }
  let greeted = false
  let lookAround: Point | null = null
  let nextLookAround = 0
  let lastPointerMove = -Infinity
  const pointer: Point = { x: innerWidth / 2, y: innerHeight / 2 }
  let prevHeadYaw = 0
  let time = 0

  // --- Where may it go? Anywhere on screen that doesn't cover content, reached by a path that
  // doesn't cross content either: it never flies behind a panel.
  const robotBox = (p: Point) => ({ left: p.x - W * 0.32, right: p.x + W * 0.32, top: p.y - H * 0.42, bottom: p.y + H * 0.46 })
  const clearOf = (p: Point, rects: DOMRect[]) => {
    const b = robotBox(p)
    return rects.every((r) => b.right < r.left - 12 || b.left > r.right + 12 || b.bottom < r.top - 12 || b.top > r.bottom + 12)
  }
  const fits = (p: Point, rects: DOMRect[]) => {
    const b = robotBox(p)
    return b.left >= 8 && b.right <= innerWidth - 8 && b.top >= 72 && b.bottom <= innerHeight - 8 && clearOf(p, rects)
  }
  const offscreen = (p: Point) => p.x < 0 || p.x > innerWidth
  const avoidRects = () =>
    [...document.querySelectorAll(AVOID)].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0)

  /** A gently curved flight from one point to another, or null if every curve crosses content. */
  const arc = (from: Point, to: Point, rects: DOMRect[]): Segment | null => {
    const dist = Math.hypot(to.x - from.x, to.y - from.y)
    const nx = -(to.y - from.y) / (dist || 1)
    const ny = (to.x - from.x) / (dist || 1)
    const sign = Math.random() < 0.5 ? -1 : 1
    for (const bend of [0.18, -0.18, 0.35, -0.35, 0].map((b) => b * sign)) {
      const ctrl = { x: (from.x + to.x) / 2 + nx * dist * bend, y: (from.y + to.y) / 2 + ny * dist * bend - 40 }
      const seg = { from, ctrl, to, t: 0, duration: clamp(dist / 170, 2.6, 7) }
      let clear = true
      for (let i = 1; i < 24 && clear; i++) clear = clearOf(bezier(seg, i / 24), rects)
      if (clear) return seg
    }
    return null
  }

  /** Next outing: straight to a free spot, or out one side of the screen and back in the other. */
  const planTrip = (): Segment[] | null => {
    if (innerWidth < 1100) return null
    const rects = avoidRects()
    const spots: Point[] = []
    for (let i = 0; i < 80; i++) {
      const p = { x: rand(W / 2, innerWidth - W / 2), y: rand(H / 2 + 64, innerHeight - H / 2) }
      if (fits(p, rects) && Math.hypot(p.x - pos.x, p.y - pos.y) > 220) spots.push(p)
    }
    if (!spots.length) return null
    const away = offscreen(pos)
    if (!away && Math.random() < 0.75) {
      for (const spot of spots) {
        const seg = arc(pos, spot, rects)
        if (seg) return [seg]
      }
    }
    const side = pos.x < innerWidth / 2 ? -1 : 1
    const edge = (s: number, y: number) => ({ x: s < 0 ? -W : innerWidth + W, y })
    const out = away ? null : arc(pos, edge(side, pos.y + rand(-60, 60)), rects)
    if (!away && !out) return null
    // Already off screen: come back the same side. Otherwise reappear on the opposite one.
    const back = away ? side : -side
    for (const spot of spots) {
      const seg = arc(edge(back, spot.y + rand(-80, 80)), spot, rects)
      if (seg) return out ? [out, seg] : [seg]
    }
    return out ? [out] : null
  }

  const startTrip = (trip: Segment[]) => {
    ;[travel, ...route] = trip
  }

  const setHidden = (h: boolean) => {
    hidden = h
    container.dataset.hidden = String(h)
    if (h) say(null)
  }

  const say = (msg: { title: string; text: string } | null, seconds = 4.5) => {
    if (!msg) {
      bubble.el.dataset.open = 'false'
      bubbleUntil = 0
      return
    }
    bubble.title.textContent = msg.title
    bubble.text.textContent = msg.text
    bubble.el.dataset.open = 'true'
    bubbleSize.w = bubble.el.offsetWidth
    bubbleSize.h = bubble.el.offsetHeight
    bubbleUntil = time + seconds
  }

  const wave = () => {
    if (waveT >= 0) return
    waveT = 0
    waveCooldown = time + 9
  }

  // --- Input: it watches what you do.
  const onMove = (e: PointerEvent) => {
    pointer.x = e.clientX
    pointer.y = e.clientY
    lastPointerMove = time
    if (!hidden && !travel && time > waveCooldown && Math.hypot(e.clientX - pos.x, e.clientY - pos.y) < 150) {
      wave()
      if (Math.random() < 0.6) say(CHATTER[Math.floor(Math.random() * CHATTER.length)])
    }
  }
  const onDown = (e: PointerEvent) => {
    if (!(e.target as Element | null)?.closest?.(INTERACTIVE)) return
    // Curious head tilt toward whatever you just clicked.
    tiltDir = e.clientX > pos.x ? -1 : 1
    tiltUntil = time + 1.6
  }
  let reflow = 0
  const onLayout = () => {
    // Content moved (scroll/resize): if it now covers the robot, drift somewhere free.
    cancelAnimationFrame(reflow)
    reflow = requestAnimationFrame(() => {
      if (travel || hidden) return
      if (!fits(pos, avoidRects())) {
        const trip = planTrip()
        if (trip) startTrip(trip)
        else setHidden(true)
      }
    })
  }
  addEventListener('pointermove', onMove, { passive: true })
  addEventListener('pointerdown', onDown)
  addEventListener('scroll', onLayout, { passive: true, capture: true })
  addEventListener('resize', onLayout)

  // --- Frame loop
  const place = () => {
    container.style.transform = `translate3d(${pos.x - W / 2}px, ${pos.y - H / 2}px, 0)`
    // Speech bubble sits above the head, on the side with more room.
    const left = pos.x > innerWidth / 2
    bubble.el.dataset.side = left ? 'left' : 'right'
    const bx = left ? pos.x - W * 0.18 - bubbleSize.w : pos.x + W * 0.18
    const by = pos.y - H * 0.42 - bubbleSize.h
    bubble.el.style.transform = `translate3d(${clamp(bx, 8, innerWidth - bubbleSize.w - 8)}px, ${Math.max(8, by)}px, 0)`
  }

  const update = (dt: number) => {
    time += dt

    // Wander: rest a while, then go somewhere else.
    if (!travel && time > idleUntil) {
      if (hidden) {
        // Back from hiding (window grew, content moved): enter from the right edge.
        pos.x = innerWidth + W
        pos.y = innerHeight * 0.5
      }
      const trip = planTrip()
      if (trip) {
        setHidden(false)
        startTrip(trip)
      } else if (!offscreen(pos) && !fits(pos, avoidRects())) setHidden(true)
      idleUntil = time + 2
    }

    const prev = { ...pos }
    if (travel) {
      travel.t = Math.min(1, travel.t + dt / travel.duration)
      Object.assign(pos, bezier(travel, easeInOut(travel.t)))
      if (travel.t >= 1 && route.length) {
        // Off screen on one side, back in on the other: jump without a velocity spike.
        travel = route.shift()!
        Object.assign(pos, travel.from)
        Object.assign(prev, pos)
      } else if (travel.t >= 1) {
        travel = null
        idleUntil = time + rand(7, 15)
        if (!greeted) {
          greeted = true
          wave()
          say(GREETING, 5.5)
        }
      }
    }
    // Smoothed screen velocity (px/s) drives lean, turn and trailing arms.
    const k = 1 - Math.exp(-dt * 6)
    vel.x += ((pos.x - prev.x) / Math.max(dt, 1e-3) - vel.x) * k
    vel.y += ((pos.y - prev.y) / Math.max(dt, 1e-3) - vel.y) * k

    // Gaze: the pointer while you're active, otherwise a lazy look around; ahead while flying.
    const head = { x: pos.x, y: pos.y - H * 0.22 }
    let target: Point
    if (travel) target = { x: head.x + vel.x * 1.2, y: head.y + vel.y * 0.6 + 40 }
    else if (time - lastPointerMove < 3.5) target = pointer
    else {
      if (!lookAround || time > nextLookAround) {
        lookAround = { x: head.x + rand(-420, 420), y: head.y + rand(-160, 220) }
        nextLookAround = time + rand(1.8, 3.8)
      }
      target = lookAround
    }
    const dx = target.x - head.x
    const dy = target.y - head.y
    const gazeYaw = clamp(Math.atan2(dx, 520), -0.75, 0.75)
    const gazePitch = clamp(Math.atan2(dy, 640), -0.35, 0.4)

    // Body: turn into the direction of travel, lean into it, and follow the gaze a little.
    const bodyYaw = follow(s.yaw, clamp(vel.x * 0.0022, -0.5, 0.5) + gazeYaw * 0.3, dt, 18, 0.9)
    const lean = follow(s.lean, clamp(-vel.x * 0.0009, -0.3, 0.3), dt, 22, 0.7)
    const pitchBody = follow(s.pitchBody, clamp(vel.y * 0.0006, -0.18, 0.18), dt, 22, 0.8)
    const bob = still ? 0 : Math.sin(time * 1.7) * 0.07 + Math.sin(time * 0.63) * 0.03
    robot.root.rotation.set(pitchBody, bodyYaw, lean)
    robot.root.position.y = bob

    // Head: looks at the target on top of the body turn; tilts when curious or waving.
    const curious = time < tiltUntil ? tiltDir * 0.2 : 0
    const waving = waveT >= 0 ? -0.1 : 0
    const idleRoll = still ? 0 : Math.sin(time * 0.5) * 0.04
    robot.head.rotation.set(
      follow(s.headPitch, gazePitch, dt, 50, 0.8),
      follow(s.headYaw, gazeYaw - bodyYaw * 0.7, dt, 50, 0.75),
      follow(s.headRoll, curious + waving + idleRoll - lean * 0.4, dt, 40, 0.6),
    )

    // Eyes: drift toward the gaze inside the visor, and blink.
    robot.eyes.position.x = follow(s.eyeX, clamp(dx / 2600, -0.06, 0.06), dt, 90, 0.9)
    robot.eyes.position.y = 0.54 + follow(s.eyeY, clamp(-dy / 4200, -0.04, 0.04), dt, 90, 0.9)
    if (blinkT < 0 && time > nextBlink) blinkT = 0
    let lid = 1
    if (blinkT >= 0) {
      blinkT += dt / 0.16
      lid = 1 - Math.sin(Math.PI * Math.min(blinkT, 1)) * 0.92
      if (blinkT >= 1) {
        blinkT = -1
        // Now and then a quick second blink, never a third.
        secondBlink = !secondBlink && Math.random() < 0.25
        nextBlink = time + (secondBlink ? 0.12 : rand(2.2, 5.5))
      }
    }
    for (const eye of robot.eyeList) eye.scale.y = lid

    // Fins: secondary motion from how fast the head turns.
    const headYawVel = (robot.head.rotation.y - prevHeadYaw) / Math.max(dt, 1e-3)
    prevHeadYaw = robot.head.rotation.y
    robot.fins.forEach((fin, i) => {
      const side = i === 0 ? -1 : 1
      fin.rotation.z = -side * 0.3 + follow(s.fins[i], clamp(-headYawVel * 0.08 - lean * 0.5, -0.4, 0.4), dt, 70, 0.25)
    })

    // Arms: hang relaxed, trail behind motion, and the right one waves.
    const trail = clamp(-vel.x * 0.0011, -0.45, 0.45)
    const lift = clamp(-vel.y * 0.0006, -0.2, 0.25)
    const sway = still ? 0 : Math.sin(time * 1.7 + 0.8) * 0.05
    let waveShoulder = 0
    let waveElbow = 0
    let waveHand = 0
    if (waveT >= 0) {
      waveT += dt
      const D = 2.9
      const raise = waveT < 0.5 ? easeInOut(waveT / 0.5) : waveT > D - 0.6 ? easeInOut((D - waveT) / 0.6) : 1
      const swing = Math.sin((waveT - 0.5) * Math.PI * 2 * 1.6)
      waveShoulder = raise * 2.35
      waveElbow = raise * (0.45 + swing * 0.42)
      waveHand = raise * Math.sin((waveT - 0.5) * Math.PI * 2 * 1.6 - 0.9) * 0.35 // follow-through lag
      if (waveT >= D) waveT = -1
    }
    robot.arms.forEach((arm, i) => {
      const side = i === 0 ? -1 : 1
      const isWaver = side === 1
      arm.shoulder.rotation.z = follow(s.shoulders[i], side * (0.12 + lift) + trail + sway * side + (isWaver ? waveShoulder : 0), dt, 38, 0.72)
      arm.shoulder.rotation.x = follow(s.shouldersX[i], -lift * 0.5 + (isWaver ? waveShoulder * 0.12 : 0), dt, 38, 0.8)
      arm.elbow.rotation.z = follow(s.elbows[i], isWaver ? waveElbow : 0, dt, 60, 0.6)
      arm.elbow.rotation.x = follow(s.elbowsX[i], -0.15 - Math.abs(trail) * 0.3, dt, 40, 0.8)
      arm.hand.rotation.z = follow(s.hands[i], (isWaver ? waveHand : 0) + trail * 0.4, dt, 70, 0.5)
    })

    // Hover rings pulse against the bob, like thrust.
    robot.rings.forEach((ring, i) => {
      const pulse = still ? 0 : Math.sin(time * 3.2 - i * 0.7)
      ;(ring.material as THREE.MeshBasicMaterial).opacity = 0.45 + 0.3 * (0.5 + 0.5 * pulse)
      ring.scale.setScalar(1 + pulse * 0.04 - bob * 0.3)
    })
    ;(robot.thrust.material as THREE.MeshBasicMaterial).opacity = 0.4 + Math.min(0.35, Math.hypot(vel.x, vel.y) * 0.0015)

    if (bubbleUntil && time > bubbleUntil) say(null)
  }

  let frame = 0
  let last = performance.now()
  const loop = (now: number) => {
    frame = requestAnimationFrame(loop)
    const dt = Math.min((now - last) / 1000, 1 / 30)
    last = now
    update(dt)
    place()
    if (!hidden) renderer.render(scene, camera)
  }

  if (still) {
    // No roaming: settle in one free spot and only follow the pointer with the head.
    const rects = avoidRects()
    let spot: Point | null = null
    for (let i = 0; i < 80 && !spot; i++) {
      const p = { x: rand(W / 2, innerWidth - W / 2), y: rand(H / 2 + 64, innerHeight - H / 2) }
      if (fits(p, rects)) spot = p
    }
    if (spot) Object.assign(pos, spot)
    setHidden(!spot || innerWidth < 1100)
    greeted = true
    idleUntil = Infinity
  } else {
    setHidden(false)
  }
  frame = requestAnimationFrame(loop)

  return () => {
    cancelAnimationFrame(frame)
    cancelAnimationFrame(reflow)
    removeEventListener('pointermove', onMove)
    removeEventListener('pointerdown', onDown)
    removeEventListener('scroll', onLayout, { capture: true })
    removeEventListener('resize', onLayout)
    env.dispose()
    pmrem.dispose()
    renderer.dispose()
  }
}
