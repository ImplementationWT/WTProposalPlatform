import { CheckIcon, Loader2Icon, XIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useAppConfig } from '@/lib/hooks'
import { cn } from '@/lib/utils'

interface Props {
  value: string
  onChange: (value: string) => void
  status: { available?: boolean; reason?: string; checking: boolean }
  showStatus: boolean
  autoFocus?: boolean
}

/** "link-name" input with the sites domain as a suffix, like the subdomain picker of the reference. */
export function NameField({ value, onChange, status, showStatus, autoFocus }: Props) {
  const { data: config } = useAppConfig()
  const invalid = showStatus && !status.checking && status.available === false

  return (
    <div className="space-y-1.5">
      <div
        className={cn(
          'flex h-11 overflow-hidden rounded-lg border bg-background focus-within:ring-3 focus-within:ring-ring/30',
          invalid && 'border-destructive focus-within:ring-destructive/20',
        )}
      >
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
          placeholder="nombre-del-enlace"
          autoFocus={autoFocus}
          spellCheck={false}
          aria-label="Nombre del enlace"
          aria-invalid={invalid}
          className="h-full flex-1 rounded-none border-0 px-3 shadow-none focus-visible:ring-0"
        />
        <span className="flex shrink-0 items-center bg-primary px-3 text-sm font-medium text-primary-foreground">
          {config?.sitesSuffix ?? '…'}
        </span>
      </div>
      <p className="flex h-4 items-center gap-1 text-xs" aria-live="polite">
        {showStatus && status.checking && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Loader2Icon className="size-3 animate-spin" /> Comprobando…
          </span>
        )}
        {showStatus && !status.checking && status.available && (
          <span className="flex items-center gap-1 text-emerald-400">
            <CheckIcon className="size-3" /> Disponible
          </span>
        )}
        {invalid && (
          <span className="flex items-center gap-1 text-destructive">
            <XIcon className="size-3" /> {status.reason}
          </span>
        )}
      </p>
    </div>
  )
}
