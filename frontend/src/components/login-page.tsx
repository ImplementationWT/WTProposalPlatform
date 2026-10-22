import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2Icon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Eyebrow, Logo } from '@/components/brand'
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
    <div className="grid min-h-svh place-items-center px-4">
      <form data-surface onSubmit={submit} className="w-full max-w-sm space-y-6 rounded-3xl border bg-card p-8 shadow-2xl shadow-black/40 backdrop-blur">
        <Logo />
        <div className="space-y-2">
          <Eyebrow>Publicador de subdominios</Eyebrow>
          <h1 className="text-3xl font-extrabold tracking-tight">
            Bienvenido <span className="text-brand">de vuelta.</span>
          </h1>
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
        <Button type="submit" className="h-11 w-full text-[15px] font-semibold" disabled={login.isPending}>
          {login.isPending && <Loader2Icon className="animate-spin" />}
          Entrar
        </Button>
      </form>
    </div>
  )
}
