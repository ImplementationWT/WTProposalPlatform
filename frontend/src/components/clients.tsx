import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CheckIcon,
  ChevronRightIcon,
  FolderIcon,
  FolderInputIcon,
  FolderOpenIcon,
  FolderPlusIcon,
  MoreHorizontalIcon,
  PencilLineIcon,
  Trash2Icon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
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
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import { api, type ClientFilter, type ClientRef, type ProjectStatus } from '@/lib/api'
import { useClients } from '@/lib/hooks'
import { cn } from '@/lib/utils'

/** Refreshes everything that shows a client: the folders, their counts and the project rows. */
function useRefreshClients() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: ['clients'] })
    queryClient.invalidateQueries({ queryKey: ['projects'] })
  }
}

/**
 * The panel's home: one folder per client (plus "Sin cliente" when some project has none) instead
 * of every link, so the list stays short however many sites there are. A click opens the folder.
 */
export function ClientFolders({ status, onOpen }: { status: ProjectStatus; onOpen: (client: ClientFilter) => void }) {
  const clients = useClients()
  if (clients.isLoading) {
    return (
      <div className="divide-y divide-border/60">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="px-4 py-4">
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </div>
    )
  }
  if (clients.isError) return <p className="py-10 text-center text-sm text-destructive">{clients.error.message}</p>

  const items = clients.data?.items ?? []
  const none = clients.data?.none[status] ?? 0
  const label = (n: number) => (n === 1 ? '1 enlace' : `${n} enlaces`)

  return (
    <ul className="divide-y divide-border/60">
      {items.map((c) => (
        <FolderRow
          key={c.id}
          name={c.name}
          detail={label(c.counts[status])}
          empty={c.counts[status] === 0}
          onOpen={() => onOpen(c.id)}
          menu={<ClientMenu client={c} />}
        />
      ))}
      {none > 0 && <FolderRow name="Sin cliente" detail={label(none)} muted onOpen={() => onOpen('none')} />}
      {items.length === 0 && none === 0 && (
        <li className="py-16 text-center text-sm text-muted-foreground">Aún no hay clientes. Crea el primero con «Nuevo cliente».</li>
      )}
    </ul>
  )
}

function FolderRow({
  name,
  detail,
  empty,
  muted,
  onOpen,
  menu,
}: {
  name: string
  detail: string
  empty?: boolean
  muted?: boolean
  onOpen: () => void
  menu?: ReactNode
}) {
  return (
    <li className="group flex h-[75px] items-center gap-2 pr-4 transition-[background-color,box-shadow] hover:bg-linear-to-r hover:from-brand/[0.09] hover:to-transparent hover:shadow-[inset_2px_0_0_var(--brand)]">
      <button type="button" onClick={onOpen} className="flex h-full min-w-0 flex-1 items-center gap-4 pl-5 text-left">
        <span
          className={cn(
            'grid size-10 shrink-0 place-content-center rounded-xl',
            muted ? 'bg-muted text-muted-foreground' : 'bg-brand/12 text-brand',
          )}
        >
          <FolderIcon className="size-5 group-hover:hidden" />
          <FolderOpenIcon className="hidden size-5 group-hover:block" />
        </span>
        <span className="min-w-0">
          <span className={cn('block truncate text-[15px] font-medium', muted && 'text-muted-foreground')}>{name}</span>
          <span className={cn('block text-xs', empty ? 'text-muted-foreground/60' : 'text-muted-foreground')}>{detail}</span>
        </span>
        <ChevronRightIcon className="ml-auto size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
      </button>
      {menu ?? <span className="size-9" />}
    </li>
  )
}

