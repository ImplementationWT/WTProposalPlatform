import { useQuery } from '@tanstack/react-query'
import { CopyIcon, DownloadIcon, MonitorIcon, SmartphoneIcon, TabletIcon } from 'lucide-react'
import { QRCodeCanvas } from 'qrcode.react'
import { useMemo, useRef, useState } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { api, type Project } from '@/lib/api'
import { cn } from '@/lib/utils'

interface DialogProps {
  project: Project
  onClose: () => void
}

type MetricKey = 'visits' | 'people' | 'views'

const METRICS: { key: MetricKey; label: string; hint: string }[] = [
  { key: 'people', label: 'Personas únicas', hint: 'Dispositivos distintos que lo abrieron' },
  { key: 'visits', label: 'Visitas', hint: 'Veces que lo abrieron (recargas seguidas cuentan una)' },
  { key: 'views', label: 'Páginas vistas', hint: 'Cada página cargada, incluidas las recargas' },
]

const chartConfig = {
  visits: { label: 'Visitas', color: 'var(--primary)' },
  people: { label: 'Personas únicas', color: 'var(--primary)' },
  views: { label: 'Páginas vistas', color: 'var(--primary)' },
} satisfies ChartConfig
const dayLabel = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const timeLabel = new Intl.DateTimeFormat('es', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const relative = new Intl.RelativeTimeFormat('es', { numeric: 'auto' })

function ago(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 60) return relative.format(-minutes, 'minute')
  if (minutes < 60 * 24) return relative.format(-Math.round(minutes / 60), 'hour')
  return relative.format(-Math.round(minutes / 1440), 'day')
}

// Friendly names for the hosts visitors most often arrive from.
const SOURCES: [RegExp, string][] = [
  [/whatsapp/, 'WhatsApp'],
  [/(^|\.)(l|lm|m)?\.?facebook\.com$|fb\.me/, 'Facebook'],
  [/instagram/, 'Instagram'],
  [/linkedin|lnkd\.in/, 'LinkedIn'],
  [/^t\.co$|twitter|x\.com/, 'X'],
  [/slack/, 'Slack'],
  [/teams\.microsoft|teams\.live/, 'Teams'],
  [/mail\.google/, 'Gmail'],
  [/outlook|office\.com|live\.com/, 'Outlook'],
  [/(^|\.)google\./, 'Google'],
]
const sourceName = (host: string | null) => (host ? (SOURCES.find(([re]) => re.test(host))?.[1] ?? host) : 'Directo')

const DEVICE_ICON = { mobile: SmartphoneIcon, tablet: TabletIcon, desktop: MonitorIcon }

