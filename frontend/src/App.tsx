import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LogOutIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Eyebrow, Logo } from '@/components/brand'
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
    <div className="min-h-svh pb-28">
      <header data-surface className="sticky top-0 z-20 border-b bg-background/70 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <a href="/" className="flex items-center gap-4">
            <Logo />
            <span className="hidden h-6 w-px bg-border sm:block" />
            <span className="hidden text-sm text-muted-foreground sm:block">Propuestas</span>
          </a>
          <div className="flex items-center gap-4">
            {config && (
              <span className="hidden text-sm text-muted-foreground sm:block">
                Sitios en <span className="font-medium text-foreground">nombre{config.sitesSuffix}</span>
              </span>
            )}
            <Button variant="outline" size="sm" className="px-3" onClick={() => logout.mutate()} disabled={logout.isPending}>
              <LogOutIcon /> Salir
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto mt-14 max-w-5xl px-4">
        {/* Will Doo keeps clear of the heading */}
        <div data-robot-avoid className="w-fit">
          <Eyebrow>Whatever Tech</Eyebrow>
          <h1 className="mt-4 mb-3 text-4xl leading-[1.05] font-extrabold tracking-tight sm:text-5xl">
            Tus propuestas, <span className="text-brand">publicadas.</span>
          </h1>
          <p className="mb-12 max-w-xl text-muted-foreground">
            Sube el HTML de cada propuesta y compártela en su propio subdominio, con estadísticas de visitas y acceso privado.
          </p>
        </div>
        <ProjectsPanel onUpload={setUpload} />
      </main>

      {upload && <UploadDialog initialSource={upload} onClose={() => setUpload(null)} />}
    </div>
  )
}

export default App
