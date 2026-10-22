import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Official lockup (gradient mark + white wordmark), exported at 3x the header height.
export function Logo({ className }: { className?: string }) {
  return <img src="/brand/logo.png" alt="Whatever Tech" width={550} height={120} className={cn('h-8 w-auto', className)} />
}

// Coral dot + spaced monospace label, as used above headings on whatever.tech.
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('flex items-center gap-2 font-mono text-xs tracking-[0.25em] text-brand uppercase', className)}>
      <span className="size-2 rounded-full bg-brand shadow-[0_0_10px_var(--brand)]" />
      {children}
    </p>
  )
}
