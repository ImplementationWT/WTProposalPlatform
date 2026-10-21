import { ZapIcon } from 'lucide-react'
import { useState } from 'react'
import { ProjectsPanel } from '@/components/projects-panel'
import { UploadDialog, type Source } from '@/components/upload-dialog'
import { useAppConfig } from '@/lib/hooks'

function App() {
  const [upload, setUpload] = useState<Source | null>(null)
  const { data: config } = useAppConfig()

  return (
    <div className="min-h-svh bg-muted/40 pb-16">
      <header className="mx-auto max-w-7xl px-4 pt-4">
        <div className="flex h-16 items-center justify-between rounded-2xl bg-card px-6 shadow-xs">
          <a href="/" className="flex items-center gap-1 text-xl font-semibold tracking-tight">
            <ZapIcon className="size-5 fill-violet-600 text-violet-600" />
            propuestas<span className="text-muted-foreground">.host</span>
          </a>
          {config && (
            <span className="hidden text-sm text-muted-foreground sm:block">
              Sitios en <span className="font-medium text-foreground">nombre{config.sitesSuffix}</span>
            </span>
          )}
        </div>
      </header>

      <main className="mx-auto mt-12 max-w-5xl px-4">
        <h1 className="mb-10 text-2xl font-semibold">Mis proyectos</h1>
        <ProjectsPanel onUpload={setUpload} />
      </main>

      {upload && <UploadDialog initialSource={upload} onClose={() => setUpload(null)} />}
    </div>
  )
}

export default App
