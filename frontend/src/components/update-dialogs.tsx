import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRightIcon, FileIcon, Loader2Icon, PencilLineIcon, PlusIcon, SettingsIcon, UploadIcon, XIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CodeEditor } from '@/components/lazy'
import { Dropzone } from '@/components/dropzone'
import { NameField } from '@/components/name-field'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { api, type Project } from '@/lib/api'
import { formatBytes, isHtmlFile, isTextFile } from '@/lib/format'
import { useNameAvailability } from '@/lib/hooks'
import { cn } from '@/lib/utils'

export type UpdateView = 'files' | 'customize' | 'edit'

interface DialogProps {
  project: Project
  onClose: () => void
}

function useProjectMutation<T>(fn: (vars: T) => Promise<Project>, success: string, onDone?: () => void) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      toast.success(success)
      onDone?.()
    },
    onError: (err) => toast.error(err.message),
  })
}

/** "Update" menu with the three paths of the reference. */
export function UpdateChooser({ project, onClose, onPick }: DialogProps & { onPick: (view: UpdateView) => void }) {
  const options = [
    { view: 'files', icon: UploadIcon, title: 'Actualizar archivos', text: 'Reemplaza o añade archivos a este proyecto' },
    { view: 'customize', icon: SettingsIcon, title: 'Personalizar proyecto', text: 'Cambia el enlace, el acceso y la página de inicio' },
    { view: 'edit', icon: PencilLineIcon, title: 'Editar HTML', text: 'Modifica el HTML, CSS o JS de tu sitio' },
  ] as const

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="items-center text-center">
          <DialogTitle className="text-2xl">Actualizar</DialogTitle>
          <DialogDescription className="text-foreground">{project.url.replace(/^https?:\/\//, '')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {options.map(({ view, icon: Icon, title, text }) => (
            <button
              key={view}
              type="button"
              onClick={() => onPick(view)}
              className="flex w-full items-center gap-4 rounded-xl border p-5 text-left transition-colors hover:bg-muted/60"
            >
              <Icon className="size-6 shrink-0" strokeWidth={1.5} />
              <span className="flex-1">
                <span className="block font-semibold">{title}</span>
                <span className="block text-sm text-muted-foreground">{text}</span>
              </span>
              <ChevronRightIcon className="size-5" />
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function UpdateFilesDialog({ project, onClose }: DialogProps) {
  const [pending, setPending] = useState<{ mode: 'replace' | 'add'; files: File[] } | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const save = useProjectMutation(
    () => api.uploadFiles(project.id, pending!.mode, pending!.files, setProgress),
    'Archivos actualizados',
    onClose,
  )

  return (
    <Dialog open onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Actualizar archivos</DialogTitle>
          <DialogDescription>{project.url.replace(/^https?:\/\//, '')}</DialogDescription>
        </DialogHeader>

        {pending ? (
          <div className="space-y-2 rounded-xl border bg-muted/30 p-4">
            <p className="text-sm font-medium">
              {pending.mode === 'replace' ? 'Se reemplazarán todos los archivos por:' : 'Se añadirán (o sobrescribirán):'}
            </p>
            <ul className="max-h-40 space-y-1 overflow-auto">
              {pending.files.map((f) => (
                <li key={f.name} className="flex items-center gap-2 text-sm">
                  <FileIcon className="size-4 text-primary" />
                  <span className="truncate">{f.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{formatBytes(f.size)}</span>
                </li>
              ))}
            </ul>
            <Button variant="ghost" size="sm" onClick={() => setPending(null)} disabled={save.isPending}>
              <XIcon /> Cancelar selección
            </Button>
          </div>
        ) : (
          <>
            <Dropzone onFiles={(files) => setPending({ mode: 'replace', files })} className="p-0">
              {(open) => (
                <button type="button" onClick={open} className="group relative w-full p-4 text-left">
                  <ul className="max-h-36 space-y-1 overflow-auto opacity-40 blur-[1px] transition group-hover:opacity-20">
                    {project.files.slice(0, 6).map((f) => (
                      <li key={f.path} className="flex items-center gap-2 text-sm">
                        <FileIcon className="size-4" />
                        <span className="truncate">{f.path}</span>
                        {f.path === project.homepage && <Badge variant="secondary">Inicio</Badge>}
                      </li>
                    ))}
                  </ul>
                  <span className="absolute inset-0 flex items-center justify-center gap-2 text-lg font-semibold">
                    <UploadIcon className="size-5" /> Reemplazar archivo
                  </span>
                </button>
              )}
            </Dropzone>
            <Dropzone multiple onFiles={(files) => setPending({ mode: 'add', files })} className="border-solid border-border bg-transparent">
              {(open) => (
                <button type="button" onClick={open} className="flex h-10 w-full items-center justify-center gap-2 text-sm">
                  <PlusIcon className="size-4" /> Añadir más archivos
                </button>
              )}
            </Dropzone>
            <p className="text-xs text-muted-foreground">
              {project.files.length} archivo(s) · {formatBytes(project.totalSize)}. Un .zip se descomprime y reemplaza todo el sitio.
            </p>
          </>
        )}

        <Button className="h-11 w-full text-[15px] font-semibold" disabled={!pending || save.isPending} onClick={() => save.mutate(undefined)}>
          {save.isPending ? (progress !== null && progress < 1 ? `Subiendo ${Math.round(progress * 100)}%` : 'Publicando…') : 'Publicar'}
        </Button>
      </DialogContent>
    </Dialog>
  )
}

export function CustomizeDialog({ project, onClose }: DialogProps) {
  const [name, setName] = useState(project.name)
  const [mode, setMode] = useState(project.access.mode)
  const [password, setPassword] = useState('')
  const [homepage, setHomepage] = useState(project.homepage)
  const unchanged = name === project.name
  const availability = useNameAvailability(name, project.id, unchanged)

  // Switching to password needs one; keeping an existing password does not.
  const needsPassword = mode === 'password' && project.access.mode !== 'password'
  const passwordOk = !needsPassword || password.length >= 4
  const homepageOptions = project.files.filter((f) => isHtmlFile(f.path) || f.path === project.homepage)

  const save = useProjectMutation(
    () =>
      api.update(project.id, {
        ...(unchanged ? {} : { name }),
        homepage,
        access: mode === 'public' ? { mode } : { mode, ...(password ? { password } : {}) },
      }),
    'Proyecto actualizado',
    onClose,
  )

  return (
    <Dialog open onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl">Personalizar proyecto</DialogTitle>
          <DialogDescription>Cambiar el enlace deja de servir la dirección anterior.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault()
            if (availability.ready && passwordOk) save.mutate(undefined)
          }}
        >
          <div className="space-y-2">
            <Label>Enlace</Label>
            <NameField value={name} onChange={setName} status={availability} showStatus={!unchanged} />
          </div>

          <div className="space-y-2">
            <Label>Acceso</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Público (sin restricciones)</SelectItem>
                <SelectItem value="password">Protegido con contraseña</SelectItem>
              </SelectContent>
            </Select>
            {mode === 'password' && (
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={project.access.mode === 'password' ? 'Nueva contraseña (vacío = mantener la actual)' : 'Contraseña (mín. 4 caracteres)'}
                autoComplete="new-password"
              />
            )}
          </div>

          <div className="space-y-2">
            <Label>Página de inicio</Label>
            <Select value={homepage} onValueChange={setHomepage}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {homepageOptions.map((f) => (
                  <SelectItem key={f.path} value={f.path}>
                    {f.path}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!availability.ready || !passwordOk || save.isPending}>
              {save.isPending ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function EditHtmlDialog({ project, onClose }: DialogProps) {
  const queryClient = useQueryClient()
  const editable = project.files.filter((f) => isTextFile(f.path))
  const [path, setPath] = useState(editable.some((f) => f.path === project.homepage) ? project.homepage : editable[0]?.path)
  const [draft, setDraft] = useState<string | null>(null)

  const file = useQuery({
    queryKey: ['file', project.id, path],
    queryFn: () => api.readFile(project.id, path!),
    enabled: !!path,
    staleTime: 0,
    gcTime: 0,
  })
  const content = draft ?? file.data?.content ?? ''
  const dirty = draft !== null && draft !== file.data?.content

  const save = useMutation({
    mutationFn: () => api.writeFile(project.id, path!, content),
    onSuccess: () => {
      queryClient.setQueryData(['file', project.id, path], { path, content })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setDraft(null)
      toast.success('Cambios publicados')
    },
    onError: (err) => toast.error(err.message),
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (dirty && !save.isPending) save.mutate()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dirty, save])

  const switchTo = (next: string) => {
    if (dirty && !confirm('Tienes cambios sin guardar. ¿Descartarlos?')) return
    setDraft(null)
    setPath(next)
  }

  const close = () => {
    if (dirty && !confirm('Tienes cambios sin guardar. ¿Cerrar de todos modos?')) return
    onClose()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="flex h-[85vh] flex-col gap-3 sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Editar HTML</DialogTitle>
          <DialogDescription>{project.url.replace(/^https?:\/\//, '')} · Ctrl/⌘ + S para guardar</DialogDescription>
        </DialogHeader>

        {editable.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Este proyecto no tiene archivos de texto editables.</p>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row">
            <ul className="flex shrink-0 gap-1 overflow-auto md:w-56 md:flex-col">
              {editable.map((f) => (
                <li key={f.path}>
                  <button
                    type="button"
                    onClick={() => switchTo(f.path)}
                    className={cn(
                      'w-full truncate rounded-md px-2 py-1.5 text-left text-sm whitespace-nowrap',
                      f.path === path ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/50',
                    )}
                    title={f.path}
                  >
                    {f.path}
                  </button>
                </li>
              ))}
            </ul>
            <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border">
              {file.isLoading ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : file.isError ? (
                <p className="p-6 text-sm text-destructive">{file.error.message}</p>
              ) : (
                <CodeEditor key={path} path={path} value={content} onChange={setDraft} className="h-full [&_.cm-editor]:h-full" />
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <span className="mr-auto self-center text-xs text-muted-foreground">{dirty ? 'Cambios sin guardar' : ''}</span>
          <Button variant="outline" onClick={close}>
            Cerrar
          </Button>
          <Button disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Publicando…' : 'Guardar y publicar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
