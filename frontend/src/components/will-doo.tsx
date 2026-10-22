import { useQuery } from '@tanstack/react-query'
import { SendHorizonalIcon, XIcon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent, type Ref } from 'react'
import { api } from '@/lib/api'
import { useAppConfig } from '@/lib/hooks'
import { hasFinePointer } from '@/lib/space'
import { reply, STARTERS } from '@/lib/will-doo-brain'
import type { WillDooHandle } from '@/lib/will-doo'
import { cn } from '@/lib/utils'

// Keep in sync with ROBOT_SIZE in lib/will-doo (imported lazily, so it can't be shared here).
const SIZE = { width: 200, height: 240 }

interface Message {
  from: 'bot' | 'user'
  text: string
  follow?: string[]
}

const WELCOME: Message = {
  from: 'bot',
  text: '¡Hola! Soy Will Doo 🤖 Pregúntame lo que quieras sobre el Publicador de subdominios.',
  follow: STARTERS,
}

/** Will Doo roaming the background; click him to chat. three.js loads in its own chunk, after the app is up. */
export function WillDoo() {
  const container = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const bubble = useRef<HTMLDivElement>(null)
  const title = useRef<HTMLParagraphElement>(null)
  const text = useRef<HTMLParagraphElement>(null)
  const hit = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const handle = useRef<WillDooHandle | null>(null)

  // The chat belongs to a session: logging out (or in) starts a fresh, closed conversation, so whoever
  // signs in next on this tab never sees the previous one. Same query App uses, shared through the cache.
  const session = useQuery({ queryKey: ['session'], queryFn: api.session, staleTime: Infinity, retry: false })
  const sessionKey = session.data?.username ?? 'signed-out'
  const [openFor, setOpenFor] = useState<string | null>(null)
  const open = openFor === sessionKey
  const close = useCallback(() => setOpenFor(null), [])

  useEffect(() => {
    if (!hasFinePointer()) return
    let cancelled = false
    import('@/lib/will-doo').then(({ startWillDoo }) => {
      if (cancelled) return
      handle.current = startWillDoo(container.current!, canvas.current!, { el: bubble.current!, title: title.current!, text: text.current! }, hit.current!)
    })
    return () => {
      cancelled = true
      handle.current?.stop()
      handle.current = null
    }
  }, [])

  useEffect(() => {
    handle.current?.setChat(open ? panel.current : null)
  }, [open])

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

      {/* The canvas sits under the page content, so clicks go to this invisible button that follows his body. */}
      <button
        ref={hit}
        type="button"
        data-will-doo
        data-hidden="true"
        aria-label="Hablar con Will Doo"
        aria-expanded={open}
        onClick={() => setOpenFor(open ? null : sessionKey)}
        className="fixed top-0 left-0 z-20 rounded-[45%] outline-none focus-visible:ring-2 focus-visible:ring-brand/60 data-[hidden=true]:pointer-events-none"
        style={{ width: SIZE.width * 0.64, height: SIZE.height * 0.88 }}
      />

      <div
        ref={bubble}
        role="status"
        data-open="false"
        data-side="left"
        style={{ width: 256 }} // narrowed by lib/will-doo when it sits above his head
        className="pointer-events-none fixed top-0 left-0 z-30 rounded-2xl border border-white/12 bg-linear-to-br from-[oklch(0.2_0.01_285/0.95)] to-[oklch(0.2_0.04_15/0.95)] px-4 py-3 shadow-2xl shadow-black/50 backdrop-blur-md transition-[opacity,scale] duration-300 data-[open=false]:scale-95 data-[open=false]:opacity-0 data-[side=above]:origin-bottom data-[side=below]:origin-top data-[side=left]:origin-bottom-right data-[side=right]:origin-bottom-left"
      >
        <p className="text-xs font-bold text-brand">Will Doo</p>
        <p ref={title} className="mt-1 text-[15px] leading-snug font-medium" />
        <p ref={text} className="mt-1 text-sm leading-snug text-muted-foreground" />
        {/* Tail pointing at him: down from above or beside, up from below */}
        <span className="absolute -bottom-1.5 size-3 rotate-45 border-r border-b border-white/12 bg-[oklch(0.2_0.03_10)] [[data-side=above]_&]:left-[calc(50%-6px)] [[data-side=below]_&]:-top-1.5 [[data-side=below]_&]:bottom-auto [[data-side=below]_&]:left-[calc(50%-6px)] [[data-side=below]_&]:rotate-[225deg] [[data-side=left]_&]:right-6 [[data-side=right]_&]:left-6" />
      </div>

      <WillDooChat
        key={sessionKey}
        ref={panel}
        open={open}
        onClose={close}
        onAnswer={() => handle.current?.talk()}
      />
    </>
  )
}

