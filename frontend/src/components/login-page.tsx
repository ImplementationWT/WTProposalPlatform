import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2Icon, ZapIcon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'

export function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const queryClient = useQueryClient()

  const login = useMutation({
    mutationFn: () => api.login(username, password),
    onSuccess: (session) => queryClient.setQueryData(['session'], session),
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    login.mutate()
  }

  return (
    <div className="grid min-h-svh place-items-center bg-muted/40 px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-6 rounded-2xl border bg-card p-8 shadow-xs">
        <div className="flex items-center justify-center gap-1 text-xl font-semibold tracking-tight">
          <ZapIcon className="size-5 fill-violet-600 text-violet-600" />
          propuestas<span className="text-muted-foreground">.host</span>
        </div>
        <div className="space-y-2">
          <Label htmlFor="username">Usuario</Label>
          <Input id="username" autoComplete="username" autoFocus required value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Contraseña</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {login.error && <p className="text-sm text-destructive">{login.error.message}</p>}
        <Button type="submit" className="w-full" disabled={login.isPending}>
          {login.isPending && <Loader2Icon className="animate-spin" />}
          Entrar
        </Button>
      </form>
    </div>
  )
}
