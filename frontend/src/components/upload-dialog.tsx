import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2Icon,
  CodeXmlIcon,
  CopyIcon,
  ExternalLinkIcon,
  FileIcon,
  Loader2Icon,
  TriangleAlertIcon,
  UploadIcon,
  XIcon,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { CodeEditor } from '@/components/lazy'
import { Dropzone, DropzoneIcons } from '@/components/dropzone'
import { NameField } from '@/components/name-field'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { api, type Project } from '@/lib/api'
import { formatBytes, slugify } from '@/lib/format'
import { useAppConfig, useNameAvailability } from '@/lib/hooks'
import { cn } from '@/lib/utils'

const EXAMPLE_HTML = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Mi proyecto</title>
  <style>
    body { margin: 0; font-family: system-ui, sans-serif; background: linear-gradient(135deg, #6d28d9, #2563eb); color: #fff; min-height: 100vh; display: grid; place-items: center; }
    main { text-align: center; padding: 24px; }
    h1 { font-size: clamp(2rem, 6vw, 3.5rem); margin: 0 0 12px; }
  </style>
</head>
<body>
  <main>
    <h1>¡Hola! 👋</h1>
    <p>Este sitio se publicó en segundos. Edita este HTML cuando quieras.</p>
  </main>
</body>
</html>
`

export type Source = 'file' | 'code'

export function UploadDialog({ initialSource, onClose }: { initialSource: Source; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { data: config } = useAppConfig()
  const [name, setName] = useState('')
  const [source, setSource] = useState<Source>(initialSource)
  const [file, setFile] = useState<File | null>(null)
  const [code, setCode] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const [published, setPublished] = useState<Project | null>(null)
  const availability = useNameAvailability(name)

  const publish = useMutation({
    mutationFn: () =>
      api.create(
        source === 'file' ? { name: name.trim(), files: file ? [file] : [] } : { name: name.trim(), html: code },
        setProgress,
      ),
    onSuccess: (project) => {
      setPublished(project)
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
    onError: (err) => toast.error(err.message),
    onSettled: () => setProgress(null),
  })

  const pickFile = (f: File) => {
    if (config && f.size > config.maxUploadMb * 1024 * 1024) {
      toast.error(`El archivo supera ${config.maxUploadMb} MB`)
      return
    }
    setFile(f)
    if (!name) setName(slugify(f.name))
  }

  const hasContent = source === 'file' ? !!file : code.trim().length > 0
  const canPublish = hasContent && availability.ready && !publish.isPending

  return (
    <Dialog open onOpenChange={(o) => !o && !publish.isPending && onClose()}>
      <DialogContent className="gap-4 sm:max-w-xl" showCloseButton={!!published}>
        <DialogTitle className="sr-only">Publicar un sitio</DialogTitle>
        <DialogDescription className="sr-only">Sube un archivo .zip, un archivo suelto o pega código HTML.</DialogDescription>

        {published ? (
          <PublishedView project={published} onDone={onClose} />
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (canPublish) publish.mutate()
            }}
          >
            <NameField value={name} onChange={setName} status={availability} showStatus={name.length > 0} autoFocus />

            <div className="grid grid-cols-2 overflow-hidden rounded-lg border" role="tablist">
              {(
                [
                  { id: 'file', label: 'Subir archivo', icon: UploadIcon },
                  { id: 'code', label: 'Pegar código', icon: CodeXmlIcon },
                ] as const
              ).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={source === id}
                  onClick={() => setSource(id)}
                  className={cn(
                    'flex h-10 items-center justify-center gap-2 text-sm transition-colors not-first:border-l',
                    source === id ? 'bg-brand/15 font-medium text-brand' : 'text-muted-foreground hover:bg-brand/10 hover:text-foreground',
                  )}
                >
                  <Icon className="size-4" /> {label}
                </button>
              ))}
            </div>

            {source === 'file' ? (
              <Dropzone onFiles={([f]) => pickFile(f)} className="flex min-h-72 flex-col items-center justify-center gap-4 p-6">
                {(openPicker) =>
                  file ? (
                    <div className="flex w-full max-w-sm items-center gap-3 rounded-lg border bg-background p-3">
                      <FileIcon className="size-8 shrink-0 text-primary" strokeWidth={1.5} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{file.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatBytes(file.size)} · {/\.zip$/i.test(file.name) ? 'se descomprimirá al publicar' : 'archivo único'}
                        </p>
                      </div>
                      <Button type="button" variant="ghost" size="icon-sm" onClick={() => setFile(null)} aria-label="Quitar archivo">
                        <XIcon />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <DropzoneIcons />
                      <p className="text-center text-sm text-muted-foreground">
                        Arrastra y suelta un .zip
                        <br />o un archivo aquí
                      </p>
                      <Button
                        type="button"
                        onClick={openPicker}
                        className="h-10 w-48 text-[15px] font-semibold"
                      >
                        Subir archivo
                      </Button>
                      <p className="text-sm">
                        o usa un{' '}
                        <button
                          type="button"
                          className="underline underline-offset-2 hover:text-primary"
                          onClick={() => {
                            pickFile(new File([EXAMPLE_HTML], 'index.html', { type: 'text/html' }))
                            if (!name) setName(`ejemplo-${Math.random().toString(36).slice(2, 7)}`)
                          }}
                        >
                          ejemplo
                        </button>
                      </p>
                    </>
                  )
                }
              </Dropzone>
            ) : (
              <div className="h-72 overflow-hidden rounded-xl border">
                <CodeEditor value={code} onChange={setCode} height="288px" />
              </div>
            )}

            <Button type="submit" disabled={!canPublish} className="relative h-11 w-full overflow-hidden text-[15px] font-semibold tracking-wide">
              {progress !== null && (
                <span className="absolute inset-y-0 left-0 bg-white/20 transition-[width]" style={{ width: `${progress * 100}%` }} />
              )}
              <span className="relative">
                {publish.isPending ? (progress !== null && progress < 1 ? `SUBIENDO ${Math.round(progress * 100)}%` : 'PUBLICANDO…') : 'PUBLICAR'}
              </span>
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function PublishedView({ project: created, onDone }: { project: Project; onDone: () => void }) {
  // The subdomain's certificate is issued after publishing: follow it until it is ready.
  const live = useQuery({
    queryKey: ['projects', 'live', ''],
    queryFn: () => api.list('live', ''),
    enabled: created.domain === 'pending',
    refetchInterval: (query) => (query.state.data?.items.find((p) => p.id === created.id)?.domain === 'pending' ? 2000 : false),
  })
  const project = live.data?.items.find((p) => p.id === created.id) ?? created

  if (project.domain === 'pending') {
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <Loader2Icon className="size-12 animate-spin text-muted-foreground" />
        <div>
          <h2 className="text-lg font-semibold">Activando tu sitio…</h2>
          <p className="text-sm text-muted-foreground">Estamos preparando el HTTPS de {project.url.replace(/^https?:\/\//, '')}. Tarda unos segundos.</p>
        </div>
      </div>
    )
  }
  if (project.domain === 'error') {
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center">
        <TriangleAlertIcon className="size-12 text-destructive" />
        <div>
          <h2 className="text-lg font-semibold">Los archivos se guardaron, pero el subdominio no se pudo activar</h2>
          <p className="text-sm text-muted-foreground">Revisa los registros del servidor; se reintenta al reiniciarlo.</p>
        </div>
        <Button onClick={onDone}>Cerrar</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4 py-4 text-center">
      <CheckCircle2Icon className="size-12 text-emerald-400" />
      <div>
        <h2 className="text-lg font-semibold">¡Tu sitio está publicado!</h2>
        <p className="text-sm text-muted-foreground">Ya puedes compartir el enlace.</p>
      </div>
      <a href={project.url} target="_blank" rel="noreferrer" className="break-all text-brand underline underline-offset-4">
        {project.url.replace(/^https?:\/\//, '')}
      </a>
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() => {
            navigator.clipboard.writeText(project.url)
            toast.success('Enlace copiado')
          }}
        >
          <CopyIcon /> Copiar enlace
        </Button>
        <Button asChild variant="outline">
          <a href={project.url} target="_blank" rel="noreferrer">
            <ExternalLinkIcon /> Abrir
          </a>
        </Button>
        <Button onClick={onDone}>Listo</Button>
      </div>
    </div>
  )
}
