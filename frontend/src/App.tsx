import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LogOutIcon, ZapIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { LoginPage } from '@/components/login-page'
import { ProjectsPanel } from '@/components/projects-panel'
import { Button } from '@/components/ui/button'
import { UploadDialog, type Source } from '@/components/upload-dialog'
import { api, onUnauthorized } from '@/lib/api'
import { useAppConfig } from '@/lib/hooks'

function App() {
  const queryClient = useQueryClient()
  const session = useQuery({ queryKey: ['session'], queryFn: api.session, staleTime: Infinity, retry: false })

  // An expired session on any request sends the user back to the login form.
  useEffect(() => onUnauthorized(() => queryClient.setQueryData(['session'], null)), [queryClient])

  if (session.isPending) return null
  if (!session.data) return <LoginPage />
  return <Panel />
}

function Panel() {
  const [upload, setUpload] = useState<Source | null>(null)
  const { data: config } = useAppConfig()
  const queryClient = useQueryClient()

  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      queryClient.clear()
      queryClient.setQueryData(['session'], null)
    },
  })

  return (
    <div className="min-h-svh bg-muted/40 pb-16">
      <header className="mx-auto max-w-7xl px-4 pt-4">
        <div className="flex h-16 items-center justify-between gap-4 rounded-2xl bg-card px-6 shadow-xs">
          <a href="/" className="flex items-center gap-1 text-xl font-semibold tracking-tight">
            <ZapIcon className="size-5 fill-violet-600 text-violet-600" />
            propuestas<span className="text-muted-foreground">.host</span>
          </a>
          <div className="flex items-center gap-4">
            {config && (
              <span className="hidden text-sm text-muted-foreground sm:block">
                Sitios en <span className="font-medium text-foreground">nombre{config.sitesSuffix}</span>
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={() => logout.mutate()} disabled={logout.isPending}>
              <LogOutIcon /> Salir
            </Button>
          </div>
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
