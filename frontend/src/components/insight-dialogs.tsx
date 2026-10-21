import { useQuery } from '@tanstack/react-query'
import { CopyIcon, DownloadIcon } from 'lucide-react'
import { QRCodeCanvas } from 'qrcode.react'
import { useRef, useState } from 'react'
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

const chartConfig = { count: { label: 'Visitas', color: 'var(--primary)' } } satisfies ChartConfig
const dayLabel = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', timeZone: 'UTC' })

export function StatsDialog({ project, onClose }: DialogProps) {
  const [days, setDays] = useState(30)
  const stats = useQuery({ queryKey: ['stats', project.id, days], queryFn: () => api.stats(project.id, days) })
  const data = stats.data?.series.map((d) => ({ ...d, label: dayLabel.format(new Date(`${d.day}T00:00:00Z`)) }))

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Estadísticas</DialogTitle>
          <DialogDescription>{project.url.replace(/^https?:\/\//, '')} · visitas a páginas HTML</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex gap-8">
            <Metric label={`Últimos ${days} días`} value={stats.data?.periodTotal} />
            <Metric label="Total histórico" value={stats.data?.allTime} />
          </div>
          <div className="flex rounded-lg border p-0.5">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={cn('rounded-md px-3 py-1 text-sm', d === days ? 'bg-muted font-medium' : 'text-muted-foreground')}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {data ? (
          <ChartContainer config={chartConfig} className="h-64 w-full">
            <BarChart data={data} margin={{ left: -20, right: 4, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={48} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        ) : (
          <Skeleton className="h-64 w-full" />
        )}
      </DialogContent>
    </Dialog>
  )
}

function Metric({ label, value }: { label: string; value?: number }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-3xl font-semibold tabular-nums">{value ?? '–'}</p>
    </div>
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
