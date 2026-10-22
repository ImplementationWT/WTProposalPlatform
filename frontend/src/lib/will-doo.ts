// Will Doo, the Whatever Tech mascot: a small hovering robot that roams the empty parts of the
// background, follows the pointer with its head and eyes, gets curious when you click and waves now
// and then. Every joint is driven by a damped spring, so motion eases in and out on its own and
// carries a little follow-through (fins wobble after the head turns, arms trail when it flies).
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { FACTS, GREETING, INVITE } from './will-doo-brain'

/** Canvas size in CSS px; the robot is framed inside it with room for a raised arm. */
export const ROBOT_SIZE = { width: 200, height: 240 }

const AVOID = '[data-surface], [data-robot-avoid]'
const INTERACTIVE = 'a[href], button, [role="button"], [role="checkbox"], [role="combobox"], [role="tab"], [role="menuitem"]'


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
  // The brand W: a thick zig-zag, blue-violet on the left through coral to orange on the right.
  const cx = c.width / 2
  const cy = c.height * (1 - chestV)
  const w = 150
  const h = 84
  const grad = g.createLinearGradient(cx - w / 2, cy + h / 2, cx + w / 2, cy - h / 2)
  grad.addColorStop(0, '#5865ff')
  grad.addColorStop(0.5, '#f0334f')
  grad.addColorStop(1, '#ff8f3a')
  g.strokeStyle = grad
  g.lineWidth = 26
  g.lineJoin = 'miter'
  g.miterLimit = 3
  g.beginPath()
  g.moveTo(cx - w / 2, cy - h * 0.05)
  g.lineTo(cx - w * 0.2, cy + h / 2)
  g.lineTo(cx + w * 0.02, cy)
  g.lineTo(cx + w * 0.2, cy + h / 2)
  g.lineTo(cx + w / 2, cy - h / 2)
  g.stroke()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

/** Rounded "bubble box": a sphere pushed toward a box (superellipsoid), smooth everywhere. */
function squircle(w: number, h: number, d: number, n = 3) {
  const sphere = new THREE.SphereGeometry(1, 72, 48)
  sphere.deleteAttribute('normal')
  sphere.deleteAttribute('uv')
  const geo = mergeVertices(sphere)
  const p = geo.attributes.position
  const shape = (v: number) => Math.sign(v) * Math.abs(v) ** (2 / n)
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, (shape(p.getX(i)) * w) / 2, (shape(p.getY(i)) * h) / 2, (shape(p.getZ(i)) * d) / 2)
  }
  geo.computeVertexNormals()
  return geo
}

/** Fin blade: a tapered spindle, bent outward toward the tip like the ones on the renders. */
function leaf(side: number) {
  const geo = new THREE.LatheGeometry(
    new THREE.SplineCurve([
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.1, 0.05),
      new THREE.Vector2(0.125, 0.18),
      new THREE.Vector2(0.12, 0.34),
      new THREE.Vector2(0.095, 0.44),
      new THREE.Vector2(0, 0.5),
    ]).getSpacedPoints(32),
    32,
  )
  const p = geo.attributes.position
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / 0.5
    p.setX(i, p.getX(i) + side * 0.08 * t * t)
  }
  geo.computeVertexNormals()
  return geo
}

interface Arm {
  shoulder: THREE.Group
  elbow: THREE.Group
  hand: THREE.Group
}

const HEAD = { w: 1.62, h: 1.3, d: 1.32, y: 0.62 }

