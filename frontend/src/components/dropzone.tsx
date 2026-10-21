import { FileArchiveIcon, FileUpIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  onFiles: (files: File[]) => void
  multiple?: boolean
  className?: string
  children: (open: () => void) => ReactNode
}

/** Dashed drag & drop area; `children` receives a function that opens the file picker. */
export function Dropzone({ onFiles, multiple, className, children }: Props) {
  const [input, setInput] = useState<HTMLInputElement | null>(null)
  const [over, setOver] = useState(false)
  const openPicker = () => input?.click()

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const files = [...e.dataTransfer.files]
        if (files.length) onFiles(multiple ? files : files.slice(0, 1))
      }}
      className={cn(
        'rounded-xl border-2 border-dashed border-fuchsia-300 bg-muted/40 transition-colors dark:border-fuchsia-500/50',
        over && 'border-primary bg-primary/5',
        className,
      )}
    >
      <input
        ref={setInput}
        type="file"
        multiple={multiple}
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])]
          e.target.value = ''
          if (files.length) onFiles(files)
        }}
      />
      {children(openPicker)}
    </div>
  )
}

export function DropzoneIcons() {
  return (
    <div className="flex items-center justify-center gap-3 text-muted-foreground">
      <FileArchiveIcon className="size-7" strokeWidth={1.5} />
      <span className="h-8 w-px bg-border" />
      <FileUpIcon className="size-7" strokeWidth={1.5} />
    </div>
  )
}
