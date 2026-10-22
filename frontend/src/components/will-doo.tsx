import { useEffect, useRef } from 'react'
import { hasFinePointer } from '@/lib/space'

// Keep in sync with ROBOT_SIZE in lib/will-doo (imported lazily, so it can't be shared here).
const SIZE = { width: 200, height: 240 }

/** Will Doo roaming the background. three.js loads in its own chunk, after the app is up. */
export function WillDoo() {
  const container = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const bubble = useRef<HTMLDivElement>(null)
  const title = useRef<HTMLParagraphElement>(null)
  const text = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    if (!hasFinePointer()) return
    let stop: (() => void) | undefined
    let cancelled = false
    import('@/lib/will-doo').then(({ startWillDoo }) => {
      if (cancelled) return
      stop = startWillDoo(container.current!, canvas.current!, { el: bubble.current!, title: title.current!, text: text.current! })
    })
    return () => {
      cancelled = true
      stop?.()
    }
  }, [])

  return (
    <>
      <div
        ref={container}
        aria-hidden
        data-hidden="true"
        className="pointer-events-none fixed top-0 left-0 -z-[5] opacity-100 transition-opacity duration-700 will-change-transform data-[hidden=true]:opacity-0"
        style={SIZE}
      >
        {/* Soft blue halo behind him, as in the marketing renders */}
        <div className="absolute inset-[18%] rounded-full bg-[radial-gradient(closest-side,oklch(0.55_0.17_268/0.28),transparent)] blur-xl" />
        <canvas ref={canvas} className="relative size-full" />
      </div>
      <div
        ref={bubble}
        role="status"
        data-open="false"
        data-side="left"
        className="pointer-events-none fixed top-0 left-0 z-30 w-64 rounded-2xl border border-white/12 bg-linear-to-br from-[oklch(0.2_0.01_285/0.95)] to-[oklch(0.2_0.04_15/0.95)] px-4 py-3 shadow-2xl shadow-black/50 backdrop-blur-md transition-[opacity,scale] duration-300 data-[open=false]:scale-95 data-[open=false]:opacity-0 data-[side=left]:origin-bottom-right data-[side=right]:origin-bottom-left"
      >
        <p className="text-xs font-bold text-brand">Will Doo</p>
        <p ref={title} className="mt-1 text-[15px] leading-snug font-medium" />
        <p ref={text} className="mt-1 text-sm leading-snug text-muted-foreground" />
        {/* Tail pointing down at his head */}
        <span className="absolute -bottom-1.5 size-3 rotate-45 border-r border-b border-white/12 bg-[oklch(0.2_0.03_10)] [[data-side=left]_&]:right-6 [[data-side=right]_&]:left-6" />
      </div>
    </>
  )
}