function buildRobot() {
  const white = new THREE.MeshPhysicalMaterial({ color: '#f6f7fb', roughness: 0.26, clearcoat: 1, clearcoatRoughness: 0.1 })
  const red = new THREE.MeshPhysicalMaterial({ color: '#f0364c', roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.15 })
  const visor = new THREE.MeshPhysicalMaterial({ color: '#040406', roughness: 0.06, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.03 })
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#ff4458', toneMapped: false })

  const root = new THREE.Group()

  // Egg-shaped torso, narrower than the head: round at the bottom, tapering under the chin.
  const profile = new THREE.SplineCurve([
    new THREE.Vector2(0, 0),
    new THREE.Vector2(0.34, 0.03),
    new THREE.Vector2(0.53, 0.16),
    new THREE.Vector2(0.6, 0.4),
    new THREE.Vector2(0.59, 0.66),
    new THREE.Vector2(0.52, 0.9),
    new THREE.Vector2(0.38, 1.1),
    new THREE.Vector2(0.2, 1.21),
    new THREE.Vector2(0, 1.24),
  ]).getSpacedPoints(64)
  const CHEST_Y = 0.6
  const chestIndex = profile.reduce((best, p, i) => (Math.abs(p.y - CHEST_Y) < Math.abs(profile[best].y - CHEST_Y) ? i : best), 0)
  const shell = white.clone()
  shell.map = bodyTexture(chestIndex / (profile.length - 1))
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 72, Math.PI, Math.PI * 2), shell) // chest at u = 0.5
  body.position.y = -0.7
  root.add(body)

  // Head sits right on the body (no visible neck), on its own pivot.
  const head = new THREE.Group()
  head.position.y = 0.56
  root.add(head)
  const skull = new THREE.Mesh(squircle(HEAD.w, HEAD.h, HEAD.d, 2.7), white)
  skull.position.y = HEAD.y
  head.add(skull)
  // Visor: a flatter, smaller squircle pushed just through the face, so it reads as an inset glossy panel.
  const face = new THREE.Mesh(squircle(1.3, 0.82, HEAD.d, 4), visor)
  face.position.set(0, HEAD.y, 0.03)
  head.add(face)
  root.updateMatrixWorld(true)

  const eyes = new THREE.Group()
  eyes.position.set(0, HEAD.y, 0) // eyes themselves sit on the visor surface (z per eye)
  head.add(eyes)
  const ray = new THREE.Raycaster()
  const eyeGlow = glowTexture('255,55,80')
  const eyeList: THREE.Object3D[] = []
  for (const x of [-0.24, 0.24]) {
    // Stick each eye onto the curved visor, facing along its surface normal.
    ray.set(new THREE.Vector3(x, head.position.y + HEAD.y, 5), new THREE.Vector3(0, 0, -1))
    const hit = ray.intersectObject(face)[0]
    const eye = new THREE.Group()
    eye.position.set(x, 0, (hit?.point.z ?? HEAD.d / 2) + 0.006)
    if (hit?.face) eye.lookAt(eye.position.clone().add(hit.face.normal))
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.125, 48), eyeMat)
    disc.scale.y = 1.12
    eye.add(disc)
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: eyeGlow, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
    glow.scale.setScalar(0.5)
    glow.position.z = 0.01
    eye.add(glow)
    eyes.add(eye)
    eyeList.push(eye)
  }

  // Headphone ears (rounded red ring, white centre) with curved leaf-shaped fins that wobble on
  // their own springs.
  const fins: THREE.Group[] = []
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.09, 24, 64), red)
    ear.rotation.y = Math.PI / 2
    ear.position.set(side * (HEAD.w / 2 - 0.02), HEAD.y - 0.02, 0)
    head.add(ear)
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.17, 32, 20), white)
    cap.scale.x = 0.45
    cap.position.copy(ear.position)
    head.add(cap)

    const fin = new THREE.Group()
    fin.position.set(side * (HEAD.w / 2 - 0.06), HEAD.y + 0.18, -0.1)
    fin.rotation.set(-0.2, 0, -side * 0.16)
    const blade = new THREE.Mesh(leaf(side), red)
    blade.scale.z = 0.55
    fin.add(blade)
    head.add(fin)
    fins.push(fin)
  }

  // Arms: red shoulder cap, chunky white upper arm and forearm, red mitten hands.
  const arms: Arm[] = []
  for (const side of [-1, 1]) {
    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.22, 40, 24), red)
    pad.scale.set(0.85, 1, 1)
    pad.position.set(side * 0.56, 0.1, 0)
    root.add(pad)

    const shoulder = new THREE.Group()
    shoulder.position.set(side * 0.6, 0.06, 0)
    root.add(shoulder)
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.155, 0.16, 10, 24), white)
    upper.position.y = -0.2
    shoulder.add(upper)

    const elbow = new THREE.Group()
    elbow.position.y = -0.34
    shoulder.add(elbow)
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.145, 0.12, 10, 24), white)
    fore.position.y = -0.11
    elbow.add(fore)

    const hand = new THREE.Group()
    hand.position.y = -0.26
    elbow.add(hand)
    // Mitten with the thumb on the body side, like a real hand hanging at rest.
    const mitten = new THREE.Mesh(new THREE.SphereGeometry(0.165, 40, 24), red)
    mitten.scale.set(1, 1.18, 0.8)
    mitten.position.y = -0.09
    hand.add(mitten)
    const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.066, 24, 16), red)
    thumb.scale.set(1, 1.35, 1)
    thumb.position.set(-side * 0.15, -0.04, 0.03)
    thumb.rotation.z = side * 0.5
    hand.add(thumb)
    arms.push({ shoulder, elbow, hand })
  }

  // Hover rings and a soft thrust glow under the body.
  const rings = [0.56, 0.45, 0.34].map((r, i) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.016, 10, 120),
      new THREE.MeshBasicMaterial({ color: '#5d82ff', transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    )
    ring.rotation.x = Math.PI / 2
    ring.position.y = -0.84 - i * 0.08
    root.add(ring)
    return ring
  })
  const thrust = new THREE.Mesh(
    new THREE.PlaneGeometry(1.9, 1.9),
    new THREE.MeshBasicMaterial({ map: glowTexture('80,115,255'), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }),
  )
  thrust.rotation.x = -Math.PI / 2
  thrust.position.y = -0.92
  root.add(thrust)

  return { root, head, eyes, eyesY: eyes.position.y, eyeList, fins, arms, rings, thrust }
}

