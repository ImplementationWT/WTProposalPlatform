import { useEffect, useRef } from 'react'
import { hasFinePointer, prefersReducedMotion, WORK_ZONE } from '@/lib/space'

const INTERACTIVE = 'a[href], button, [role="button"], [role="checkbox"], [role="combobox"], [role="tab"], [role="menuitem"], [role="option"], label, select, summary'
// Keep in sync with the `cursor: text` rule in index.css: the native I-beam takes over there.
const TEXT = 'input:not([type="checkbox"], [type="radio"], [type="range"], [type="button"], [type="submit"]), textarea, .cm-editor'

/**
 * Brand cursor: coral dot that keeps sending out a ripple, inside a breathing ring that trails it. Over the open
 * background it hides and the nebula trail stands in for it (only while the nebula is running).
 * Mouse/pen only.
 */
export function Cursor() {
  const root = useRef<HTMLDivElement>(null)
  const dot = useRef<HTMLDivElement>(null)
  const ring = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!hasFinePointer()) return
    const html = document.documentElement
    html.classList.add('custom-cursor')
    const el = root.current!
    const still = prefersReducedMotion()
    const target = { x: -100, y: -100 }
    const layers = [
      { node: dot.current!, x: -100, y: -100, ease: 1 },
      { node: ring.current!, x: -100, y: -100, ease: still ? 1 : 0.25 },
    ]
    let frame = 0

    const tick = () => {
      let moving = false
      for (const l of layers) {
        l.x += (target.x - l.x) * l.ease
        l.y += (target.y - l.y) * l.ease
        if (Math.abs(target.x - l.x) + Math.abs(target.y - l.y) > 0.1) moving = true
        l.node.style.transform = `translate3d(${l.x}px, ${l.y}px, 0)`
      }
      frame = moving ? requestAnimationFrame(tick) : 0
    }

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      const first = el.dataset.state === 'hidden'
      target.x = e.clientX
      target.y = e.clientY
      if (first) for (const l of layers) Object.assign(l, target) // don't fly in from the corner
      const over = e.target as Element | null
      const inSpace = 'nebula' in html.dataset && !over?.closest?.(WORK_ZONE)
      el.dataset.state = inSpace ? 'space' : over?.closest?.(TEXT) ? 'text' : over?.closest?.(INTERACTIVE) ? 'hover' : 'idle'
      if (!frame) frame = requestAnimationFrame(tick)
    }
    const onLeave = () => (el.dataset.state = 'hidden')
    const onDown = () => (el.dataset.pressed = 'true')
    const onUp = () => (el.dataset.pressed = 'false')

    addEventListener('pointermove', onMove, { passive: true })
    addEventListener('pointerdown', onDown)
    addEventListener('pointerup', onUp)
    html.addEventListener('pointerleave', onLeave)
    return () => {
      cancelAnimationFrame(frame)
      html.classList.remove('custom-cursor')
      removeEventListener('pointermove', onMove)
      removeEventListener('pointerdown', onDown)
      removeEventListener('pointerup', onUp)
      html.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  const layer = 'absolute top-0 left-0 will-change-transform'
  const center = 'absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 rounded-full'
  return (
    <div
      ref={root}
      aria-hidden
      data-state="hidden"
      className="group pointer-events-none fixed inset-0 z-[9999] hidden transition-opacity duration-300 data-[state=hidden]:opacity-0 data-[state=space]:opacity-0 data-[state=text]:opacity-0 [.custom-cursor_&]:block"
    >
      {/* Trailing ring: breathes slowly, swells and fills faintly over anything clickable */}
      <div ref={ring} className={layer}>
        <div
          className={`${center} size-7 transition-[scale,background-color] duration-300 ease-out group-data-[pressed=true]:scale-75 group-data-[state=hover]:scale-150 group-data-[state=hover]:bg-brand/10`}
        >
          <span className="block size-full animate-[cursor-breathe_3.6s_ease-in-out_infinite] rounded-full border border-brand/60 transition-colors group-data-[state=hover]:border-brand/90 motion-reduce:animate-none" />
        </div>
      </div>
      {/* Dot plus the ripple it keeps emitting */}
      <div ref={dot} className={layer}>
        <span className={`${center} size-12 animate-[cursor-ripple_2.4s_ease-out_infinite] border border-brand/50 motion-reduce:hidden group-data-[state=hover]:animate-[cursor-ripple_1.2s_ease-out_infinite]`} />
        <span className={`${center} size-1.5 bg-brand shadow-[0_0_6px_var(--brand)] transition-[scale] duration-300 group-data-[state=hover]:scale-125`} />
      </div>
    </div>
  )
}
