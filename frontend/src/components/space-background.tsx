import { useEffect, useRef } from 'react'
import { startNebula, startStarfield } from '@/lib/space'

/** Fixed night sky behind every screen; the nebula canvas sits on top of the stars. */
export function SpaceBackground() {
  const stars = useRef<HTMLCanvasElement>(null)
  const nebula = useRef<HTMLCanvasElement>(null)

  useEffect(() => startStarfield(stars.current!), [])
  useEffect(() => startNebula(nebula.current!), [])

  return (
    <>
      <canvas ref={stars} aria-hidden className="pointer-events-none fixed inset-0 -z-10 size-full" />
      <canvas ref={nebula} aria-hidden className="pointer-events-none fixed inset-0 -z-10 size-full" />
    </>
  )
}