/** Rename / delete a client; used on its folder row and in the open folder's header. */
export function ClientMenu({ client, onRemoved }: { client: ClientRef; onRemoved?: () => void }) {
  const [renaming, setRenaming] = useState(false)
  const [removing, setRemoving] = useState(false)
  const refresh = useRefreshClients()

  const remove = useMutation({
    mutationFn: () => api.removeClient(client.id),
    onSuccess: () => {
      refresh()
      setRemoving(false)
      onRemoved?.()
      toast.success('Cliente eliminado; sus proyectos pasaron a «Sin cliente»')
    },
    onError: (err) => toast.error(err.message),
  })

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Opciones de ${client.name}`}>
            <MoreHorizontalIcon className="size-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setRenaming(true)}>
            <PencilLineIcon /> Renombrar cliente
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setRemoving(true)}>
            <Trash2Icon /> Eliminar cliente
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {renaming && <ClientDialog client={client} onClose={() => setRenaming(false)} />}
      <AlertDialog open={removing} onOpenChange={(o) => !o && setRemoving(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar el cliente {client.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Solo se borra la carpeta. Sus proyectos siguen publicados con el mismo enlace y pasan a «Sin cliente».
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault()
                remove.mutate()
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/** "Nuevo cliente" button; opens the new folder once created. */
export function NewClientButton({ onCreated }: { onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="outline" className="h-10 rounded-full px-4" onClick={() => setOpen(true)}>
        <FolderPlusIcon /> Nuevo cliente
      </Button>
      {open && <ClientDialog onClose={() => setOpen(false)} onSaved={(c) => onCreated(c.id)} />}
    </>
  )
}

/** Create (no client) or rename a client. */
export function ClientDialog({ client, onClose, onSaved }: { client?: ClientRef; onClose: () => void; onSaved?: (c: ClientRef) => void }) {
  const [name, setName] = useState(client?.name ?? '')
  const refresh = useRefreshClients()
  const save = useMutation({
    mutationFn: () => (client ? api.renameClient(client.id, name.trim()) : api.createClient(name.trim())),
    onSuccess: (saved) => {
      refresh()
      toast.success(client ? 'Cliente renombrado' : `Cliente «${saved.name}» creado`)
      onSaved?.(saved)
      onClose()
    },
    onError: (err) => toast.error(err.message),
  })

  return (
    <Dialog open onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-xl">{client ? 'Renombrar cliente' : 'Nuevo cliente'}</DialogTitle>
          <DialogDescription>Agrupa sus enlaces en una carpeta del panel. No cambia ningún enlace.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim()) save.mutate()
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Nadro" maxLength={80} autoFocus />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!name.trim() || save.isPending}>
              {save.isPending ? 'Guardando…' : client ? 'Guardar' : 'Crear cliente'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const NONE = 'none'
const NEW = '__new'

/** Client select for the publish form; can create a client on the spot. */
export function ClientPicker({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const clients = useClients()
  const [creating, setCreating] = useState(false)
  return (
    <>
      <Select
        value={value ?? NONE}
        onValueChange={(v) => {
          if (v === NEW) setCreating(true)
          else onChange(v === NONE ? null : v)
        }}
      >
        <SelectTrigger className="h-10! w-full" aria-label="Cliente">
          <span className="flex items-center gap-2">
            <FolderIcon className="size-4 text-muted-foreground" />
            <SelectValue />
          </span>
        </SelectTrigger>
        <SelectContent>
          {clients.data?.items.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
          <SelectItem value={NONE}>Sin cliente</SelectItem>
          <SelectSeparator />
          <SelectItem value={NEW}>+ Nuevo cliente…</SelectItem>
        </SelectContent>
      </Select>
      {creating && <ClientDialog onClose={() => setCreating(false)} onSaved={(c) => onChange(c.id)} />}
    </>
  )
}

/** "Mover a cliente" submenu for a project's menu or the bulk bar. */
export function MoveToClientMenu({
  current,
  onMove,
}: {
  current?: string | null
  onMove: (clientId: string | null, name: string) => void
}) {
  const clients = useClients()
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <FolderInputIcon /> Mover a cliente
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-80 overflow-y-auto">
        {clients.data?.items.map((c) => (
          <DropdownMenuItem key={c.id} disabled={current === c.id} onClick={() => onMove(c.id, c.name)}>
            {current === c.id ? <CheckIcon /> : <FolderIcon />} {c.name}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={current === null} onClick={() => onMove(null, 'Sin cliente')}>
          {current === null ? <CheckIcon /> : <FolderIcon />} Sin cliente
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
