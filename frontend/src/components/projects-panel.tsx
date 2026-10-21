import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  BarChart3Icon,
  ChevronDownIcon,
  CloudUploadIcon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FileCodeIcon,
  Loader2Icon,
  LockIcon,
  MoreHorizontalIcon,
  PencilLineIcon,
  QrCodeIcon,
  SearchIcon,
  SettingsIcon,
  Trash2Icon,
  UndoIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { QrDialog, StatsDialog } from '@/components/lazy'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { CustomizeDialog, EditHtmlDialog, UpdateChooser, UpdateFilesDialog, type UpdateView } from '@/components/update-dialogs'
import { api, type Project, type ProjectStatus } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { useDebounced } from '@/lib/hooks'
import { cn } from '@/lib/utils'

type ActiveDialog = { project: Project; view: 'chooser' | UpdateView | 'stats' | 'qr' | 'purge' }

const TITLES: Record<ProjectStatus, string> = { live: 'Proyectos activos', archived: 'Archivados', deleted: 'Papelera' }

export function ProjectsPanel({ onUpload }: { onUpload: (mode: 'file' | 'code') => void }) {
  const [status, setStatus] = useState<ProjectStatus>('live')
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim(), 250)
  const [active, setActive] = useState<ActiveDialog | null>(null)
  const queryClient = useQueryClient()

  const list = useQuery({
    queryKey: ['projects', status, q],
    queryFn: () => api.list(status, q),
    placeholderData: keepPreviousData,
    // Until every new subdomain has its certificate.
    refetchInterval: (query) => (query.state.data?.items.some((p) => p.domain === 'pending') ? 3000 : false),
  })
  const counts = list.data?.counts

  const changeStatus = useMutation({
    mutationFn: ({ id, to }: { id: string; to: ProjectStatus; message: string }) => api.setStatus(id, to),
    onSuccess: (_, { message }) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast.success(message)
    },
    onError: (err) => toast.error(err.message),
  })

  const purge = useMutation({
    mutationFn: (id: string) => api.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast.success('Proyecto eliminado definitivamente')
      setActive(null)
    },
    onError: (err) => toast.error(err.message),
  })

  const open = (project: Project, view: ActiveDialog['view']) => setActive({ project, view })
  const close = () => setActive(null)

  return (
    <section>
      {/* Folder-style tabs: active projects on the left, archive and trash on the right */}
      <div className="flex items-end justify-between px-1">
        <FolderTab active={status === 'live'} onClick={() => setStatus('live')}>
          Todos <CountPill n={counts?.live} />
        </FolderTab>
        <div className="flex gap-1 pb-1">
          <ViewIcon label={`Archivados (${counts?.archived ?? 0})`} active={status === 'archived'} onClick={() => setStatus('archived')}>
            <ArchiveIcon />
          </ViewIcon>
          <ViewIcon label={`Papelera (${counts?.deleted ?? 0})`} active={status === 'deleted'} onClick={() => setStatus('deleted')}>
            <Trash2Icon />
          </ViewIcon>
        </div>
      </div>

      <div className={cn('rounded-2xl border bg-card p-4 shadow-xs sm:p-8', status === 'live' && 'rounded-tl-none')}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-2xl font-medium">{TITLES[status]}</h2>
          {status === 'live' && (
            <div className="flex">
              <Button onClick={() => onUpload('file')} className="h-10 rounded-r-none px-4 text-[15px]">
                <CloudUploadIcon className="size-5" /> Subir archivo
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="h-10 rounded-l-none border-l border-white/30 px-2" aria-label="Más opciones de publicación">
                    <ChevronDownIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onUpload('file')}>
                    <CloudUploadIcon /> Subir .zip o archivo
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onUpload('code')}>
                    <FileCodeIcon /> Pegar código HTML
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        <label className="mt-6 flex max-w-md items-center gap-2 border-b pb-2 text-muted-foreground focus-within:border-primary">
          <SearchIcon className="size-4" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar…"
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>

        <div className="mt-6 overflow-hidden rounded-xl">
          <Table>
            <TableHeader className="bg-muted/60">
              <TableRow className="border-0 hover:bg-transparent">
                <TableHead className="h-12 w-24 pl-4 text-xs">Estado</TableHead>
                <TableHead className="text-xs">Proyecto</TableHead>
                <TableHead className="hidden w-32 text-xs md:table-cell">{status === 'deleted' ? 'Eliminado' : 'Modificado'}</TableHead>
                <TableHead className="w-12 pr-4 text-right text-xs sm:w-56 sm:text-center">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading &&
                Array.from({ length: 4 }, (_, i) => (
                  <TableRow key={i} className="border-0">
                    <TableCell colSpan={4} className="py-4">
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))}
              {list.data?.items.map((project) => (
                <TableRow key={project.id} className="h-[75px] border-0 even:bg-muted/40">
                  <TableCell className="pl-4">
                    <StatusBadge project={project} />
                  </TableCell>
                  <TableCell className="max-w-0">
                    <a
                      href={project.status === 'live' ? project.url : undefined}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(
                        'flex items-center gap-2 truncate text-[15px]',
                        project.status === 'live' ? 'text-primary underline underline-offset-2' : 'text-muted-foreground',
                      )}
                    >
                      <FileCodeIcon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{project.url.replace(/^https?:\/\//, '')}</span>
                    </a>
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                    {formatDate(project.deletedAt ?? project.updatedAt)}
                  </TableCell>
                  <TableCell className="pr-4">
                    <div className="flex items-center justify-end gap-1 sm:justify-center">
                      {status !== 'deleted' && (
                        <>
                          <Button variant="ghost" className="hidden sm:inline-flex" onClick={() => open(project, 'chooser')}>
                            <PencilLineIcon className="size-5" /> Actualizar
                          </Button>
                          <IconAction label="Estadísticas" onClick={() => open(project, 'stats')}>
                            <BarChart3Icon />
                          </IconAction>
                          <IconAction label="Código QR" onClick={() => open(project, 'qr')}>
                            <QrCodeIcon />
                          </IconAction>
                        </>
                      )}
                      <RowMenu
                        project={project}
                        onOpen={(view) => open(project, view)}
                        onStatus={(to, message) => changeStatus.mutate({ id: project.id, to, message })}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {list.data?.items.length === 0 && <EmptyState status={status} searching={!!q} onUpload={() => onUpload('file')} />}
          {list.isError && <p className="py-10 text-center text-sm text-destructive">{list.error.message}</p>}
        </div>
      </div>

      {active?.view === 'chooser' && <UpdateChooser project={active.project} onClose={close} onPick={(view) => open(active.project, view)} />}
      {active?.view === 'files' && <UpdateFilesDialog project={active.project} onClose={close} />}
      {active?.view === 'customize' && <CustomizeDialog project={active.project} onClose={close} />}
      {active?.view === 'edit' && <EditHtmlDialog project={active.project} onClose={close} />}
      {active?.view === 'stats' && <StatsDialog project={active.project} onClose={close} />}
      {active?.view === 'qr' && <QrDialog project={active.project} onClose={close} />}
      <AlertDialog open={active?.view === 'purge'} onOpenChange={(o) => !o && close()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar definitivamente?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borrarán los archivos y estadísticas de <b>{active?.project.name}</b> y el nombre quedará libre. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={purge.isPending}
              onClick={(e) => {
                e.preventDefault()
                if (active) purge.mutate(active.project.id)
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

function RowMenu({
  project,
  onOpen,
  onStatus,
}: {
  project: Project
  onOpen: (view: ActiveDialog['view']) => void
  onStatus: (to: ProjectStatus, message: string) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Más acciones">
          <MoreHorizontalIcon className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {project.status === 'deleted' ? (
          <>
            <DropdownMenuItem onClick={() => onStatus('live', 'Proyecto restaurado')}>
              <UndoIcon /> Restaurar
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => onOpen('purge')}>
              <Trash2Icon /> Eliminar definitivamente
            </DropdownMenuItem>
          </>
        ) : (
          <>
            {project.status === 'live' && (
              <DropdownMenuItem asChild>
                <a href={project.url} target="_blank" rel="noreferrer">
                  <ExternalLinkIcon /> Abrir sitio
                </a>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => {
                navigator.clipboard.writeText(project.url)
                toast.success('Enlace copiado')
              }}
            >
              <CopyIcon /> Copiar enlace
            </DropdownMenuItem>
            <DropdownMenuItem className="sm:hidden" onClick={() => onOpen('chooser')}>
              <PencilLineIcon /> Actualizar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onOpen('customize')}>
              <SettingsIcon /> Personalizar
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={api.downloadUrl(project.id)} download>
                <DownloadIcon /> Descargar .zip
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {project.status === 'live' ? (
              <DropdownMenuItem onClick={() => onStatus('archived', 'Proyecto archivado: el sitio ya no es accesible')}>
                <ArchiveIcon /> Archivar
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => onStatus('live', 'Proyecto publicado de nuevo')}>
                <ArchiveRestoreIcon /> Desarchivar
              </DropdownMenuItem>
            )}
            <DropdownMenuItem variant="destructive" onClick={() => onStatus('deleted', 'Movido a la papelera')}>
              <Trash2Icon /> Mover a la papelera
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function StatusBadge({ project }: { project: Project }) {
  if (project.status !== 'live') {
    return (
      <Badge variant="secondary" className="text-[11px]">
        {project.status === 'archived' ? 'Archivado' : 'Eliminado'}
      </Badge>
    )
  }
  if (project.domain === 'pending') {
    return (
      <Badge variant="secondary" className="gap-1 text-[11px]" title="Emitiendo el certificado HTTPS del subdominio">
        <Loader2Icon className="size-3 animate-spin" />
        Publicando
      </Badge>
    )
  }
  if (project.domain === 'error') {
    return (
      <Badge variant="destructive" className="text-[11px]" title="No se pudo activar el subdominio. Se reintenta al reiniciar el servidor o al restaurar el proyecto.">
        Error HTTPS
      </Badge>
    )
  }
  const locked = project.access.mode === 'password'
  return (
    <Badge
      className={cn(
        'gap-1 text-[11px]',
        locked
          ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
          : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300',
      )}
    >
      {locked ? <LockIcon className="size-3" /> : <span className="size-1.5 rounded-full bg-current" />}
      {locked ? 'Privado' : 'Público'}
    </Badge>
  )
}

function FolderTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative -mb-px flex items-center gap-2 rounded-t-xl border border-b-0 px-5 py-2.5 text-sm',
        active ? 'z-10 bg-card' : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

const CountPill = ({ n }: { n?: number }) => (
  <span className="rounded-md bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{n ?? '·'}</span>
)

function ViewIcon({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} onClick={onClick} className={cn('text-muted-foreground', active && 'bg-muted text-foreground')}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} onClick={onClick} className="[&_svg:not([class*='size-'])]:size-5">
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function EmptyState({ status, searching, onUpload }: { status: ProjectStatus; searching: boolean; onUpload: () => void }) {
  if (searching) return <p className="py-16 text-center text-sm text-muted-foreground">Ningún proyecto coincide con la búsqueda.</p>
  if (status === 'archived') return <p className="py-16 text-center text-sm text-muted-foreground">No hay proyectos archivados.</p>
  if (status === 'deleted') return <p className="py-16 text-center text-sm text-muted-foreground">La papelera está vacía.</p>
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <CloudUploadIcon className="size-10 text-muted-foreground" strokeWidth={1.5} />
      <p className="text-sm text-muted-foreground">Aún no has publicado nada. Sube un .zip o un archivo HTML.</p>
      <Button onClick={onUpload}>Publicar mi primer sitio</Button>
    </div>
  )
}