export function StatsDialog({ project, onClose }: DialogProps) {
  const [days, setDays] = useState(30)
  const [metric, setMetric] = useState<MetricKey>('visits')
  const stats = useQuery({ queryKey: ['stats', project.id, days], queryFn: () => api.stats(project.id, days) })
  const data = stats.data?.series.map((d) => ({ ...d, label: dayLabel.format(new Date(`${d.day}T00:00:00Z`)) }))

  // Number visitors in order of first appearance, and each of their visits, so returning people stand out.
  const log = useMemo(() => {
    const entries = stats.data?.log ?? []
    const number = new Map<string, number>()
    const seen = new Map<string, number>()
    const chronological = [...entries].reverse().map((v) => {
      if (!number.has(v.visitor)) number.set(v.visitor, number.size + 1)
      seen.set(v.visitor, (seen.get(v.visitor) ?? 0) + 1)
      return { ...v, person: number.get(v.visitor)!, nth: seen.get(v.visitor)! }
    })
    return chronological.reverse()
  }, [stats.data])

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Estadísticas</DialogTitle>
          <DialogDescription>{project.url.replace(/^https?:\/\//, '')} · visitas de personas reales</DialogDescription>
        </DialogHeader>

        <div className="flex justify-end">
          <div className="flex rounded-full border p-0.5">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={cn('rounded-full px-3 py-1 text-sm transition-colors', d === days ? 'bg-brand/15 font-medium text-brand' : 'text-muted-foreground hover:text-foreground')}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {/* The three metrics double as the chart's switch */}
        <div className="grid gap-2 sm:grid-cols-3" role="tablist" aria-label="Métrica del gráfico">
          {METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              role="tab"
              aria-selected={metric === m.key}
              onClick={() => setMetric(m.key)}
              className={cn(
                'rounded-xl border p-3 text-left transition-colors',
                metric === m.key ? 'border-brand/50 bg-brand/[0.08]' : 'hover:border-brand/30 hover:bg-brand/[0.04]',
              )}
            >
              <p className="text-xs text-muted-foreground">{m.label}</p>
              <p className="text-3xl font-semibold tabular-nums">{stats.data?.period[m.key] ?? '–'}</p>
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                {m.key === 'visits' ? m.hint : `Histórico: ${stats.data?.allTime[m.key] ?? '–'} · ${m.hint.toLowerCase()}`}
              </p>
            </button>
          ))}
        </div>

        {data ? (
          <ChartContainer config={chartConfig} className="h-52 w-full">
            <BarChart data={data} margin={{ left: -20, right: 4, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={48} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <Bar dataKey={metric} fill={`var(--color-${metric})`} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        ) : (
          <Skeleton className="h-52 w-full" />
        )}

        <section>
          <h3 className="mb-2 text-sm font-semibold">Registro de visitas</h3>
          {stats.data && log.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Aún no hay visitas de personas reales en este periodo.</p>}
          <ul className="max-h-64 divide-y divide-border/60 overflow-y-auto rounded-xl border">
            {log.map((v) => {
              const Icon = DEVICE_ICON[v.device]
              const minutes = Math.round((new Date(v.end).getTime() - new Date(v.start).getTime()) / 60_000)
              return (
                <li key={`${v.visitor}-${v.start}`} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                  <span
                    className="grid size-8 shrink-0 place-content-center rounded-full text-xs font-bold text-white"
                    style={{ background: `oklch(0.6 0.16 ${(v.person * 67) % 360})` }}
                    aria-hidden
                  >
                    {v.person}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      Visitante {v.person}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">{v.nth === 1 ? '1.ª visita' : `${v.nth}.ª visita · volvió`}</span>
                    </p>
                    <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                      <Icon className="size-3.5" />
                      {v.os} · {v.browser} · desde {sourceName(v.referrer)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-xs text-muted-foreground">
                    <p className="text-foreground" title={timeLabel.format(new Date(v.start))}>
                      {ago(v.start)}
                    </p>
                    <p>
                      {v.pages} {v.pages === 1 ? 'página' : 'páginas'}
                      {minutes >= 1 && ` · ${minutes} min`}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>

        <p className="text-[11px] leading-snug text-muted-foreground">
          No se cuentan bots, vistas previas de enlaces (WhatsApp, Slack, Teams…) ni las visitas del equipo. «Persona» es el mismo dispositivo y
          red, así que es una buena aproximación, no una identificación.
        </p>
      </DialogContent>
    </Dialog>
  )
}

export function QrDialog({ project, onClose }: DialogProps) {
  const wrapper = useRef<HTMLDivElement>(null)

  const download = () => {
    const canvas = wrapper.current?.querySelector('canvas')
    if (!canvas) return
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = `${project.name}-qr.png`
    a.click()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader className="items-center text-center">
          <DialogTitle className="text-xl">Código QR</DialogTitle>
          <DialogDescription className="break-all">{project.url.replace(/^https?:\/\//, '')}</DialogDescription>
        </DialogHeader>
        <div ref={wrapper} className="mx-auto rounded-xl bg-white p-4">
          <QRCodeCanvas value={project.url} size={480} marginSize={1} className="size-56!" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(project.url)
              toast.success('Enlace copiado')
            }}
          >
            <CopyIcon /> Copiar enlace
          </Button>
          <Button onClick={download}>
            <DownloadIcon /> Descargar PNG
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
