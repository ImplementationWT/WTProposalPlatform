import { CheckIcon, CopyIcon, EyeIcon, EyeOffIcon, RefreshCwIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

// No look-alike characters (0/O, 1/l/I), so it can be dictated or typed from a screenshot.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const LENGTH = 12

/** Random password from the browser's secure generator (unbiased: out-of-range bytes are skipped). */
function randomPassword(): string {
  let out = ''
  const limit = 256 - (256 % ALPHABET.length)
  while (out.length < LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(LENGTH * 2))) {
      if (byte < limit && out.length < LENGTH) out += ALPHABET[byte % ALPHABET.length]
    }
  }
  return out
}

/**
 * Password input for a private link, with "generate", show/hide and copy. Only a hash is stored on
 * the server, so a generated password is shown and copied right away: it can't be seen again later.
 */
export function PasswordField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [visible, setVisible] = useState(false)
  const [copied, setCopied] = useState(false)

  const copy = async (text = value) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      return false
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
    return true
  }

  const generate = async () => {
    const password = randomPassword()
    onChange(password)
    setVisible(true)
    toast.success((await copy(password)) ? 'Contraseña generada y copiada' : 'Contraseña generada', {
      description: 'Guárdala o compártela ahora: después no se puede volver a ver.',
    })
  }

  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="new-password"
          spellCheck={false}
          className="pr-18 font-mono"
        />
        <div className="absolute inset-y-0 right-1 flex items-center">
          <FieldIcon label={visible ? 'Ocultar' : 'Mostrar'} onClick={() => setVisible((v) => !v)}>
            {visible ? <EyeOffIcon /> : <EyeIcon />}
          </FieldIcon>
          {value && (
            <FieldIcon label={copied ? '¡Copiada!' : 'Copiar'} onClick={() => copy()}>
              {copied ? <CheckIcon className="text-emerald-400" /> : <CopyIcon />}
            </FieldIcon>
          )}
        </div>
      </div>
      <Button type="button" variant="outline" onClick={generate}>
        <RefreshCwIcon /> Generar
      </Button>
    </div>
  )
}

function FieldIcon({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={label} onClick={onClick} className="text-muted-foreground hover:text-foreground">
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
