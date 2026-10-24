import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  BarChart3Icon,
  CheckIcon,
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
  XIcon,
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
import { Checkbox } from '@/components/ui/checkbox'
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
import { BulkUpdateDialog, CustomizeDialog, EditHtmlDialog, UpdateChooser, UpdateFilesDialog, type UpdateView } from '@/components/update-dialogs'
import { api, type Project, type ProjectStatus } from '@/lib/api'
import { formatDate } from '@/lib/format'
import { useDebounced, useOpenSite } from '@/lib/hooks'
import { cn } from '@/lib/utils'

type ActiveDialog = { project: Project; view: 'chooser' | UpdateView | 'stats' | 'qr' | 'purge' }

const TITLES: Record<ProjectStatus, string> = { live: 'Proyectos activos', archived: 'Archivados', deleted: 'Papelera' }

const NO_SELECTION = new Set<string>()

/** "1 proyecto archivado" / "3 proyectos archivados" */
const countLabel = (n: number, done: string) => (n === 1 ? `1 proyecto ${done}` : `${n} proyectos ${done.replace(/^(\S+)/, '$1s')}`)

export function ProjectsPanel({ onUpload }: { onUpload: (mode: 'file' | 'code') => void }) {
  const [status, setStatus] = useState<ProjectStatus>('live')
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim(), 250)
  const [active, setActive] = useState<ActiveDialog | null>(null)
  const openSite = useOpenSite()
  const [bulkDialog, setBulkDialog] = useState<'update' | 'purge' | null>(null)
  const queryClient = useQueryClient()

  const list = useQuery({
    queryKey: ['projects', status, q],
    queryFn: () => api.list(status, q),
    placeholderData: keepPreviousData,
    // Until every new subdomain has its certificate.
    refetchInterval: (query) => (query.state.data?.items.some((p) => p.domain === 'pending') ? 3000 : false),
  })
  const counts = list.data?.counts
  const items = list.data?.items ?? []

  // A selection belongs to one view: switching tab or search starts over.
  const scope = `${status}:${q}`
  const [selection, setSelection] = useState({ scope, ids: NO_SELECTION })
  const selectedIds = selection.scope === scope ? selection.ids : NO_SELECTION
  const selected = items.filter((p) => selectedIds.has(p.id))
  const allSelected = items.length > 0 && selected.length === items.length
  const clearSelection = () => setSelection({ scope, ids: NO_SELECTION })
  const toggle = (id: string, on: boolean) => {
    const ids = new Set(selectedIds)
    if (on) ids.add(id)
    else ids.delete(id)
    setSelection({ scope, ids })
  }
  const toggleAll = (on: boolean) => setSelection({ scope, ids: on ? new Set(items.map((p) => p.id)) : NO_SELECTION })

  const bulk = useMutation({
    mutationFn: async ({ ids, run }: { ids: string[]; run: (id: string) => Promise<unknown>; done: string }) => {
      const results = await Promise.allSettled(ids.map(run))
      return results.filter((r) => r.status === 'rejected').length
    },
    onSuccess: (failed, { ids, done }) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      clearSelection()
      setBulkDialog(null)
      if (failed) toast.error(`${failed} de ${ids.length} proyectos no se pudieron procesar`)
      else toast.success(countLabel(ids.length, done))
    },
  })
  const bulkStatus = (to: ProjectStatus, done: string) =>
    bulk.mutate({ ids: selected.map((p) => p.id), run: (id) => api.setStatus(id, to), done })

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
    <section data-surface>
      {/* Folder-style tabs: active projects on the left, archive and trash on the right */}
      <div className="flex items-end justify-between px-1">
        <FolderTab active={status === 'live'} onClick={() => setStatus('live')}>
          Todos <CountPill n={counts?.live} />
        </FolderTab>
        {/* Glass pill so the icons hold up against the nebula drifting behind them */}
        <div className="mb-1.5 flex gap-0.5 rounded-full border bg-card p-1 shadow-lg shadow-black/40 backdrop-blur-md">
          <ViewIcon label={`Archivados (${counts?.archived ?? 0})`} active={status === 'archived'} onClick={() => setStatus('archived')}>
            <ArchiveIcon />
          </ViewIcon>
          <ViewIcon label={`Papelera (${counts?.deleted ?? 0})`} active={status === 'deleted'} onClick={() => setStatus('deleted')}>
            <Trash2Icon />
          </ViewIcon>
        </div>
      </div>

      <div className={cn('rounded-3xl border bg-card p-4 shadow-2xl shadow-black/30 backdrop-blur sm:p-8', status === 'live' && 'rounded-tl-none')}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-2xl font-bold tracking-tight">{TITLES[status]}</h2>
          {status === 'live' && (
            // Thin coral capsule around the split button: the page's main action, highlighted without a glow.
            <div className="flex rounded-full bg-brand/[0.08] p-1 ring-1 ring-brand/40">
              <Button variant="scan" onClick={() => onUpload('file')} className="h-10 rounded-r-none pr-3 pl-5 text-[15px]">
                <CloudUploadIcon className="size-5" /> Subir archivo
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="scan" className="h-10 rounded-l-none border-l border-white/30 pr-3 pl-2 after:hidden" aria-label="Más opciones de publicación">
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

        <label className="mt-6 flex h-10 max-w-md items-center gap-2 rounded-full border bg-background/50 px-4 text-muted-foreground transition-colors focus-within:border-primary">
          <SearchIcon className="size-4" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar…"
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>

        <div className="mt-6 overflow-hidden rounded-2xl border">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="border-0 hover:bg-transparent">
                <TableHead className="h-11 w-11 pr-0 pl-4">
                  <Checkbox
                    aria-label="Seleccionar todos"
                    disabled={items.length === 0}
                    checked={allSelected ? true : selected.length > 0 ? 'indeterminate' : false}
                    onCheckedChange={(c) => toggleAll(c === true)}
                  />
                </TableHead>
                <TableHead className="h-11 w-24 font-mono text-[11px] tracking-widest text-muted-foreground uppercase">Estado</TableHead>
                <TableHead className="font-mono text-[11px] tracking-widest text-muted-foreground uppercase">Proyecto</TableHead>
                <TableHead className="hidden w-32 font-mono text-[11px] tracking-widest text-muted-foreground uppercase md:table-cell">{status === 'deleted' ? 'Eliminado' : 'Modificado'}</TableHead>
                <TableHead className="w-12 pr-4 text-right font-mono text-[11px] tracking-widest text-muted-foreground uppercase sm:w-72 sm:text-center">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading &&
                Array.from({ length: 4 }, (_, i) => (
                  <TableRow key={i} className="border-0">
                    <TableCell colSpan={5} className="py-4">
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  </TableRow>
                ))}
              {items.map((project) => (
                <TableRow
                  key={project.id}
                  data-state={selectedIds.has(project.id) ? 'selected' : undefined}
                  className="h-[75px] border-t border-border/60 transition-[background-color,box-shadow] hover:bg-transparent hover:bg-linear-to-r hover:from-brand/[0.09] hover:to-transparent hover:shadow-[inset_2px_0_0_var(--brand)] data-[state=selected]:bg-brand/[0.07] data-[state=selected]:shadow-[inset_2px_0_0_var(--brand)]"
                >
                  <TableCell className="pr-0 pl-4">
                    <Checkbox
                      aria-label={`Seleccionar ${project.name}`}
                      checked={selectedIds.has(project.id)}
                      onCheckedChange={(c) => toggle(project.id, c === true)}
                    />
                  </TableCell>
                  <TableCell>
                    <StatusBadge project={project} />
                  </TableCell>
                  <TableCell className="max-w-0">
                    <a
                      href={project.status === 'live' ? project.url : undefined}
                      onClick={project.status === 'live' ? openSite(project.url) : undefined}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(
                        'flex items-center gap-2 truncate text-[15px]',
                        project.status === 'live' ? 'group/link text-foreground underline decoration-brand/50 underline-offset-4 transition-colors hover:text-brand hover:decoration-brand' : 'text-muted-foreground',
                      )}
                    >
                      <FileCodeIcon className="size-4 shrink-0 text-muted-foreground transition-colors group-hover/link:text-brand" />
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
                          <CopyLinkAction url={project.url} />
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

      {selected.length > 0 && (
        <BulkBar count={selected.length} onClear={clearSelection} busy={bulk.isPending}>
          {status === 'live' && (
            <Button variant="ghost" size="sm" onClick={() => setBulkDialog('update')}>
              <PencilLineIcon /> Actualizar
            </Button>
          )}
          {status === 'live' && (
            <Button variant="ghost" size="sm" onClick={() => bulkStatus('archived', 'archivado')}>
              <ArchiveIcon /> Archivar
            </Button>
          )}
          {status === 'archived' && (
            <Button variant="ghost" size="sm" onClick={() => bulkStatus('live', 'publicado')}>
              <ArchiveRestoreIcon /> Desarchivar
            </Button>
          )}
          {status === 'deleted' ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => bulkStatus('live', 'restaurado')}>
                <UndoIcon /> Restaurar
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setBulkDialog('purge')}>
                <Trash2Icon /> Eliminar definitivamente
              </Button>
            </>
          ) : (
            <Button variant="destructive" size="sm" onClick={() => bulkStatus('deleted', 'movido a la papelera')}>
              <Trash2Icon /> Papelera
            </Button>
          )}
        </BulkBar>
      )}
      {bulkDialog === 'update' && (
        <BulkUpdateDialog
          projects={selected}
          onClose={() => setBulkDialog(null)}
          onDone={() => {
            clearSelection()
            setBulkDialog(null)
          }}
        />
      )}
      <AlertDialog open={bulkDialog === 'purge'} onOpenChange={(o) => !o && setBulkDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {selected.length} proyectos definitivamente?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borrarán sus archivos y estadísticas y los nombres quedarán libres. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={bulk.isPending}
              onClick={(e) => {
                e.preventDefault()
                bulk.mutate({ ids: selected.map((p) => p.id), run: api.remove, done: 'eliminado' })
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
  const openSite = useOpenSite()
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
                <a href={project.url} onClick={openSite(project.url)} target="_blank" rel="noreferrer">
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

/** Floating glass bar with the actions for the selected rows. */
function BulkBar({ count, busy, onClear, children }: { count: number; busy: boolean; onClear: () => void; children: ReactNode }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
      <div
        role="toolbar"
        aria-label="Acciones para los proyectos seleccionados"
        className="pointer-events-auto flex animate-in items-center gap-1 rounded-full border border-brand/30 bg-popover/90 p-1.5 pl-3 shadow-2xl shadow-black/60 backdrop-blur-md duration-300 fade-in slide-in-from-bottom-4"
      >
        <span className="mr-1 flex items-center gap-2 text-sm font-medium whitespace-nowrap">
          {busy ? (
            <Loader2Icon className="size-5 animate-spin text-brand" />
          ) : (
            <span className="grid size-6 place-content-center rounded-full bg-brand text-xs font-bold tabular-nums text-primary-foreground">{count}</span>
          )}
          <span className="hidden sm:inline">{count === 1 ? 'seleccionado' : 'seleccionados'}</span>
        </span>
        <span className="mx-1 h-5 w-px bg-border" />
        <fieldset disabled={busy} className="contents">
          {children}
        </fieldset>
        <IconAction label="Quitar selección" onClick={onClear}>
          <XIcon />
        </IconAction>
      </div>
    </div>
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
        'relative -mb-px flex items-center gap-2 rounded-t-2xl border border-b-0 px-5 py-2.5 text-sm font-medium',
        active ? 'z-10 bg-card backdrop-blur' : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

const CountPill = ({ n }: { n?: number }) => (
  <span className="rounded-full bg-brand/15 px-2 py-0.5 text-xs font-semibold tabular-nums text-brand">{n ?? '·'}</span>
)

function ViewIcon({ label, active, onClick, children }: { label: string; active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} onClick={onClick} className={cn('text-foreground/75 hover:text-foreground', active && 'bg-brand/15 text-brand hover:bg-brand/20 hover:text-brand')}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** Copies the site's link; the icon turns into a check for a moment as confirmation. */
function CopyLinkAction({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      toast.error('No se pudo copiar el enlace')
      return
    }
    toast.success('Enlace copiado')
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <IconAction label={copied ? '¡Copiado!' : 'Copiar enlace'} onClick={copy}>
      {copied ? <CheckIcon className="text-emerald-400" /> : <CopyIcon />}
    </IconAction>
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
      <CloudUploadIcon className="size-10 text-brand" strokeWidth={1.5} />
      <p className="text-sm text-muted-foreground">Aún no has publicado nada. Sube un .zip o un archivo HTML.</p>
      <Button onClick={onUpload} className="mt-2 h-10 px-5 font-semibold">Publicar mi primer sitio</Button>
    </div>
  )
}