// --- Behaviour ------------------------------------------------------------------------------------

interface Bubble {
  el: HTMLElement
  title: HTMLElement
  text: HTMLElement
}

type Point = { x: number; y: number }
type BubbleSide = 'left' | 'right' | 'above' | 'below'
type Segment = { from: Point; ctrl: Point; to: Point; t: number; duration: number }

/** Point on a quadratic Bézier flight path. */
function bezier(seg: Segment, t: number): Point {
  const u = 1 - t
  return {
    x: u * u * seg.from.x + 2 * u * t * seg.ctrl.x + t * t * seg.to.x,
    y: u * u * seg.from.y + 2 * u * t * seg.ctrl.y + t * t * seg.to.y,
  }
}

export interface WillDooHandle {
  stop(): void
  /** Open (element) or close (null) the chat: he stops wandering and keeps the panel beside him. */
  setChat(panel: HTMLElement | null): void
  /** Nod along for a moment, as if speaking. */
  talk(): void
}

/** hit: a transparent button kept over his body so he can be clicked (the canvas sits under the content). */
export function startWillDoo(container: HTMLElement, canvas: HTMLCanvasElement, bubble: Bubble, hit: HTMLElement): WillDooHandle {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches
  const { width: W, height: H } = ROBOT_SIZE

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.setSize(W, H, false)
  renderer.setClearColor(0x000000, 0)
  // Neutral keeps the brand red red; ACES washed it out toward salmon.
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = 1

  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environment = env
  // Less ambient, more directional: real shading on the white shell, plus the strong blue edge
  // lights the marketing renders have on both sides.
  scene.environmentIntensity = 0.45
  const key = new THREE.DirectionalLight('#fff3ea', 2.4)
  key.position.set(-2.5, 4, 5)
  const rim = new THREE.DirectionalLight('#5b7bff', 3.4)
  rim.position.set(3.5, 2, -3)
  const rimLeft = new THREE.DirectionalLight('#5b7bff', 2)
  rimLeft.position.set(-4, 1.5, -2.5)
  scene.add(key, rim, rimLeft, new THREE.HemisphereLight('#ffffff', '#27306a', 0.45))

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
    wrists: [spring(), spring()], // forearm twist: turns the palm toward the viewer to wave
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
  let bubbleSide: BubbleSide = 'left'
  let greeted = false
  let chat: HTMLElement | null = null
  const chatSize = { w: 0, h: 0 }
  let talkUntil = 0
  let nextChatter = 0 // when the next unprompted comment is due
  let nextBubbleCheck = 0
  let bubbleShift = 0 // px the above/below bubble slides sideways to clear nearby content
  let holdUntil = 0 // pauses the flight (e.g. to say hello)
  let flightSpeed = 1 // eases to 0 while holding, back to 1 after
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
    hit.dataset.hidden = String(h)
    if (h) say(null)
  }

  // The bubble never covers content or his own chat panel. Beside his head it is 256px wide; above
  // or below him it narrows so it still fits in the side gutters next to the panel, where he spends
  // most of his time.
  const BUBBLE_WIDTH: Record<BubbleSide, number> = { left: 256, right: 256, above: 208, below: 208 }
  // With the chat open you're talking to him, so his comments may briefly cover the page, never the chat.
  const bubbleObstacles = () => (chat ? [chat.getBoundingClientRect()] : avoidRects())
  const measureBubble = (side: BubbleSide) => {
    bubble.el.style.width = `${BUBBLE_WIDTH[side]}px`
    bubbleSize.w = bubble.el.offsetWidth
    bubbleSize.h = bubble.el.offsetHeight
  }
  /** Placements to try, best first; `current` (when moving) is kept if it still fits. */
  const placements = (current?: BubbleSide): BubbleSide[] => {
    const beside: BubbleSide[] = pos.x > innerWidth / 2 ? ['left', 'right'] : ['right', 'left']
    const all: BubbleSide[] = [...beside, 'above', 'below']
    return current ? [current, ...all.filter((p) => p !== current)] : all
  }
  /** Picks the first placement that covers nothing; false (and nothing changed) if none does. */
  const placeBubble = (current?: BubbleSide) => {
    const rects = bubbleObstacles()
    for (const side of placements(current)) {
      measureBubble(side)
      const shifts = side === 'above' || side === 'below' ? [0, 12, -12, 24, -24, 40, -40] : [0]
      for (const shift of shifts) {
        bubbleShift = shift
        if (bubbleFits(side, rects)) {
          bubbleSide = side
          return true
        }
      }
    }
    measureBubble(bubbleSide)
    return false
  }
  const bubbleFits = (side: BubbleSide, rects: DOMRect[]) => {
    const b = bubbleRect(side)
    return (
      b.x >= 8 &&
      b.x + bubbleSize.w <= innerWidth - 8 &&
      b.y >= 72 &&
      b.y + bubbleSize.h <= innerHeight - 8 &&
      rects.every((r) => b.x + bubbleSize.w <= r.left - 8 || b.x >= r.right + 8 || b.y + bubbleSize.h <= r.top - 8 || b.y >= r.bottom + 8)
    )
  }

  /** Shows a message; false when there's nowhere to put the bubble without covering anything. */
  const say = (msg: { title: string; text: string } | null, seconds = 5): boolean => {
    if (!msg) {
      if (bubbleUntil) nextChatter = time + rand(4, 8) // next comment comes a few seconds after this one closes
      bubble.el.dataset.open = 'false'
      bubbleUntil = 0
      return false
    }
    bubble.title.textContent = msg.title
    bubble.text.textContent = msg.text
    if (!placeBubble()) return false
    bubble.el.dataset.open = 'true'
    bubbleUntil = time + seconds
    return true
  }

  let invited = false
  /** What to say next: the click-me invitation first (unless the chat is already open), then facts. */
  const nextLine = () => {
    if (!invited && !chat) return INVITE
    // No invitation while the chat is open: you're already talking to him.
    const pool = chat ? FACTS.filter((f) => f !== INVITE) : FACTS
    return pool[Math.floor(Math.random() * pool.length)]
  }
  /** Says the next line; returns whether it fit on screen. */
  const comment = () => {
    const line = nextLine()
    const shown = say(line)
    if (shown && line === INVITE) invited = true
    return shown
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
    if (!hidden && !travel && !chat && time > waveCooldown && Math.hypot(e.clientX - pos.x, e.clientY - pos.y) < 150) {
      wave()
      if (!bubbleUntil && greeted) comment()
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
  /** Speech bubble beside and above the head, on the given side. */
  function bubbleRect(side: BubbleSide) {
    if (side === 'above' || side === 'below') {
      const x = clamp(pos.x - bubbleSize.w / 2 + bubbleShift, 8, innerWidth - bubbleSize.w - 8)
      return { x, y: side === 'above' ? pos.y - H * 0.46 - bubbleSize.h : pos.y + H * 0.47 }
    }
    return { x: side === 'left' ? pos.x - W * 0.18 - bubbleSize.w : pos.x + W * 0.18, y: pos.y - H * 0.42 - bubbleSize.h }
  }

  const place = () => {
    container.style.transform = `translate3d(${pos.x - W / 2}px, ${pos.y - H / 2}px, 0)`
    const b = bubbleRect(bubbleSide)
    bubble.el.dataset.side = bubbleSide
    bubble.el.style.transform = `translate3d(${b.x}px, ${b.y}px, 0)`
    hit.style.transform = `translate3d(${pos.x - W * 0.32}px, ${pos.y - H * 0.42}px, 0)`
    if (chat) {
      // Chat panel beside him, on the side with more room, kept inside the viewport.
      const left = pos.x > innerWidth / 2
      const x = left ? pos.x - W * 0.3 - chatSize.w : pos.x + W * 0.3
      // Top at chest height, leaving the space over his head free for comment bubbles.
      const y = clamp(pos.y - H * 0.15, 72, innerHeight - chatSize.h - 8)
      chat.dataset.side = left ? 'left' : 'right'
      chat.style.transform = `translate3d(${clamp(x, 8, innerWidth - chatSize.w - 8)}px, ${y}px, 0)`
    }
  }

  const update = (dt: number) => {
    time += dt

    // Wander: rest a while, then go somewhere else.
    if (!travel && !chat && time > idleUntil) {
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
      // Slow to a hover while holding, then pick the flight back up, both smoothly.
      flightSpeed += ((time < holdUntil ? 0 : 1) - flightSpeed) * (1 - Math.exp(-dt * 3))
      travel.t = Math.min(1, travel.t + (dt / travel.duration) * flightSpeed)
      Object.assign(pos, bezier(travel, easeInOut(travel.t)))
      if (travel.t >= 1 && route.length) {
        // Off screen on one side, back in on the other: jump without a velocity spike.
        travel = route.shift()!
        Object.assign(pos, travel.from)
        Object.assign(prev, pos)
      } else if (travel.t >= 1) {
        travel = null
        // Ended off screen (left with nowhere to re-enter yet): try coming back soon.
        idleUntil = time + (offscreen(pos) ? rand(1.5, 3) : rand(7, 15))
      }
    }

    // Speech: the hello the moment he is fully on screen (even mid-flight), then a comment a few
    // seconds after each bubble closes, chat open or not. Retries shortly when there's no room.
    if (!hidden && time > nextChatter && !bubbleUntil && fits(pos, [])) {
      if (!greeted) {
        greeted = say(GREETING, 5.5)
        if (greeted) {
          wave()
          holdUntil = time + 5 // stop and say hi, then carry on
        }
        else nextChatter = time + 0.25
      } else if (!comment()) nextChatter = time + 1
    }
    // While a bubble is up he keeps moving: flip it to the other side or close it early rather
    // than let it slide over content.
    if (bubbleUntil && time > nextBubbleCheck) {
      nextBubbleCheck = time + 0.2
      if (!bubbleFits(bubbleSide, bubbleObstacles()) && !placeBubble(bubbleSide)) say(null)
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

    // Speaking: a quick, fading nod.
    const talkNod = time < talkUntil ? Math.sin(time * 13) * 0.06 * Math.min(1, (talkUntil - time) * 2) : 0

    // Head: looks at the target on top of the body turn; tilts when curious or waving.
    const curious = time < tiltUntil ? tiltDir * 0.2 : 0
    const waving = waveT >= 0 ? -0.1 : 0
    const idleRoll = still ? 0 : Math.sin(time * 0.5) * 0.04
    robot.head.rotation.set(
      follow(s.headPitch, gazePitch + talkNod, dt, 50, 0.8),
      follow(s.headYaw, gazeYaw - bodyYaw * 0.7, dt, 50, 0.75),
      follow(s.headRoll, curious + waving + idleRoll - lean * 0.4, dt, 40, 0.6),
    )

    // Eyes: drift toward the gaze inside the visor, and blink.
    robot.eyes.position.x = follow(s.eyeX, clamp(dx / 2600, -0.06, 0.06), dt, 90, 0.9)
    robot.eyes.position.y = robot.eyesY + follow(s.eyeY, clamp(-dy / 4200, -0.04, 0.04), dt, 90, 0.9)
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
    let waveRaise = 0
    let waveShoulder = 0
    let waveElbow = 0
    let waveHand = 0
    if (waveT >= 0) {
      waveT += dt
      const D = 2.9
      const raise = waveT < 0.5 ? easeInOut(waveT / 0.5) : waveT > D - 0.6 ? easeInOut((D - waveT) / 0.6) : 1
      waveRaise = raise
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
      // Raised overhead the arm is flipped, so the wrist turns half a turn to keep the palm facing
      // out and the thumb pointing in, toward the head.
      arm.hand.rotation.y = follow(s.wrists[i], isWaver ? waveRaise * Math.PI : 0, dt, 40, 0.85)
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

  return {
    stop() {
      cancelAnimationFrame(frame)
      cancelAnimationFrame(reflow)
      removeEventListener('pointermove', onMove)
      removeEventListener('pointerdown', onDown)
      removeEventListener('scroll', onLayout, { capture: true })
      removeEventListener('resize', onLayout)
      env.dispose()
      pmrem.dispose()
      renderer.dispose()
    },
    setChat(panel) {
      chat = panel
      if (panel) {
        travel = null
        route = []
        chatSize.w = panel.offsetWidth
        chatSize.h = panel.offsetHeight
        invited = true // found the chat on their own: no need to invite anymore
        wave()
        // Too low or too high for the chat plus a bubble over his head? Float to a height where both fit.
        const want = clamp(pos.y, 72 + H * 0.46 + 120, innerHeight - 8 - chatSize.h + H * 0.15)
        if (Math.abs(want - pos.y) > 16) {
          const seg = arc(pos, { x: pos.x, y: want }, avoidRects())
          if (seg) travel = { ...seg, duration: 1.4 }
        }
      } else {
        idleUntil = time + rand(4, 8)
      }
    },
    talk() {
      talkUntil = time + 1.4
    },
  }
}