function WillDooChat({
  ref,
  open,
  onClose,
  onAnswer,
}: {
  ref: Ref<HTMLDivElement>
  open: boolean
  onClose: () => void
  onAnswer: () => void
}) {
  const { data: config } = useAppConfig()
  const [messages, setMessages] = useState<Message[]>([WELCOME])
  const [draft, setDraft] = useState('')
  const [typing, setTyping] = useState(false)
  const list = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    input.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    // A click anywhere outside closes it. Will Doo himself is excluded: his own click toggles the chat.
    const onPointerDown = (e: PointerEvent) => {
      if (!(e.target as Element | null)?.closest?.('[data-will-doo]')) onClose()
    }
    addEventListener('keydown', onKey)
    addEventListener('pointerdown', onPointerDown, true)
    return () => {
      removeEventListener('keydown', onKey)
      removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [open, onClose])

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' })
  }, [messages, typing])

  const ask = (question: string) => {
    const q = question.trim()
    if (!q || typing) return
    setMessages((m) => [...m, { from: 'user', text: q }])
    setDraft('')
    setTyping(true)
    // A short "thinking" beat reads friendlier than an instant answer.
    setTimeout(() => {
      const r = reply(q, { sitesSuffix: config?.sitesSuffix, maxUploadMb: config?.maxUploadMb })
      setMessages((m) => [...m, { from: 'bot', ...r }])
      setTyping(false)
      onAnswer()
    }, 450 + Math.min(q.length * 12, 600))
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    ask(draft)
  }

  const last = messages[messages.length - 1]
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Chat con Will Doo"
      inert={!open}
      data-will-doo
      data-open={open}
      className="fixed top-0 left-0 z-40 flex h-[26rem] w-80 flex-col overflow-hidden rounded-2xl border border-white/12 bg-linear-to-br from-[oklch(0.19_0.01_285/0.96)] to-[oklch(0.19_0.035_15/0.96)] shadow-2xl shadow-black/60 backdrop-blur-md transition-[opacity,scale] duration-300 data-[open=false]:pointer-events-none data-[open=false]:scale-95 data-[open=false]:opacity-0 data-[side=left]:origin-right data-[side=right]:origin-left"
    >
      <header className="flex items-center justify-between border-b border-white/8 px-4 py-3">
        <div>
          <p className="text-sm font-bold text-brand">Will Doo</p>
          <p className="text-xs text-muted-foreground">Experto en el Publicador de subdominios</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar chat"
          className="grid size-8 place-content-center rounded-full text-muted-foreground transition-colors hover:bg-brand/10 hover:text-brand"
        >
          <XIcon className="size-4" />
        </button>
      </header>

      <div ref={list} className="flex-1 space-y-3 overflow-y-auto px-4 py-3" aria-live="polite">
        {messages.map((m, i) => (
          <p
            key={i}
            className={cn(
              'max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-snug whitespace-pre-line',
              m.from === 'bot' ? 'rounded-tl-sm bg-white/7' : 'ml-auto rounded-tr-sm bg-brand text-primary-foreground',
            )}
          >
            {m.text}
          </p>
        ))}
        {typing && (
          <p className="flex w-fit gap-1 rounded-2xl rounded-tl-sm bg-white/7 px-3 py-3" aria-label="Will Doo está escribiendo">
            {[0, 1, 2].map((d) => (
              <span key={d} className="size-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: `${d * 120}ms` }} />
            ))}
          </p>
        )}
        {!typing && last.from === 'bot' && last.follow && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {last.follow.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => ask(f)}
                className="rounded-full border border-brand/35 px-2.5 py-1 text-left text-xs text-foreground/90 transition-colors hover:border-brand hover:bg-brand/12"
              >
                {f}
              </button>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={submit} className="flex items-center gap-2 border-t border-white/8 p-2.5">
        <input
          ref={input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Pregúntale a Will Doo…"
          aria-label="Tu pregunta"
          className="h-9 flex-1 rounded-full border border-input bg-background/40 px-3.5 text-sm outline-none placeholder:text-muted-foreground focus:border-brand/60"
        />
        <button
          type="submit"
          aria-label="Enviar"
          disabled={!draft.trim() || typing}
          className="grid size-9 place-content-center rounded-full bg-brand text-primary-foreground transition-opacity disabled:opacity-40"
        >
          <SendHorizonalIcon className="size-4" />
        </button>
      </form>
    </div>
  )
}
